'use strict';

const fs = require('fs');
const path = require('path');
const { loadFacts, buildAllowlist, factsForPrompt, moneySetHas } = require('./facts');
const { buildAllowedClaims, isAbsoluteUpgrade, toSafeWording, toPlainDisplayText } = require('./allowed-claims');
const {
  assembleArticle,
  resolveClaimTokens,
  renderCitedClaim,
  buildSourcedClaims,
  mergeNonSourcedClaims,
  refreshAssemblyState,
  unwrapClaimTokenWrappers
} = require('./assemble');
const {
  validateGeneratedArticle,
  assertRevisionResolutions,
  stampProblems,
  splitSentences
} = require('./validate');
const { applySafetyFallback, collectSafetyRepairs } = require('./safety-fallback');
const { segmentMarkdownSentences, isMarkdownHeading } = require('./segments');
const {
  GENERATION_TOOL_NAME,
  REVISION_TOOL_NAME,
  GENERATION_INPUT_SCHEMA,
  REVISION_INPUT_SCHEMA,
  CLAIM_KIND_ENUM,
  extractAnthropicToolInput,
  validateToolInput,
  completeAnthropicStructured
} = require('./anthropic-structured');

const EDITORIAL_DIR = path.resolve(__dirname, '../../blogs/editorial');

let failed = 0;

function assert(name, condition, detail) {
  if (condition) {
    console.log(`PASS  ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ''}`);
}

function hasCode(problems, code) {
  return problems.some((item) => item.code === code);
}

function gbpPack() {
  return {
    needed: true,
    sources: [
      {
        id: 'S1',
        url: 'https://support.google.com/business/answer/7091?hl=en',
        title: 'Tips to improve your local ranking on Google',
        excerpt:
          'Local results are mainly based on relevance, distance, and popularity. Together, these factors help Google find the best match for customers searches. Businesses with complete and accurate info are more likely to show up in local search results.'
      }
    ]
  };
}

function adsPack() {
  return {
    needed: true,
    sources: [
      {
        id: 'S1',
        url: 'https://support.google.com/google-ads/answer/1722122',
        title: 'About Ad Rank',
        excerpt:
          'Google Ads uses Ad Rank to determine whether your ad is eligible to show and where it appears. Ad Rank is recalculated each time your ad is eligible to compete in an auction.'
      }
    ]
  };
}

function baseFields() {
  return {
    title: 'Why local businesses struggle to get found',
    slug: 'why-local-businesses-struggle-to-get-found',
    meta_title: 'Why local businesses struggle to get found',
    meta_description:
      'A practical look at the listing gaps that keep a local business from showing up, and what to fix before spending on ads.',
    excerpt: 'Most of the work is on the listing and the site, not on a new campaign.',
    category: 'SEO'
  };
}

function validGenerationPayload() {
  return {
    title: 'Why local businesses struggle to get found',
    slug: 'why-local-businesses-struggle-to-get-found',
    meta_title: 'Why local businesses struggle to get found',
    meta_description: 'A practical look at listing gaps that keep a local business from showing up.',
    excerpt: 'Most of the work is on the listing and the site, not on a new campaign.',
    category: 'SEO',
    body: '## Local ranking\n\nFix the listing first.\n',
    claims: [{ claim: 'Listings matter more than a new campaign.', kind: 'opinion' }],
    cta: {
      names_brandible: true,
      fit_case: 'If tracking is not in place, Brandible can set it up.',
      walk_away_case: 'If tracking is already in place, you may not need Brandible.'
    }
  };
}

function validRevisionPayload() {
  return {
    ...validGenerationPayload(),
    resolutions: [
      {
        failure_id: 'V9_QUANTIFIER_1',
        action: 'deleted',
        resulting_sentence: 'deleted'
      }
    ]
  };
}

function markdownSegmentFixtures() {
  const headingUnits = segmentMarkdownSentences(
    [
      'That depends on what the site actually has.',
      '',
      '### No Reviews',
      '',
      '[Prominence means how well-known a business is.](https://support.google.com/business/answer/7091?hl=en)'
    ].join('\n')
  );
  assert(
    'commentary before ### is its own sentence',
    headingUnits[0] === 'That depends on what the site actually has.',
    JSON.stringify(headingUnits)
  );
  assert(
    '### heading is its own unit',
    headingUnits[1] === '### No Reviews' && isMarkdownHeading(headingUnits[1]),
    JSON.stringify(headingUnits)
  );
  assert(
    'canonical citation beginning with [ is its own unit',
    headingUnits[2] ===
      '[Prominence means how well-known a business is.](https://support.google.com/business/answer/7091?hl=en)' &&
      headingUnits.length === 3,
    JSON.stringify(headingUnits)
  );

  const adjacentUnits = segmentMarkdownSentences(
    [
      'That depends on what the site actually has.',
      '### No Reviews',
      '[Prominence means how well-known a business is.](https://support.google.com/business/answer/7091?hl=en)'
    ].join('\n')
  );
  assert(
    'headings stay separate from adjacent prose without blank lines',
    adjacentUnits.length === 3 &&
      adjacentUnits[0] === 'That depends on what the site actually has.' &&
      adjacentUnits[1] === '### No Reviews' &&
      adjacentUnits[2].startsWith('[Prominence means'),
    JSON.stringify(adjacentUnits)
  );

  const proseUnits = segmentMarkdownSentences(
    'Sentence one. Sentence two. [Approved fact](https://example.com/fact). Sentence four.'
  );
  assert(
    'ordinary multi-sentence paragraphs still segment correctly',
    proseUnits.length === 4 &&
      proseUnits[0] === 'Sentence one.' &&
      proseUnits[1] === 'Sentence two.' &&
      proseUnits[2] === '[Approved fact](https://example.com/fact).' &&
      proseUnits[3] === 'Sentence four.',
    JSON.stringify(proseUnits)
  );

  const validateSrc = fs.readFileSync(path.join(__dirname, 'validate.js'), 'utf8');
  const fallbackSrc = fs.readFileSync(path.join(__dirname, 'safety-fallback.js'), 'utf8');
  assert(
    'validator and fallback use the shared Markdown segmenter',
    /require\('\.\/segments'\)/.test(validateSrc) &&
      /require\('\.\/segments'\)/.test(fallbackSrc) &&
      !/function splitSentences/.test(validateSrc) &&
      !/function splitSentences/.test(fallbackSrc)
  );
}

async function structuredOutputFixtures() {
  const validInput = validGenerationPayload();
  const malformedText =
    '{"title": "broken", "body": "Expected \',\' or \'}\' after property value in JSON at position 1663"';

  const mixedPayload = {
    content: [
      { type: 'text', text: malformedText },
      { type: 'tool_use', name: GENERATION_TOOL_NAME, input: validInput }
    ]
  };
  const mixed = extractAnthropicToolInput(mixedPayload, GENERATION_TOOL_NAME);
  assert(
    'malformed free-form text is ignored when tool_use is present',
    mixed.ok === true && mixed.input === validInput,
    JSON.stringify(mixed)
  );

  const correct = extractAnthropicToolInput(
    {
      content: [{ type: 'tool_use', name: GENERATION_TOOL_NAME, input: validInput }]
    },
    GENERATION_TOOL_NAME
  );
  assert(
    'correct tool name with valid object succeeds',
    correct.ok === true && correct.input === validInput,
    JSON.stringify(correct)
  );

  const missing = extractAnthropicToolInput(
    { content: [{ type: 'text', text: malformedText }] },
    GENERATION_TOOL_NAME
  );
  assert(
    'missing tool_use fails clearly',
    missing.ok === false && /submit_blog_draft/.test(missing.error),
    JSON.stringify(missing)
  );

  const wrongName = extractAnthropicToolInput(
    {
      content: [
        { type: 'text', text: malformedText },
        { type: 'tool_use', name: GENERATION_TOOL_NAME, input: validInput }
      ]
    },
    REVISION_TOOL_NAME
  );
  assert(
    'wrong tool name fails clearly',
    wrongName.ok === false && /submit_blog_revision/.test(wrongName.error),
    JSON.stringify(wrongName)
  );

  assert(
    'generation schema does not permit sourced_fact',
    !CLAIM_KIND_ENUM.includes('sourced_fact') &&
      !(GENERATION_INPUT_SCHEMA.properties.claims.items.properties.kind.enum || []).includes('sourced_fact')
  );
  const sourcedFactErrors = validateToolInput(
    {
      ...validInput,
      claims: [{ claim: 'Primary category is one of the most important ranking factors.', kind: 'sourced_fact' }]
    },
    GENERATION_INPUT_SCHEMA
  );
  assert(
    'generation schema rejects sourced_fact',
    sourcedFactErrors.some((item) => /kind/.test(item) && /sourced_fact|first_party|hypothetical|opinion/.test(item)),
    sourcedFactErrors.join(' | ')
  );

  assert(
    'revision schema requires resolutions',
    (REVISION_INPUT_SCHEMA.required || []).includes('resolutions')
  );
  const missingResolutions = validateToolInput(validGenerationPayload(), REVISION_INPUT_SCHEMA);
  assert(
    'revision schema rejects a payload without resolutions',
    missingResolutions.some((item) => /resolutions is required/.test(item)),
    missingResolutions.join(' | ')
  );
  const validRevisionErrors = validateToolInput(validRevisionPayload(), REVISION_INPUT_SCHEMA);
  assert(
    'revision schema accepts a complete revision payload',
    validRevisionErrors.length === 0,
    validRevisionErrors.join(' | ')
  );

  const previousFetch = global.fetch;
  let capturedBody = null;
  global.fetch = async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => mixedPayload
    };
  };
  try {
    const structured = await completeAnthropicStructured({
      model: 'claude-test',
      apiKey: 'test-key',
      prompt: 'Return the draft.',
      toolName: GENERATION_TOOL_NAME,
      inputSchema: GENERATION_INPUT_SCHEMA
    });
    assert(
      'completeAnthropicStructured uses tool_use.input and ignores malformed text',
      structured === validInput,
      JSON.stringify(structured)
    );
    assert(
      'completeAnthropicStructured forces strict tool_choice',
      capturedBody &&
        capturedBody.tools &&
        capturedBody.tools[0] &&
        capturedBody.tools[0].strict === true &&
        capturedBody.tool_choice &&
        capturedBody.tool_choice.type === 'tool' &&
        capturedBody.tool_choice.name === GENERATION_TOOL_NAME,
      JSON.stringify(capturedBody && { tools: capturedBody.tools, tool_choice: capturedBody.tool_choice })
    );
  } finally {
    global.fetch = previousFetch;
  }

  const draftSrc = fs.readFileSync(path.join(__dirname, '../draft-blog.js'), 'utf8');
  const completeArticleSrc = draftSrc.slice(
    draftSrc.indexOf('async function completeArticle'),
    draftSrc.indexOf('function askTopic')
  );
  const generateFromTopicSrc = draftSrc.slice(
    draftSrc.indexOf('async function generateFromTopic'),
    draftSrc.indexOf('async function main')
  );
  const anthropicBranch = completeArticleSrc.split("if (provider === 'anthropic')")[1] || '';
  const anthropicOnly = anthropicBranch.split('return parseModelJson')[0] || '';
  assert(
    'Anthropic generation and revision do not call parseModelJson',
    /completeAnthropicStructured/.test(anthropicOnly) && !/parseModelJson/.test(anthropicOnly),
    anthropicOnly.slice(0, 400)
  );
  assert(
    'generateFromTopic does not call parseModelJson',
    /completeArticle\(/.test(generateFromTopicSrc) && !/parseModelJson/.test(generateFromTopicSrc),
    generateFromTopicSrc.match(/let parsed[\s\S]{0,200}/)
      ? generateFromTopicSrc.match(/let parsed[\s\S]{0,200}/)[0]
      : 'generateFromTopic missing parsed assignment'
  );
  assert(
    'generateFromTopic has exactly one revision completion',
    (generateFromTopicSrc.match(/mode: 'revision'/g) || []).length === 1 &&
      (generateFromTopicSrc.match(/mode: 'generation'/g) || []).length === 1,
    generateFromTopicSrc.match(/mode: '[^']+'/g) && generateFromTopicSrc.match(/mode: '[^']+'/g).join(', ')
  );
}

async function run() {
  const facts = loadFacts(EDITORIAL_DIR);
  const allowlist = buildAllowlist(facts);
  const catalog = { posts: [], services: [], core: [] };
  const cmsCategories = ['Marketing', 'Web Design', 'SEO', 'Social Media', 'Business Tips', 'Case Studies'];

  assert('allowlist includes 750', allowlist.money.has(750));
  assert('allowlist includes 4.02', moneySetHas(allowlist, 4.02));
  assert('allowlist includes 0.19', moneySetHas(allowlist, 0.19));
  assert('allowlist does not include 3000', !moneySetHas(allowlist, 3000) && !allowlist.money.has(3000));
  assert('allowlist includes 15 percent', allowlist.percents.has(15));
  assert('allowlist includes 95 percent', allowlist.percents.has(95));
  assert('allowlist includes 250 customers', allowlist.counts.has(250));
  assert('allowlist includes PEAC 1963 impressions', allowlist.counts.has(1963));
  assert('allowlist does not treat 0.19 cents as a count of 19', !allowlist.counts.has(19));

  const sanitized = JSON.parse(factsForPrompt(facts, allowlist));
  const digitalDisplay = sanitized.services['digital-marketing'].price_display;
  assert(
    'sanitized digital-marketing price_display does not contain 3000',
    !/3,?000/.test(digitalDisplay),
    `got ${digitalDisplay}`
  );
  assert('sanitized digital-marketing price_display keeps 750', /750/.test(digitalDisplay), `got ${digitalDisplay}`);

  const allowed = buildAllowedClaims(gbpPack());
  assert('allowed_claims built from excerpt sentences', allowed.length >= 1, `count=${allowed.length}`);
  assert(
    'allowed_claims preserve more likely',
    allowed.some((item) => /more likely/i.test(item.safe_wording || item.claim)),
    JSON.stringify(allowed.map((item) => item.safe_wording || item.claim))
  );
  assert(
    'allowed_claims do not upgrade to will',
    allowed.every((item) => !/\bwill\b/i.test(item.safe_wording || item.claim))
  );
  assert('allowed_claims require citation', allowed.every((item) => item.requires_citation === true));
  assert(
    'isAbsoluteUpgrade catches more likely -> will',
    isAbsoluteUpgrade('Businesses are more likely to show up.', 'Businesses will show up.')
  );
  assert(
    'isAbsoluteUpgrade allows more likely -> more likely',
    !isAbsoluteUpgrade('Businesses are more likely to show up.', 'Businesses are more likely to show up.')
  );

  const emptyTopic = { title: 'Why local businesses struggle to get found', service: 'Digital Marketing', type: 'evergreen' };

  function ctx(sourcePack, allowedClaims) {
    return {
      facts,
      catalog,
      sourcePack,
      topic: emptyTopic,
      allowlist,
      allowedClaims: allowedClaims || buildAllowedClaims(sourcePack),
      cmsCategories
    };
  }

  const adsAllowed = buildAllowedClaims(adsPack());
  const adsClaim = adsAllowed[0];
  const resolved = resolveClaimTokens(
    `Keeping spend honest matters because {{${adsClaim.id}}} That does not mean raising the bid first.`,
    adsAllowed
  );
  assert('claim token is removed during resolution', !resolved.text.includes(`{{${adsClaim.id}}}`), resolved.text);
  assert(
    'renderer inserts reader-facing markdown citation',
    resolved.text.includes(`](${adsClaim.url})`),
    resolved.text
  );
  assert(
    'renderer uses approved safe wording',
    resolved.text.includes((adsClaim.safe_wording || adsClaim.claim).replace(/[.!?]$/, '')),
    resolved.text
  );

  const foreignUrl = 'https://example.com/not-the-approved-source';
  const linkedEvidencePack = {
    needed: true,
    sources: [
      {
        id: 'S1',
        url: adsClaim.url,
        title: 'About Ad Rank',
        excerpt: 'Ad Rank is recalculated each time your ad is eligible to compete in an auction.',
        evidence: [
          {
            about: 'ad rank',
            quote: `[Google Ads uses Ad Rank to determine whether your ad is eligible to show and where it appears.](${foreignUrl})`
          }
        ]
      }
    ]
  };
  const linkedEvidenceClaims = buildAllowedClaims(linkedEvidencePack);
  const linkedEvidenceClaim = linkedEvidenceClaims.find((item) => /ad rank to determine/i.test(item.evidence));
  assert('markdown evidence still stored verbatim', linkedEvidenceClaim && linkedEvidenceClaim.evidence.includes(foreignUrl));
  assert(
    'safe_wording strips research markdown links to plain claim text',
    linkedEvidenceClaim &&
      linkedEvidenceClaim.safe_wording ===
        'Google Ads uses Ad Rank to determine whether your ad is eligible to show and where it appears.' &&
      !linkedEvidenceClaim.safe_wording.includes(foreignUrl) &&
      !/\[/.test(linkedEvidenceClaim.safe_wording),
    linkedEvidenceClaim && linkedEvidenceClaim.safe_wording
  );

  const citedFromMarkdown = resolveClaimTokens(`{{${linkedEvidenceClaim.id}}}`, linkedEvidenceClaims);
  const citedLinks = citedFromMarkdown.text.match(/\[[^\]]+\]\([^)]+\)/g) || [];
  assert(
    'renderer ignores research URL and links with allowed.url',
    citedFromMarkdown.text.includes(`](${adsClaim.url})`) && !citedFromMarkdown.text.includes(foreignUrl),
    citedFromMarkdown.text
  );
  assert(
    'rendered AC claim contains exactly one Markdown link',
    citedLinks.length === 1 && citedLinks[0] === `[Google Ads uses Ad Rank to determine whether your ad is eligible to show and where it appears](${adsClaim.url})`,
    JSON.stringify(citedLinks)
  );

  assert(
    'toSafeWording strips an unmatched leading citation bracket',
    toSafeWording("[There's no way to request or pay for a better local ranking on Google.") ===
      "There's no way to request or pay for a better local ranking on Google."
  );

  const unmatchedBracketPack = {
    needed: true,
    sources: [
      {
        id: 'S1',
        url: 'https://support.google.com/business/answer/7091?hl=en',
        title: 'Tips to improve your local ranking on Google',
        excerpt: 'Local results are mainly based on relevance, distance, and popularity.',
        evidence: [
          {
            about: 'paid ranking',
            quote: "[There's no way to request or pay for a better local ranking on Google."
          }
        ]
      }
    ]
  };
  const unmatchedClaims = buildAllowedClaims(unmatchedBracketPack);
  const unmatchedClaim = unmatchedClaims.find((item) => /no way to request or pay/i.test(item.evidence));
  const unmatchedRendered = resolveClaimTokens(`Start with the listing. {{${unmatchedClaim.id}}}`, unmatchedClaims);
  assert(
    'unmatched leading bracket does not survive in safe_wording',
    unmatchedClaim && !unmatchedClaim.safe_wording.startsWith('[') && !unmatchedClaim.safe_wording.includes('[['),
    unmatchedClaim && unmatchedClaim.safe_wording
  );
  assert(
    'rendered sentence does not retain malformed Markdown',
    unmatchedRendered.text.includes(`](${unmatchedClaim.url})`) &&
      !unmatchedRendered.text.includes('[[') &&
      !/^\s*\[There's no way/m.test(unmatchedRendered.text) &&
      (unmatchedRendered.text.match(/\[[^\]]+\]\([^)]+\)/g) || []).length === 1,
    unmatchedRendered.text
  );

  const quotedWrapper = '"[Google Ads uses Ad Rank to determine whether your ad is eligible to show and where it appears.]"';
  assert(
    'quoted citation wrapper becomes plain claim text',
    toPlainDisplayText(quotedWrapper) ===
      'Google Ads uses Ad Rank to determine whether your ad is eligible to show and where it appears.' &&
      !toPlainDisplayText(quotedWrapper).includes('http'),
    toPlainDisplayText(quotedWrapper)
  );
  const quotedRendered = renderCitedClaim(
    {
      safe_wording: toSafeWording(quotedWrapper),
      url: adsClaim.url,
      requires_citation: true
    },
    { cite: true }
  );
  assert(
    'quoted citation wrapper renders a clean canonical link',
    quotedRendered.includes(`](${adsClaim.url})`) &&
      !quotedRendered.includes('[[') &&
      (quotedRendered.match(/\[[^\]]+\]\([^)]+\)/g) || []).length === 1,
    quotedRendered
  );

  const nestedArtifact = `[[Google Ads uses Ad Rank to determine whether your ad is eligible to show and where it appears.](${foreignUrl})]`;
  const nestedPlain = toPlainDisplayText(nestedArtifact);
  const nestedRendered = renderCitedClaim(
    {
      safe_wording: toSafeWording(nestedArtifact),
      url: adsClaim.url,
      requires_citation: true
    },
    { cite: true }
  );
  assert(
    'nested bracket artifact cannot produce [[text](url)',
    !nestedPlain.startsWith('[') &&
      !nestedPlain.includes(foreignUrl) &&
      !nestedRendered.includes('[[') &&
      nestedRendered.includes(`](${adsClaim.url})`) &&
      (nestedRendered.match(/\[[^\]]+\]\([^)]+\)/g) || []).length === 1,
    `${nestedPlain} | ${nestedRendered}`
  );

  const fakeModelClaims = [
    { claim: 'Invented Google ranking guarantee.', kind: 'sourced_fact', source_id: 'S9', allowed_claim_id: 'AC99' },
    { claim: 'If tracking is already in place, you may not need Brandible.', kind: 'opinion', source_id: null }
  ];
  const sourced = buildSourcedClaims(resolved.usedIds, adsAllowed);
  const merged = mergeNonSourcedClaims(fakeModelClaims, sourced);
  assert(
    'programmatic ledger uses allowed_claim_id from the token',
    sourced.length === 1 && sourced[0].allowed_claim_id === adsClaim.id && sourced[0].source_id === adsClaim.source_id,
    JSON.stringify(sourced)
  );
  assert(
    'programmatic ledger wording matches approved evidence',
    sourced[0].claim === (adsClaim.safe_wording || adsClaim.claim)
  );
  assert(
    'model sourced_fact rows are discarded',
    merged.every((item) => item.claim !== 'Invented Google ranking guarantee.')
  );
  assert('non-sourced claims are kept', merged.some((item) => item.kind === 'opinion'));

  const unapproved = {
    ...baseFields(),
    body: [
      'A listing that is incomplete will not help the phone ring.',
      '',
      'Brandible typical monthly digital marketing engagements run $750–$3,000+/month.',
      '',
      'If the listing is already converting, you may not need Brandible. If that gap is still open, Brandible can help.'
    ].join('\n'),
    claims: [],
    cta: {
      names_brandible: true,
      fit_case: 'If that gap is still open, Brandible can help.',
      walk_away_case: 'If the listing is already converting, you may not need Brandible.'
    }
  };
  const unapprovedProblems = validateGeneratedArticle(unapproved, ctx({ needed: false, sources: [] }, []));
  assert(
    'V1 flags unapproved $3,000',
    hasCode(unapprovedProblems, 'V1_UNAPPROVED_FIRST_PARTY_NUMBER'),
    unapprovedProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const labeledApproved = {
    ...baseFields(),
    body: [
      'Start with the listing, then the site.',
      '',
      'Brandible website projects typically start at $2,000.',
      '',
      'If the listing is already converting, you may not need Brandible. If that gap is still open, Brandible can help.'
    ].join('\n'),
    claims: [
      {
        claim: 'Brandible website projects typically start at $2,000.',
        kind: 'first_party',
        source_id: null,
        allowed_claim_id: null
      }
    ],
    cta: {
      names_brandible: true,
      fit_case: 'If that gap is still open, Brandible can help.',
      walk_away_case: 'If the listing is already converting, you may not need Brandible.'
    }
  };
  const labeledProblems = validateGeneratedArticle(labeledApproved, ctx({ needed: false, sources: [] }, []));
  assert(
    'approved labeled $2,000 is not V1',
    !hasCode(labeledProblems, 'V1_UNAPPROVED_FIRST_PARTY_NUMBER'),
    labeledProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const noCta = {
    ...baseFields(),
    body: [
      'Fix the listing first.',
      '',
      'Brandible can rebuild the profile and the site that sits behind it. Book a call if you want help.'
    ].join('\n'),
    claims: [],
    cta: { names_brandible: true, fit_case: '', walk_away_case: '' }
  };
  const ctaProblems = validateGeneratedArticle(assembleArticle(noCta, []), ctx({ needed: false, sources: [] }, []));
  assert(
    'V2 flags CTA without walk-away contract',
    hasCode(ctaProblems, 'V2_CTA_SELF_QUALIFY'),
    ctaProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const ctaAssembled = assembleArticle(
    {
      ...baseFields(),
      body: 'Fix the listing first.\n',
      claims: [],
      cta: {
        names_brandible: true,
        fit_case: 'If that gap is still open, Brandible can help.',
        walk_away_case: 'If the listing is already converting, you may not need Brandible.'
      }
    },
    []
  );
  assert(
    'deterministic CTA inserts walk-away',
    /may not need Brandible/i.test(ctaAssembled.body),
    ctaAssembled.body
  );
  assert(
    'deterministic CTA inserts fit case',
    /gap is still open/i.test(ctaAssembled.body),
    ctaAssembled.body
  );
  const ctaAssembledProblems = validateGeneratedArticle(ctaAssembled, ctx({ needed: false, sources: [] }, []));
  assert(
    'assembled CTA with both fields is not V2',
    !hasCode(ctaAssembledProblems, 'V2_CTA_SELF_QUALIFY'),
    ctaAssembledProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const missingLink = {
    ...baseFields(),
    title: 'What to check before you raise ad spend',
    slug: 'what-to-check-before-you-raise-ad-spend',
    meta_title: 'What to check before you raise ad spend',
    category: 'Marketing',
    body: [
      '## How the auction works',
      '',
      'Google Ads uses Ad Rank to determine whether your ad is eligible to show and where it appears.',
      '',
      'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
    ].join('\n'),
    claims: [],
    cta: {
      names_brandible: true,
      fit_case: 'If it is not, Brandible can set it up.',
      walk_away_case: 'If tracking is already in place, you may not need Brandible.'
    }
  };
  const rawFactProblems = validateGeneratedArticle(
    assembleArticle(missingLink, adsAllowed),
    ctx(adsPack(), adsAllowed)
  );
  assert(
    'V7 rejects raw platform fact outside a claim token',
    hasCode(rawFactProblems, 'V7_CLAIM_LEDGER'),
    rawFactProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const unlabeled = {
    ...baseFields(),
    body: [
      'Website projects typically start at $2,000 for a custom build.',
      '',
      'If the listing is already converting, you may not need Brandible. If that gap is still open, Brandible can help.'
    ].join('\n'),
    claims: [],
    cta: {
      names_brandible: true,
      fit_case: 'If that gap is still open, Brandible can help.',
      walk_away_case: 'If the listing is already converting, you may not need Brandible.'
    }
  };
  const unlabeledProblems = validateGeneratedArticle(unlabeled, ctx({ needed: false, sources: [] }, []));
  assert(
    'V5 flags unlabeled approved price',
    hasCode(unlabeledProblems, 'V5_UNLABELED_FIRST_PARTY'),
    unlabeledProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const gbpAllowed = buildAllowedClaims(gbpPack());
  const likely = gbpAllowed.find((item) => /more likely/i.test(item.claim));
  const upgraded = {
    ...baseFields(),
    body: [
      '## Local results',
      '',
      'Businesses with complete and accurate info will show up in local search results.',
      '',
      'If the listing is already converting, you may not need Brandible. If that gap is still open, Brandible can help.'
    ].join('\n'),
    claims: likely
      ? [
          {
            claim: 'Businesses with complete and accurate info will show up in local search results.',
            kind: 'sourced_fact',
            source_id: likely.source_id,
            allowed_claim_id: likely.id
          }
        ]
      : [],
    cta: {
      names_brandible: true,
      fit_case: 'If that gap is still open, Brandible can help.',
      walk_away_case: 'If the listing is already converting, you may not need Brandible.'
    }
  };
  const upgradeProblems = validateGeneratedArticle(upgraded, ctx(gbpPack(), gbpAllowed));
  assert(
    'V6 flags more likely upgraded to will',
    hasCode(upgradeProblems, 'V6_ABSOLUTE_WORDING'),
    upgradeProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const untracked = {
    ...baseFields(),
    body: [
      '## Content',
      '',
      "If there's no real content, there's nothing to rank.",
      '',
      'If the listing is already converting, you may not need Brandible. If that gap is still open, Brandible can help.'
    ].join('\n'),
    claims: [],
    cta: {
      names_brandible: true,
      fit_case: 'If that gap is still open, Brandible can help.',
      walk_away_case: 'If the listing is already converting, you may not need Brandible.'
    }
  };
  const untrackedProblems = validateGeneratedArticle(
    assembleArticle(untracked, gbpAllowed),
    ctx(gbpPack(), gbpAllowed)
  );
  assert(
    'V7 flags untracked platform assertion',
    hasCode(untrackedProblems, 'V7_CLAIM_LEDGER'),
    untrackedProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const stronger = {
    ...baseFields(),
    body: [
      '## Categories',
      '',
      'Choose the primary category that completes the ranking formula.',
      '',
      'If the listing is already converting, you may not need Brandible. If that gap is still open, Brandible can help.'
    ].join('\n'),
    claims: [
      {
        claim: 'Primary category is one of the most important ranking factors.',
        kind: 'sourced_fact',
        source_id: 'S1',
        allowed_claim_id: gbpAllowed[0] && gbpAllowed[0].id
      }
    ],
    cta: {
      names_brandible: true,
      fit_case: 'If that gap is still open, Brandible can help.',
      walk_away_case: 'If the listing is already converting, you may not need Brandible.'
    }
  };
  const strongerProblems = validateGeneratedArticle(stronger, ctx(gbpPack(), gbpAllowed));
  assert(
    'V3 flags sourced_fact stronger than stored excerpt',
    hasCode(strongerProblems, 'V3_SOURCE_ENTAILMENT'),
    strongerProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const stamped = stampProblems([
    { code: 'V1_UNAPPROVED_FIRST_PARTY_NUMBER', message: 'Price $3,000 is not approved.' },
    { code: 'V2_CTA_SELF_QUALIFY', message: 'CTA missing walk-away.' }
  ]);
  assert('stamp assigns V1_UNAPPROVED_FIRST_PARTY_NUMBER_1', stamped[0].id === 'V1_UNAPPROVED_FIRST_PARTY_NUMBER_1');
  assert('stamp assigns V2_CTA_SELF_QUALIFY_1', stamped[1].id === 'V2_CTA_SELF_QUALIFY_1');

  const missing = assertRevisionResolutions(stamped, { resolutions: [] });
  assert('missing resolutions are rejected', missing.length === 2, missing.join(' | '));

  const wrongAction = assertRevisionResolutions(stamped, {
    resolutions: [
      { failure_id: 'V1_UNAPPROVED_FIRST_PARTY_NUMBER_1', action: 'replaced_with_token', resulting_sentence: '{{AC1}}' },
      {
        failure_id: 'V2_CTA_SELF_QUALIFY_1',
        action: 'self_qualified',
        resulting_sentence: 'If the listing is already converting, you may not need Brandible.'
      }
    ]
  });
  assert(
    'V1 replaced_with_token is rejected',
    wrongAction.some((item) => /V1_UNAPPROVED_FIRST_PARTY_NUMBER_1/.test(item)),
    wrongAction.join(' | ')
  );

  const okResolutions = assertRevisionResolutions(stamped, {
    resolutions: [
      { failure_id: 'V1_UNAPPROVED_FIRST_PARTY_NUMBER_1', action: 'deleted', resulting_sentence: 'deleted' },
      {
        failure_id: 'V2_CTA_SELF_QUALIFY_1',
        action: 'self_qualified',
        resulting_sentence: 'If the listing is already converting, you may not need Brandible.'
      }
    ]
  });
  assert('complete valid resolutions accepted', okResolutions.length === 0, okResolutions.join(' | '));

  const everyoneArticle = {
    ...baseFields(),
    title: 'What to check before you raise ad spend',
    slug: 'what-to-check-before-you-raise-ad-spend',
    meta_title: 'What to check before you raise ad spend',
    category: 'Marketing',
    excerpt: 'Get the tracking and the landing page honest before you add more budget to the campaign.',
    meta_description:
      'A practical order of operations for local shops that want paid clicks to turn into calls, not just more spend.',
    body: [
      '## How the auction works',
      '',
      'Everyone can get an ad to show if they raise spend.',
      '',
      'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
    ].join('\n'),
    claims: [],
    cta: {
      names_brandible: true,
      fit_case: 'If it is not, Brandible can set it up.',
      walk_away_case: 'If tracking is already in place, you may not need Brandible.'
    }
  };
  const everyoneProblems = validateGeneratedArticle(everyoneArticle, ctx(adsPack(), adsAllowed));
  const v9Problems = everyoneProblems.filter((item) => item.code === 'V9_QUANTIFIER');
  assert(
    'validator produces V9_QUANTIFIER for everyone',
    v9Problems.length >= 1 && /\beveryone\b/i.test(everyoneArticle.body),
    everyoneProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const invalidV9 = assertRevisionResolutions(v9Problems, {
    resolutions: [
      {
        failure_id: v9Problems[0].id,
        action: 'attributed',
        resulting_sentence: 'Everyone can get an ad to show if they raise spend.'
      }
    ]
  });
  assert(
    'invalid V9 resolution action is rejected',
    invalidV9.some((item) => /V9_QUANTIFIER/.test(item)),
    invalidV9.join(' | ')
  );

  const validV9 = assertRevisionResolutions(v9Problems, {
    resolutions: [
      {
        failure_id: v9Problems[0].id,
        action: 'replaced_with_token',
        resulting_sentence: `{{${adsClaim.id}}}`
      }
    ]
  });
  assert('V9 replaced_with_token is accepted', validV9.length === 0, validV9.join(' | '));

  const rewrittenAuditParsed = {
    ...everyoneArticle,
    body: [
      '## How the auction works',
      '',
      'Raising spend does not by itself make an ad eligible to show.',
      '',
      `Keeping spend honest matters because {{${adsClaim.id}}} That does not mean raising the bid first.`,
      '',
      'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
    ].join('\n'),
    resolutions: [
      {
        failure_id: v9Problems[0].id,
        action: 'rewritten_to_evidence',
        resulting_sentence: 'Raising budget alone does not make an ad eligible to show.'
      }
    ]
  };
  const rewrittenAuditGate = assertRevisionResolutions(v9Problems, rewrittenAuditParsed);
  assert(
    'V9 rewritten_to_evidence gate passes when audit sentence differs from revised prose',
    rewrittenAuditGate.length === 0,
    rewrittenAuditGate.join(' | ')
  );
  const rewrittenAssembled = assembleArticle(rewrittenAuditParsed, adsAllowed);
  const rewrittenFinal = validateGeneratedArticle(rewrittenAssembled, ctx(adsPack(), adsAllowed));
  assert(
    'rewritten V9 with quantifier removed is decided by final validation',
    rewrittenFinal.length === 0 && !/\beveryone\b/i.test(rewrittenAssembled.body),
    rewrittenFinal.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const claimedRewriteParsed = {
    ...everyoneArticle,
    resolutions: [
      {
        failure_id: v9Problems[0].id,
        action: 'rewritten_to_evidence',
        resulting_sentence: 'Raising spend does not by itself make an ad eligible to show.'
      }
    ]
  };
  const claimedRewriteGate = assertRevisionResolutions(v9Problems, claimedRewriteParsed);
  assert(
    'V9 rewrite claim still requires a resolution even if prose does not match',
    claimedRewriteGate.length === 0,
    claimedRewriteGate.join(' | ')
  );
  const claimedRewriteFinal = validateGeneratedArticle(
    assembleArticle(claimedRewriteParsed, adsAllowed),
    ctx(adsPack(), adsAllowed)
  );
  assert(
    'V9 still fails final validation when everyone remains',
    hasCode(claimedRewriteFinal, 'V9_QUANTIFIER') && /\beveryone\b/i.test(claimedRewriteParsed.body),
    claimedRewriteFinal.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const missingAc3 = assertRevisionResolutions(v9Problems, {
    ...everyoneArticle,
    resolutions: [
      {
        failure_id: v9Problems[0].id,
        action: 'replaced_with_token',
        resulting_sentence: '{{AC3}}'
      }
    ]
  });
  assert(
    'replaced_with_token {{AC3}} is rejected when the token is absent',
    missingAc3.some((item) => /\{\{AC3\}\}/.test(item) && /not present in the revised article/.test(item)),
    missingAc3.join(' | ')
  );

  const presentAc3 = assertRevisionResolutions(v9Problems, {
    ...everyoneArticle,
    body: [
      '## How the auction works',
      '',
      '{{AC3}}',
      '',
      'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
    ].join('\n'),
    resolutions: [
      {
        failure_id: v9Problems[0].id,
        action: 'replaced_with_token',
        resulting_sentence: '{{AC3}}'
      }
    ]
  });
  assert('replaced_with_token gate passes when {{AC3}} is present', presentAc3.length === 0, presentAc3.join(' | '));

  const v2Problems = ctaProblems.filter((item) => item.code === 'V2_CTA_SELF_QUALIFY');
  const selfQualifiedParsed = {
    ...baseFields(),
    title: 'What to check before you raise ad spend',
    slug: 'what-to-check-before-you-raise-ad-spend',
    meta_title: 'What to check before you raise ad spend',
    category: 'Marketing',
    excerpt: 'Get the tracking and the landing page honest before you add more budget to the campaign.',
    meta_description:
      'A practical order of operations for local shops that want paid clicks to turn into calls, not just more spend.',
    body: 'Fix the listing first.\n',
    claims: [],
    cta: {
      names_brandible: true,
      fit_case: 'If it is not, Brandible can set it up.',
      walk_away_case: 'If tracking is already in place, you may not need Brandible.'
    },
    resolutions: [
      {
        failure_id: v2Problems[0].id,
        action: 'self_qualified',
        resulting_sentence: 'Walk away if the shop already has tracking handled without Brandible.'
      }
    ]
  };
  const selfQualifiedGate = assertRevisionResolutions(v2Problems, selfQualifiedParsed);
  assert(
    'self_qualified gate passes when audit wording differs from the body',
    selfQualifiedGate.length === 0,
    selfQualifiedGate.join(' | ')
  );
  const selfQualifiedFinal = validateGeneratedArticle(
    assembleArticle(selfQualifiedParsed, []),
    ctx({ needed: false, sources: [] }, [])
  );
  assert(
    'self_qualified structured CTA fields are decided by final validation',
    !hasCode(selfQualifiedFinal, 'V2_CTA_SELF_QUALIFY'),
    selfQualifiedFinal.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const repairedEveryone = assembleArticle(
    {
      ...everyoneArticle,
      body: [
        '## How the auction works',
        '',
        `{{${adsClaim.id}}}`,
        '',
        'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
      ].join('\n')
    },
    adsAllowed
  );
  assert(
    'V9 token repair removes everyone from assembled body',
    !/\beveryone\b/i.test(repairedEveryone.body),
    repairedEveryone.body
  );
  const repairedEveryoneProblems = validateGeneratedArticle(repairedEveryone, ctx(adsPack(), adsAllowed));
  assert(
    'assembled V9 token repair is subjected to final validation',
    Array.isArray(repairedEveryoneProblems),
    'final validation did not run'
  );
  assert(
    'assembled V9 token repair passes final validation',
    repairedEveryoneProblems.length === 0,
    repairedEveryoneProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const tokenArticle = assembleArticle(
    {
      ...baseFields(),
      title: 'What to check before you raise ad spend',
      slug: 'what-to-check-before-you-raise-ad-spend',
      meta_title: 'What to check before you raise ad spend',
      category: 'Marketing',
      excerpt: 'Get the tracking and the landing page honest before you add more budget to the campaign.',
      meta_description:
        'A practical order of operations for local shops that want paid clicks to turn into calls, not just more spend.',
      body: [
        '## How the auction works',
        '',
        `Keeping spend honest matters because {{${adsClaim.id}}} That does not mean raising the bid first.`,
        '',
        'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
      ].join('\n'),
      claims: [
        {
          claim: 'Invented Google ranking guarantee.',
          kind: 'sourced_fact',
          source_id: 'S9',
          allowed_claim_id: 'AC99'
        },
        {
          claim: 'If tracking is already in place, you may not need Brandible.',
          kind: 'opinion',
          source_id: null
        }
      ],
      cta: {
        names_brandible: true,
        fit_case: 'If it is not, Brandible can set it up.',
        walk_away_case: 'If tracking is already in place, you may not need Brandible.'
      }
    },
    adsAllowed
  );
  assert(
    'assembled article has no leftover claim tokens',
    !/\{\{\s*AC\d+\s*\}\}/.test(tokenArticle.body),
    tokenArticle.body
  );
  assert(
    'assembled sourced ledger has no invented source',
    tokenArticle.claims.every((item) => item.kind !== 'sourced_fact' || item.source_id !== 'S9'),
    JSON.stringify(tokenArticle.claims)
  );
  assert(
    'assembled sourced ledger is derived from used tokens',
    tokenArticle.claims.some(
      (item) => item.kind === 'sourced_fact' && item.allowed_claim_id === adsClaim.id && item.source_id === adsClaim.source_id
    ),
    JSON.stringify(tokenArticle.claims)
  );
  const passingProblems = validateGeneratedArticle(tokenArticle, ctx(adsPack(), adsAllowed));
  assert(
    'tokenized allowed claim with assembled CTA can pass',
    passingProblems.length === 0,
    passingProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const markdownCitedArticle = assembleArticle(
    {
      ...baseFields(),
      title: 'What to check before you raise ad spend',
      slug: 'what-to-check-before-you-raise-ad-spend',
      meta_title: 'What to check before you raise ad spend',
      category: 'Marketing',
      excerpt: 'Get the tracking and the landing page honest before you add more budget to the campaign.',
      meta_description:
        'A practical order of operations for local shops that want paid clicks to turn into calls, not just more spend.',
      body: [
        '## How the auction works',
        '',
        `Keeping spend honest matters because {{${linkedEvidenceClaim.id}}} That does not mean raising the bid first.`,
        '',
        'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
      ].join('\n'),
      claims: [],
      cta: {
        names_brandible: true,
        fit_case: 'If it is not, Brandible can set it up.',
        walk_away_case: 'If tracking is already in place, you may not need Brandible.'
      }
    },
    linkedEvidenceClaims
  );
  assert(
    'assembled markdown-evidence claim uses the canonical URL once',
    markdownCitedArticle.body.includes(`](${linkedEvidenceClaim.url})`) &&
      !markdownCitedArticle.body.includes(foreignUrl) &&
      (markdownCitedArticle.body.match(/\[[^\]]+\]\([^)]+\)/g) || []).length === 1,
    markdownCitedArticle.body
  );
  const markdownCitedProblems = validateGeneratedArticle(
    markdownCitedArticle,
    ctx(linkedEvidencePack, linkedEvidenceClaims)
  );
  assert(
    'V4 passes for the deterministic canonical link',
    markdownCitedProblems.length === 0,
    markdownCitedProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const missingCanonicalLink = {
    ...markdownCitedArticle,
    body: markdownCitedArticle.body.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  };
  const missingCanonicalProblems = validateGeneratedArticle(
    missingCanonicalLink,
    ctx(linkedEvidencePack, linkedEvidenceClaims)
  );
  assert(
    'V4 still fails when the approved URL is genuinely absent',
    hasCode(missingCanonicalProblems, 'V4_MISSING_SOURCE_LINK'),
    missingCanonicalProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const malformedRendered = {
    ...markdownCitedArticle,
    rendered_facts: (markdownCitedArticle.rendered_facts || []).map((item) => ({
      ...item,
      text: `[${item.text}`
    }))
  };
  const malformedRenderedProblems = validateGeneratedArticle(
    malformedRendered,
    ctx(linkedEvidencePack, linkedEvidenceClaims)
  );
  assert(
    'malformed rendered citation still fails V4',
    hasCode(malformedRenderedProblems, 'V4_MISSING_SOURCE_LINK'),
    malformedRenderedProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const editorialAroundLink = assembleArticle(
    {
      ...baseFields(),
      title: 'What to check before you raise ad spend',
      slug: 'what-to-check-before-you-raise-ad-spend',
      meta_title: 'What to check before you raise ad spend',
      category: 'Marketing',
      excerpt: 'Get the tracking and the landing page honest before you add more budget to the campaign.',
      meta_description:
        'A practical order of operations for local shops that want paid clicks to turn into calls, not just more spend.',
      body: [
        '## How the auction works',
        '',
        `There's no way Brandible can skip the mechanics: {{${adsClaim.id}}} That does not mean raising the bid first.`,
        '',
        'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
      ].join('\n'),
      claims: [],
      cta: {
        names_brandible: true,
        fit_case: 'If it is not, Brandible can set it up.',
        walk_away_case: 'If tracking is already in place, you may not need Brandible.'
      }
    },
    adsAllowed
  );
  const editorialAroundProblems = validateGeneratedArticle(editorialAroundLink, ctx(adsPack(), adsAllowed));
  assert(
    'Brandible commentary around an approved sourced link is not source-owned',
    /There's no way Brandible can skip the mechanics/.test(editorialAroundLink.body) &&
      editorialAroundLink.body.includes(`](${adsClaim.url})`),
    editorialAroundLink.body
  );
  assert(
    'linked source validation passes when only the anchor is source-owned',
    editorialAroundProblems.length === 0 && !hasCode(editorialAroundProblems, 'V6_ABSOLUTE_WORDING'),
    editorialAroundProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const overstrongAnchor = {
    ...editorialAroundLink,
    body: `${editorialAroundLink.body.trim()}\n\n[There's no way your ad is eligible to show.](${adsClaim.url})\n`
  };
  const overstrongProblems = validateGeneratedArticle(overstrongAnchor, ctx(adsPack(), adsAllowed));
  assert(
    'genuinely overstrong anchor text still fails V6',
    hasCode(overstrongProblems, 'V6_ABSOLUTE_WORDING'),
    overstrongProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const adsCtx = ctx(adsPack(), adsAllowed);

  function insertBeforeCta(article, markdown) {
    const marker = 'If tracking is already in place';
    const idx = article.body.indexOf(marker);
    const extra = String(markdown).trim();
    const body =
      idx === -1
        ? `${article.body.trim()}\n\n${extra}\n`
        : `${article.body.slice(0, idx)}${extra}\n\n${article.body.slice(idx)}`;
    return { ...article, body };
  }

  const emDashArticle = {
    ...tokenArticle,
    title: 'What to check before you raise ad spend — tracking',
    excerpt: 'Get the tracking and the landing page honest before you add more budget — then judge spend.',
    meta_description:
      'A practical order of operations for local shops that want paid clicks to turn into calls — not just more spend.',
    body: tokenArticle.body.replace(
      'That does not mean raising the bid first.',
      'That does not mean raising the bid first — start with tracking.'
    )
  };
  const emDashProblems = validateGeneratedArticle(emDashArticle, adsCtx);
  assert(
    'revision em dash is V10_OTHER',
    hasCode(emDashProblems, 'V10_OTHER') && emDashProblems.some((item) => /em dash/i.test(item.message)),
    emDashProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );
  const emDashFallback = applySafetyFallback(emDashArticle, emDashProblems);
  assert(
    'em dash fallback applies one deterministic repair',
    !emDashFallback.refused && emDashFallback.applied.join(',') === 'em_dash',
    JSON.stringify(emDashFallback.applied)
  );
  assert(
    'em dash fallback normalizes title, meta, excerpt, and body',
    ![
      emDashFallback.article.title,
      emDashFallback.article.meta_description,
      emDashFallback.article.excerpt,
      emDashFallback.article.body
    ].some((value) => String(value).includes('\u2014')),
    emDashFallback.article.body
  );
  const emDashFinal = validateGeneratedArticle(emDashFallback.article, adsCtx);
  assert(
    'em dash fallback passes V10 on final validation',
    emDashFinal.length === 0,
    emDashFinal.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const everyoneBodyArticle = insertBeforeCta(
    tokenArticle,
    'Everyone should raise spend before the landing page is ready.'
  );
  const everyoneBodyProblems = validateGeneratedArticle(everyoneBodyArticle, adsCtx);
  assert(
    'revision everyone in body is V9_QUANTIFIER',
    hasCode(everyoneBodyProblems, 'V9_QUANTIFIER') &&
      everyoneBodyProblems.some((item) => /unsupported quantifier in body/i.test(item.message)),
    everyoneBodyProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );
  const everyoneFallback = applySafetyFallback(everyoneBodyArticle, everyoneBodyProblems);
  assert(
    'V9 body fallback deletes the containing sentence',
    !everyoneFallback.refused &&
      everyoneFallback.applied.join(',') === 'v9_body' &&
      !/Everyone should raise spend before the landing page is ready/.test(everyoneFallback.article.body) &&
      !/\beveryone\b/i.test(everyoneFallback.article.body),
    everyoneFallback.article.body
  );
  const everyoneFinal = validateGeneratedArticle(everyoneFallback.article, adsCtx);
  assert(
    'V9 body deletion is removed on final validation',
    everyoneFinal.length === 0,
    everyoneFinal.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const rawGoogleArticle = {
    ...tokenArticle,
    body: `${tokenArticle.body.trim()}\n\n## Extra fact\n\nGoogle Ads runs an auction every time a search happens.\n`
  };
  const rawGoogleProblems = validateGeneratedArticle(rawGoogleArticle, adsCtx);
  assert(
    'raw Google sentence surviving revision is V7_CLAIM_LEDGER',
    hasCode(rawGoogleProblems, 'V7_CLAIM_LEDGER') &&
      rawGoogleProblems.some((item) => /factual platform assertion is not an approved claim token/i.test(item.message)),
    rawGoogleProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );
  const rawGoogleFallback = applySafetyFallback(rawGoogleArticle, rawGoogleProblems);
  assert(
    'V7 fallback deletes the raw Google sentence and empty heading',
    !rawGoogleFallback.refused &&
      rawGoogleFallback.applied.join(',') === 'v7_body' &&
      !/Google Ads runs an auction every time a search happens/.test(rawGoogleFallback.article.body) &&
      !/## Extra fact/.test(rawGoogleFallback.article.body),
    rawGoogleFallback.article.body
  );
  const rawGoogleFinal = validateGeneratedArticle(rawGoogleFallback.article, adsCtx);
  assert(
    'V7 body deletion is removed on final validation',
    rawGoogleFinal.length === 0,
    rawGoogleFinal.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const tooManyArticle = insertBeforeCta(
    tokenArticle,
    [
      'Google Ads runs an auction every time a search happens.',
      '',
      'Conversion tracking lets you track whether clicks become calls after the visit.',
      '',
      'Google Search ads use bidding for a position instead of a reserved placement.',
      '',
      'Google Ads determines whether a click is tracked after the auction finishes.'
    ].join('\n')
  );
  const tooManyProblems = validateGeneratedArticle(tooManyArticle, adsCtx);
  const tooManyCandidates = collectSafetyRepairs(tooManyArticle, tooManyProblems);
  const tooManyFallback = applySafetyFallback(tooManyArticle, tooManyProblems);
  assert(
    'more than 3 deterministic repairs are required',
    tooManyCandidates.length > 3,
    `candidates=${tooManyCandidates.length} problems=${tooManyProblems.map((item) => item.code).join(',')}`
  );
  assert(
    'fallback refuses when more than 3 repairs are required',
    tooManyFallback.refused && tooManyFallback.applied.length === 0 && tooManyFallback.article === tooManyArticle,
    JSON.stringify({ refused: tooManyFallback.refused, applied: tooManyFallback.applied, reason: tooManyFallback.reason })
  );
  assert(
    'refused fallback still fails validation',
    hasCode(tooManyProblems, 'V7_CLAIM_LEDGER'),
    tooManyProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const metaEveryoneArticle = {
    ...tokenArticle,
    meta_description:
      'Everyone needs a practical order of operations for local shops that want paid clicks to turn into calls.'
  };
  const metaEveryoneProblems = validateGeneratedArticle(metaEveryoneArticle, adsCtx);
  const metaEveryoneFallback = applySafetyFallback(metaEveryoneArticle, metaEveryoneProblems);
  assert(
    'V9 in meta description is not deleted deterministically',
    metaEveryoneFallback.applied.length === 0 &&
      metaEveryoneFallback.refused === false &&
      metaEveryoneFallback.article.meta_description === metaEveryoneArticle.meta_description,
    JSON.stringify(metaEveryoneFallback.applied)
  );
  assert(
    'V9 in meta description still fails validation',
    hasCode(metaEveryoneProblems, 'V9_QUANTIFIER') &&
      metaEveryoneProblems.some((item) => /unsupported quantifier in meta_description/i.test(item.message)),
    metaEveryoneProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const entailmentFallback = applySafetyFallback(stronger, strongerProblems);
  const entailmentAfter = validateGeneratedArticle(entailmentFallback.article, ctx(gbpPack(), gbpAllowed));
  assert(
    'source-entailment is outside the safety fallback allowlist',
    entailmentFallback.applied.length === 0 && entailmentFallback.refused === false,
    JSON.stringify(entailmentFallback.applied)
  );
  assert(
    'source-entailment still fails after fallback',
    hasCode(entailmentAfter, 'V3_SOURCE_ENTAILMENT'),
    entailmentAfter.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const rankingPack = {
    needed: true,
    sources: [
      {
        id: 'S1',
        url: 'https://support.google.com/business/answer/7091?hl=en',
        title: 'Tips to improve your local ranking on Google',
        excerpt:
          'Local results are mainly based on relevance, distance, and popularity. Together, these factors help Google find the best match for customers searches.',
        evidence: [
          {
            about: 'paid ranking',
            quote: "There's no way to request or pay for a better local ranking on Google."
          }
        ]
      }
    ]
  };
  const rankingClaims = buildAllowedClaims(rankingPack);
  const ac3 = rankingClaims.find((item) => item.id === 'AC3');
  assert('ranking pack exposes AC3', Boolean(ac3 && ac3.url && ac3.requires_citation), JSON.stringify(rankingClaims.map((item) => item.id)));
  const ac3Cited = renderCitedClaim(ac3, { cite: true });
  const rankingCtx = ctx(rankingPack, rankingClaims);

  function ac3Draft(body) {
    return {
      ...baseFields(),
      title: 'What to check before you raise ad spend',
      slug: 'what-to-check-before-you-raise-ad-spend',
      meta_title: 'What to check before you raise ad spend',
      category: 'Marketing',
      excerpt: 'Get the tracking and the landing page honest before you add more budget to the campaign.',
      meta_description:
        'A practical order of operations for local shops that want paid clicks to turn into calls, not just more spend.',
      body,
      claims: [
        {
          claim: 'If tracking is already in place, you may not need Brandible.',
          kind: 'opinion',
          source_id: null
        }
      ],
      cta: {
        names_brandible: true,
        fit_case: 'If it is not, Brandible can set it up.',
        walk_away_case: 'If tracking is already in place, you may not need Brandible.'
      }
    };
  }

  function runPostRevisionPipeline(tokenized) {
    const assembled = assembleArticle(tokenized, rankingClaims);
    const mid = validateGeneratedArticle(assembled, rankingCtx);
    const fallback = applySafetyFallback(assembled, mid);
    let article = assembled;
    if (fallback.applied.length && !fallback.refused) {
      article = fallback.article;
      if (fallback.needsAssemble) {
        article = assembleArticle(article, rankingClaims);
      }
      article = refreshAssemblyState(article, rankingClaims);
    }
    const finalProblems = validateGeneratedArticle(article, rankingCtx);
    return { assembled, mid, fallback, article, finalProblems };
  }

  function assertAc3Canonical(namePrefix, article, problems) {
    const links = article.body.match(/\[[^\]]+\]\([^)]+\)/g) || [];
    assert(
      `${namePrefix}: V9 everyone is removed and AC3 remains`,
      !/\beveryone\b/i.test(article.body) && article.body.includes(ac3Cited),
      article.body
    );
    assert(
      `${namePrefix}: exactly one canonical AC3 link`,
      links.length === 1 && links[0] === ac3Cited.replace(/[.!?]$/, ''),
      JSON.stringify(links)
    );
    assert(
      `${namePrefix}: href equals allowed.url and has no nested brackets`,
      article.body.includes(`](${ac3.url})`) &&
        !article.body.includes('[[') &&
        !/\[/.test(article.body.replace(/\[[^\]]+\]\([^)]+\)/g, '')),
      article.body
    );
    assert(
      `${namePrefix}: rendered_facts matches the final body`,
      article.rendered_facts.length === 1 &&
        article.rendered_facts[0].id === 'AC3' &&
        article.body.includes(article.rendered_facts[0].text),
      JSON.stringify(article.rendered_facts)
    );
    assert(
      `${namePrefix}: sourced ledger contains AC3 because AC3 remains`,
      article.claim_tokens_used.includes('AC3') &&
        article.claims.some((item) => item.kind === 'sourced_fact' && item.allowed_claim_id === 'AC3') &&
        article.claims.some((item) => item.kind === 'opinion'),
      JSON.stringify(article.claims)
    );
    assert(
      `${namePrefix}: V4 does not appear`,
      !hasCode(problems, 'V4_MISSING_SOURCE_LINK') && problems.length === 0,
      problems.map((item) => `${item.id}: ${item.message}`).join(' | ')
    );
  }

  const separatePipeline = runPostRevisionPipeline(
    ac3Draft(
      [
        '## Local ranking',
        '',
        'Everyone can get a listing to show up overnight.',
        '',
        '{{AC3}}',
        '',
        'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
      ].join('\n')
    )
  );
  assert(
    'separate-paragraph pipeline applies V9 body fallback',
    separatePipeline.fallback.applied.join(',') === 'v9_body',
    JSON.stringify(separatePipeline.fallback)
  );
  assertAc3Canonical('separate paragraphs', separatePipeline.article, separatePipeline.finalProblems);

  const samePipeline = runPostRevisionPipeline(
    ac3Draft(
      [
        '## Local ranking',
        '',
        'Everyone can get a listing to show up overnight. {{AC3}}',
        '',
        'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
      ].join('\n')
    )
  );
  assert(
    'same-paragraph pipeline applies V9 body fallback',
    samePipeline.fallback.applied.join(',') === 'v9_body',
    JSON.stringify(samePipeline.fallback)
  );
  assertAc3Canonical('same paragraph', samePipeline.article, samePipeline.finalProblems);

  const leftoverPipeline = runPostRevisionPipeline(
    ac3Draft(
      [
        '## Local ranking',
        '',
        'Everyone can get a listing to show up overnight. {{AC3}}',
        '',
        "There's no way to request or pay for a better local ranking on Google if the listing is incomplete.",
        '',
        'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
      ].join('\n')
    )
  );
  assert(
    'same-paragraph leftover pipeline keeps AC3 after V9 fallback',
    leftoverPipeline.fallback.applied.includes('v9_body') && leftoverPipeline.article.body.includes(ac3Cited),
    leftoverPipeline.article.body
  );
  assert(
    'same-paragraph leftover pipeline does not fail V4',
    !hasCode(leftoverPipeline.finalProblems, 'V4_MISSING_SOURCE_LINK'),
    leftoverPipeline.finalProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const wrapperBodies = {
    '{{AC3}}': '{{AC3}}',
    '[{{AC3}}]': '[{{AC3}}]',
    '"{{AC3}}"': '"{{AC3}}"',
    '**{{AC3}}**': '**{{AC3}}**',
    '[{{AC3}}](some-model-url)': '[{{AC3}}](https://example.com/not-the-approved-source)'
  };
  for (const [label, token] of Object.entries(wrapperBodies)) {
    assert(
      `wrapper ${label} unwraps to a bare token`,
      unwrapClaimTokenWrappers(token).replace(/\s+/g, '') === '{{AC3}}' ||
        unwrapClaimTokenWrappers(`Keep the profile complete. ${token}`).includes('{{AC3}}'),
      unwrapClaimTokenWrappers(token)
    );
    const wrapped = assembleArticle(
      ac3Draft(
        [
          '## Local ranking',
          '',
          token,
          '',
          'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
        ].join('\n')
      ),
      rankingClaims
    );
    const wrappedLinks = wrapped.body.match(/\[[^\]]+\]\([^)]+\)/g) || [];
    const wrappedProblems = validateGeneratedArticle(wrapped, rankingCtx);
    assert(
      `wrapper ${label} renders one canonical AC3 link`,
      wrapped.body.includes(ac3Cited) &&
        wrappedLinks.length === 1 &&
        wrappedLinks[0].includes(ac3.url) &&
        !wrapped.body.includes('[[') &&
        !wrapped.body.includes('example.com/not-the-approved-source'),
      wrapped.body
    );
    assert(
      `wrapper ${label} passes V4`,
      !hasCode(wrappedProblems, 'V4_MISSING_SOURCE_LINK') && wrappedProblems.length === 0,
      wrappedProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
    );
  }

  const pipelineMissingLink = {
    ...separatePipeline.article,
    body: separatePipeline.article.body.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  };
  const pipelineMissingLinkProblems = validateGeneratedArticle(pipelineMissingLink, rankingCtx);
  assert(
    'V4 still fails for a genuinely missing canonical link',
    hasCode(pipelineMissingLinkProblems, 'V4_MISSING_SOURCE_LINK'),
    pipelineMissingLinkProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const neverSplitPack = {
    needed: true,
    sources: [
      {
        id: 'S1',
        url: 'https://support.google.com/business/answer/7091?hl=en',
        title: 'Tips to improve your local ranking on Google',
        excerpt: '',
        evidence: [
          {
            about: 'complete info',
            quote:
              'Businesses with complete and accurate info are more likely to show up in local search results.'
          },
          {
            about: 'category edit',
            quote: 'If you add or edit an existing category, you might be asked to verify the business again.'
          }
        ]
      }
    ]
  };
  const neverSplitClaims = buildAllowedClaims(neverSplitPack);
  const moreLikelyClaim = neverSplitClaims[0];
  const categoryClaim = neverSplitClaims[1];
  const moreLikelyCited = renderCitedClaim(moreLikelyClaim, { cite: true });
  const categoryCited = renderCitedClaim(categoryClaim, { cite: true });
  const claimedNeverPara = `If you've claimed the profile but never finished setting it up, you're in a similar position. ${moreLikelyCited}`;
  const categoryNeverPara = `If you've never looked at your category selection, that's worth doing this week. ${categoryCited}`;
  const claimedNeverParts = splitSentences(claimedNeverPara);
  const categoryNeverParts = splitSentences(categoryNeverPara);
  assert(
    'never + AC citation splits into two sentences',
    claimedNeverParts.length === 2 &&
      /never finished/.test(claimedNeverParts[0]) &&
      /more likely/.test(claimedNeverParts[1]) &&
      !/\bnever\b/i.test(claimedNeverParts[1]),
    JSON.stringify(claimedNeverParts)
  );
  assert(
    'never + category citation splits into two sentences',
    categoryNeverParts.length === 2 &&
      /never looked/.test(categoryNeverParts[0]) &&
      /might be asked/.test(categoryNeverParts[1]) &&
      !/\bnever\b/i.test(categoryNeverParts[1]),
    JSON.stringify(categoryNeverParts)
  );

  function neverDraft(body) {
    return {
      ...baseFields(),
      title: 'What to check before you raise ad spend',
      slug: 'what-to-check-before-you-raise-ad-spend',
      meta_title: 'What to check before you raise ad spend',
      category: 'Marketing',
      excerpt: 'Get the tracking and the landing page honest before you add more budget to the campaign.',
      meta_description:
        'A practical order of operations for local shops that want paid clicks to turn into calls, not just more spend.',
      body,
      claims: [],
      cta: {
        names_brandible: true,
        fit_case: 'If it is not, Brandible can set it up.',
        walk_away_case: 'If tracking is already in place, you may not need Brandible.'
      }
    };
  }

  const claimedNeverArticle = assembleArticle(
    neverDraft(
      [
        '## Local ranking',
        '',
        "If you've claimed the profile but never finished setting it up, you're in a similar position. {{" +
          moreLikelyClaim.id +
          '}}',
        '',
        'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
      ].join('\n')
    ),
    neverSplitClaims
  );
  const claimedNeverProblems = validateGeneratedArticle(claimedNeverArticle, ctx(neverSplitPack, neverSplitClaims));
  assert(
    'never commentary before cited more-likely claim is not V6',
    /never finished/.test(claimedNeverArticle.body) &&
      claimedNeverArticle.body.includes(moreLikelyCited) &&
      !hasCode(claimedNeverProblems, 'V6_ABSOLUTE_WORDING') &&
      claimedNeverProblems.length === 0,
    claimedNeverProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const categoryNeverArticle = assembleArticle(
    neverDraft(
      [
        '## Local ranking',
        '',
        "If you've never looked at your category selection, that's worth doing this week. {{" +
          categoryClaim.id +
          '}}',
        '',
        'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
      ].join('\n')
    ),
    neverSplitClaims
  );
  const categoryNeverProblems = validateGeneratedArticle(categoryNeverArticle, ctx(neverSplitPack, neverSplitClaims));
  assert(
    'never commentary before cited category claim is not V6',
    /never looked/.test(categoryNeverArticle.body) &&
      categoryNeverArticle.body.includes(categoryCited) &&
      !hasCode(categoryNeverProblems, 'V6_ABSOLUTE_WORDING') &&
      categoryNeverProblems.length === 0,
    categoryNeverProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const overstrongLinkedAc = {
    ...claimedNeverArticle,
    body: claimedNeverArticle.body.replace(
      moreLikelyCited,
      `[Businesses with complete and accurate info will show up in local search results.](${moreLikelyClaim.url})`
    )
  };
  const overstrongLinkedProblems = validateGeneratedArticle(overstrongLinkedAc, ctx(neverSplitPack, neverSplitClaims));
  assert(
    'genuinely overstrong linked AC fact still fails V6',
    hasCode(overstrongLinkedProblems, 'V6_ABSOLUTE_WORDING'),
    overstrongLinkedProblems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const malformedV7Article = assembleArticle(
    ac3Draft(
      [
        '## Local ranking',
        '',
        "[There's no way to request or pay for a better local ranking on Google.",
        '',
        'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
      ].join('\n')
    ),
    rankingClaims
  );
  const malformedV7Problems = validateGeneratedArticle(malformedV7Article, rankingCtx);
  assert(
    'malformed leading-bracket Google sentence is V7',
    hasCode(malformedV7Problems, 'V7_CLAIM_LEDGER'),
    malformedV7Problems.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );
  const malformedV7Repairs = collectSafetyRepairs(malformedV7Article, malformedV7Problems);
  const malformedV7Fallback = applySafetyFallback(malformedV7Article, malformedV7Problems);
  assert(
    'malformed leading-bracket V7 is collected and deleted',
    malformedV7Repairs.some((item) => item.type === 'v7_body') &&
      malformedV7Fallback.applied.includes('v7_body') &&
      !/There's no way to request or pay for a better local ranking on Google/.test(malformedV7Fallback.article.body),
    JSON.stringify({ repairs: malformedV7Repairs, body: malformedV7Fallback.article.body })
  );

  markdownSegmentFixtures();
  await structuredOutputFixtures();

  const numberedEvidence = [];
  for (let i = 1; i <= 21; i += 1) {
    if (i === 6) {
      numberedEvidence.push({
        about: 'complete info',
        quote: 'Businesses with complete and accurate info are more likely to show up in local search results.'
      });
    } else if (i === 21) {
      numberedEvidence.push({
        about: 'category edit',
        quote: 'If you add or edit an existing category, you might be asked to verify the business again.'
      });
    } else {
      numberedEvidence.push({
        about: `filler ${i}`,
        quote: `Google Business Profile filler claim number ${i} stays long enough for an evidence unit.`
      });
    }
  }
  const numberedPack = {
    needed: true,
    sources: [
      {
        id: 'S1',
        url: 'https://support.google.com/business/answer/7091?hl=en',
        title: 'Tips to improve your local ranking on Google',
        excerpt: '',
        evidence: numberedEvidence
      }
    ]
  };
  const numberedClaims = buildAllowedClaims(numberedPack);
  const ac6 = numberedClaims.find((item) => item.id === 'AC6');
  const ac21 = numberedClaims.find((item) => item.id === 'AC21');
  assert(
    'numbered pack exposes AC6 and AC21',
    Boolean(ac6 && ac21 && /more likely/.test(ac6.safe_wording) && /might be asked/.test(ac21.safe_wording)),
    JSON.stringify(numberedClaims.map((item) => item.id + ':' + (item.safe_wording || '').slice(0, 40)))
  );
  const ac6Cited = renderCitedClaim(ac6, { cite: true });
  const ac21Cited = renderCitedClaim(ac21, { cite: true });
  const numberedCtx = ctx(numberedPack, numberedClaims);
  const githubLikeDraft = neverDraft(
    [
      '## Local ranking',
      '',
      "If you've claimed the profile but never finished setting it up, you're in a similar position. {{AC6}}",
      '',
      "If you've never looked at your category selection, that's worth doing this week. {{AC21}}",
      '',
      'Everyone can get a listing to show up overnight.',
      '',
      "[There's no way to request or pay for a better local ranking on Google.",
      '',
      'Fix the listing first — then judge spend.',
      '',
      'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
    ].join('\n')
  );
  const githubAssembled = assembleArticle(githubLikeDraft, numberedClaims);
  const githubMid = validateGeneratedArticle(githubAssembled, numberedCtx);
  const githubFallback = applySafetyFallback(githubAssembled, githubMid);
  let githubArticle = githubAssembled;
  if (githubFallback.applied.length && !githubFallback.refused) {
    githubArticle = githubFallback.article;
    if (githubFallback.needsAssemble) {
      githubArticle = assembleArticle(githubArticle, numberedClaims);
    }
    githubArticle = refreshAssemblyState(githubArticle, numberedClaims);
  }
  const githubFinal = validateGeneratedArticle(githubArticle, numberedCtx);
  assert(
    'GitHub-like pipeline applies em dash, V9, and V7 repairs',
    githubFallback.applied.includes('em_dash') &&
      githubFallback.applied.includes('v9_body') &&
      githubFallback.applied.includes('v7_body') &&
      githubFallback.applied.length === 3,
    JSON.stringify({ applied: githubFallback.applied, mid: githubMid.map((item) => item.code) })
  );
  assert(
    'GitHub-like pipeline preserves AC6 and AC21',
    githubArticle.body.includes(ac6Cited) && githubArticle.body.includes(ac21Cited),
    githubArticle.body
  );
  assert(
    'GitHub-like pipeline removes em dash, everyone, and raw V7',
    !githubArticle.body.includes('\u2014') &&
      !/\beveryone\b/i.test(githubArticle.body) &&
      !/\[There's no way to request or pay for a better local ranking on Google\.(?!])/m.test(githubArticle.body),
    githubArticle.body
  );
  assert(
    'GitHub-like pipeline has no false V6 and passes final validation',
    !hasCode(githubFinal, 'V6_ABSOLUTE_WORDING') && githubFinal.length === 0,
    githubFinal.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const latestEvidence = [];
  for (let i = 1; i <= 5; i += 1) {
    if (i === 5) {
      latestEvidence.push({
        about: 'prominence',
        quote:
          'Prominence means how well-known a business is. A business that is prominent in the real world is more likely to be prominent in local search results.'
      });
    } else {
      latestEvidence.push({
        about: `filler ${i}`,
        quote: `Google Business Profile filler claim number ${i} stays long enough for an evidence unit.`
      });
    }
  }
  const latestPack = {
    needed: true,
    sources: [
      {
        id: 'S1',
        url: 'https://support.google.com/business/answer/7091?hl=en',
        title: 'Tips to improve your local ranking on Google',
        excerpt: '',
        evidence: latestEvidence
      }
    ]
  };
  const latestClaims = buildAllowedClaims(latestPack);
  const ac5 = latestClaims.find((item) => item.id === 'AC5');
  assert(
    'latest-run pack exposes AC5 prominence claim',
    Boolean(ac5 && /Prominence means how well-known a business is/.test(ac5.safe_wording || ac5.claim)),
    JSON.stringify(ac5)
  );
  const ac5Cited = renderCitedClaim(ac5, { cite: true });
  const latestCtx = ctx(latestPack, latestClaims);
  const latestDraft = neverDraft(
    [
      'That depends on what the site actually has.',
      '',
      '### No Reviews, or Reviews That Never Get a Response',
      '',
      '{{AC5}}',
      '',
      'Everyone assumes the listing fixes itself.',
      '',
      "[There's no way to request or pay for a better local ranking on Google.",
      '',
      'If tracking is already in place, you may not need Brandible. If it is not, Brandible can set it up.'
    ].join('\n')
  );
  const latestAssembled = assembleArticle(latestDraft, latestClaims);
  const latestUnits = segmentMarkdownSentences(latestAssembled.body);
  const commentaryUnit = latestUnits.find((item) => item === 'That depends on what the site actually has.');
  const headingUnit = latestUnits.find((item) => item === '### No Reviews, or Reviews That Never Get a Response');
  const ac5Unit = latestUnits.find((item) => item.includes(ac5Cited) || /Prominence means how well-known a business is/.test(item));
  assert(
    'latest-run commentary before ### is its own sentence',
    Boolean(commentaryUnit) && !/No Reviews/.test(commentaryUnit) && !/Prominence/.test(commentaryUnit),
    JSON.stringify(latestUnits)
  );
  assert(
    'latest-run ### No Reviews heading is its own unit',
    Boolean(headingUnit) &&
      isMarkdownHeading(headingUnit) &&
      !/That depends/.test(headingUnit) &&
      !/Prominence/.test(headingUnit),
    JSON.stringify(latestUnits)
  );
  assert(
    'latest-run AC5 is its own cited factual unit',
    Boolean(ac5Unit) &&
      ac5Unit !== commentaryUnit &&
      ac5Unit !== headingUnit &&
      /Prominence means how well-known a business is/.test(ac5Unit),
    JSON.stringify({ ac5Cited, ac5Unit, units: latestUnits })
  );

  const latestFirst = validateGeneratedArticle(latestAssembled, latestCtx);
  assert(
    'latest-run commentary/heading do not cause false V6 against AC5',
    !latestFirst.some((item) => item.code === 'V6_ABSOLUTE_WORDING' && /AC5/.test(item.message)),
    latestFirst.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );
  assert(
    'latest-run everyone produces V9',
    hasCode(latestFirst, 'V9_QUANTIFIER') &&
      latestFirst.some((item) => /unsupported quantifier in body/i.test(item.message)),
    latestFirst.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );
  assert(
    'latest-run malformed leading-[ raw Google assertion produces V7',
    latestFirst.some(
      (item) =>
        item.code === 'V7_CLAIM_LEDGER' &&
        /factual platform assertion is not an approved claim token/i.test(item.message) &&
        /There's no way to request or pay for a better local ranking on Google/i.test(item.message)
    ),
    latestFirst.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  const latestRevised = latestAssembled;
  const latestAfterRevision = validateGeneratedArticle(latestRevised, latestCtx);
  const latestFallback = applySafetyFallback(latestRevised, latestAfterRevision);
  assert(
    'latest-run existing v7_body fallback deletes the raw Google assertion',
    !latestFallback.refused &&
      latestFallback.applied.includes('v7_body') &&
      latestFallback.applied.includes('v9_body') &&
      !/There's no way to request or pay for a better local ranking on Google/.test(latestFallback.article.body),
    JSON.stringify({ applied: latestFallback.applied, body: latestFallback.article.body })
  );

  let latestArticle = latestRevised;
  if (latestFallback.applied.length && !latestFallback.refused) {
    latestArticle = latestFallback.article;
    if (latestFallback.needsAssemble) {
      latestArticle = assembleArticle(latestArticle, latestClaims);
    }
    latestArticle = refreshAssemblyState(latestArticle, latestClaims);
  }
  const latestFinal = validateGeneratedArticle(latestArticle, latestCtx);
  assert(
    'latest-run everyone is deleted and AC5 remains intact',
    !/\beveryone\b/i.test(latestArticle.body) && latestArticle.body.includes(ac5Cited),
    latestArticle.body
  );
  assert(
    'latest-run refreshed sourced ledger still contains AC5',
    latestArticle.claim_tokens_used.includes('AC5') &&
      latestArticle.claims.some((item) => item.kind === 'sourced_fact' && item.allowed_claim_id === 'AC5') &&
      latestArticle.rendered_facts.some((item) => item.id === 'AC5' && latestArticle.body.includes(item.text)),
    JSON.stringify({
      used: latestArticle.claim_tokens_used,
      claims: latestArticle.claims,
      rendered: latestArticle.rendered_facts
    })
  );
  assert(
    'latest-run final validation has zero problems',
    latestFinal.length === 0,
    latestFinal.map((item) => `${item.id}: ${item.message}`).join(' | ')
  );

  if (failed) {
    console.error(`\n${failed} fixture(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll contract fixtures passed.');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
