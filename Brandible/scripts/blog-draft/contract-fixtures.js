'use strict';

const path = require('path');
const { loadFacts, buildAllowlist, factsForPrompt, moneySetHas } = require('./facts');
const { buildAllowedClaims, isAbsoluteUpgrade } = require('./allowed-claims');
const {
  assembleArticle,
  resolveClaimTokens,
  buildSourcedClaims,
  mergeNonSourcedClaims
} = require('./assemble');
const {
  validateGeneratedArticle,
  assertRevisionResolutions,
  stampProblems
} = require('./validate');

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

function run() {
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

  if (failed) {
    console.error(`\n${failed} fixture(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll contract fixtures passed.');
}

run();
