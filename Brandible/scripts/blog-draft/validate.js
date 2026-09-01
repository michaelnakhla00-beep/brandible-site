'use strict';

const { checkSeoFields } = require('./seo');
const { extractMarkdownHrefs, allowedUrlSet } = require('./catalog');
const { buildAllowlist, moneySetHas } = require('./facts');
const { findAllowedClaim, isAbsoluteUpgrade } = require('./allowed-claims');
const { matchingRenderedFact, isRenderedAllowedFact, extractClaimTokens, ctaNamesBrandible } = require('./assemble');
const {
  sourceUrlSet,
  topicAllowedProducts,
  inferSourceProduct,
  productsCompatible,
  sourceEvidenceText,
  findSource,
  topicProductScope
} = require('./research');

const RESOLUTION_ACTIONS = new Set([
  'deleted',
  'replaced_with_token',
  'removed_token',
  'attributed',
  'self_qualified',
  'rewritten_to_evidence'
]);

const BAN_PHRASES = [
  'in today’s',
  "in today's",
  'in this article',
  'let’s dive',
  "let's dive",
  'without further ado',
  'have you ever wondered',
  'picture this',
  'imagine this',
  'it’s no secret',
  "it's no secret",
  'now more than ever',
  'the bottom line is this',
  'unlock your potential',
  'game-changer',
  'game-changing',
  'cutting-edge',
  'next-level',
  'supercharge',
  'skyrocket',
  'best-in-class',
  'world-class',
  'industry-leading',
  'harness the power',
  'stay ahead of the curve',
  'take it to the next level',
  'delve',
  'studies show',
  'experts agree'
];

const PHASE1_HARD_CHECKS = [
  'No unsupported quantifiers: most people, most businesses, everyone, or similar, unless grounded in an approved source.',
  'No illustrative numbers that can be mistaken for facts (response times, percentages, timelines, prices) unless they are approved Brandible first-party figures.',
  'Brandible prices and timelines must come from first-party-facts.json and be clearly labeled as Brandible’s.',
  'Do not describe ordinary automation as AI. Auto-replies and missed-call texts are automation. A chat that answers questions may be AI. Use the simplest correct term.',
  'If the CTA names Brandible, it must self-qualify, including a reasonable case where the reader may not need the service.'
];

const PHASE2_GROUNDING_CHECKS = [
  'Every sourced_fact must be supported by the stored source excerpt or evidence quotes, not merely by a related page from the same company.',
  'If the stored excerpt and evidence quotes do not support the exact specificity, soften or remove the sentence. Do not strengthen the source’s wording in claims[] or in the body.',
  'Do not use evidence about one product/surface as proof of another. Local Services Ads documentation is not evidence for organic Google Business Profile or Maps ranking unless the sentence is explicitly about Local Services Ads.',
  'Platform instructions need a current first-party source. Do not recommend a feature that appears deprecated or materially changed (for example seeding traditional Google Business Profile Q&A after late 2025).',
  'Unsupported comparative or causal performance claims are not allowed as facts: “perform better,” “one of the most important,” “one of the most underused,” “often comes down to a few hours of setup,” and similar. Rewrite as practical advice or opinion, or drop them.',
  'If the article includes factual guidance on categories, services, reviews, description limits, photos, hours, or other platform features, the source pack must contain support for those sections. Do not introduce platform guidance the pack does not cover.',
  'claims[] is a complete ledger. Every material externally verifiable fact in the final title, meta fields, excerpt, or body must be recorded there as sourced_fact, first_party, hypothetical, or opinion. Omitting a fact from claims[] does not exempt it.',
  'Unsupported quantifiers (most people, most businesses, most local business owners, everyone) are checked in title, meta_title, meta_description, excerpt, and body.',
  'Externally researched platform facts need a natural reader-facing markdown link to the supporting source pack URL. Do not require citations on Brandible opinion, hypotheticals, or first-party Brandible pricing/results.',
  'Do not use absolute wording (for example “there’s no residual benefit”) unless the stored source excerpt or evidence quotes support that exact level of certainty.'
];

const CLAIM_KINDS = new Set(['sourced_fact', 'first_party', 'hypothetical', 'opinion']);

const STOP_WORDS = new Set(
  'a an and are as at be by can for from has have how if in is it its may more not of on or than that the this to was were what when with you your google business profile maps search local results'.split(
    ' '
  )
);

const COMPARATIVE_PATTERNS = [
  /\breal photos perform better than stock\b/i,
  /\bstock images? perform\b/i,
  /\bperform(?:s|ed)? better than\b/i,
  /\bone of the most important\b/i,
  /\bone of the most underused\b/i,
  /\bthe most important (?:field|fields|factor|signal)\b/i,
  /\boften comes down to a few hours\b/i,
  /\brank(?:s|ed|ing)? higher\b/i,
  /\boutperform(?:s|ed)?\b/i
];

const CAUSAL_RANKING_PATTERNS = [
  /\bmore likely to (?:show|rank|appear)\b/i,
  /\bmay affect(?: how)?(?: profiles? )?rank/i,
  /\binfluence(?:s|d)? (?:profile quality|ranking|how profiles rank)\b/i,
  /\bhelp(?:s|ed)? (?:your )?business(?:’s|'s)? local ranking\b/i,
  /\bdetermine(?:s)? local ranking\b/i
];

const PLATFORM_FEATURES = [
  {
    id: 'categories',
    body: [/\bprimary category\b/i, /\bbusiness categor(?:y|ies)\b/i],
    pack: [/\bcategor/i]
  },
  {
    id: 'services',
    body: [/\blist(?: the)?(?: specific)? services\b/i, /\bgoogle lets you list\b/i, /\bedit services\b/i],
    pack: [/\bservices?\b/, /\bservice list\b/i]
  },
  {
    id: 'photos',
    body: [/\badd photos\b/i, /\bprofiles with photos\b/i, /\bphoto guidelines\b/i],
    pack: [/\bphotos?\b/, /\bvideos?\b/]
  },
  {
    id: 'description',
    body: [/\b750 characters?\b/i, /\bbusiness description\b/i, /\bfrom the business\b/i],
    pack: [/\b750 characters?\b/i, /\bdescription field\b/i, /\bbusiness description\b/i]
  },
  {
    id: 'reviews',
    body: [/\brespond(?:ing)? to (?:the )?reviews\b/i, /\bgoogle reviews\b/i],
    pack: [/\breviews?\b/]
  },
  {
    id: 'hours',
    body: [/\bkeep (?:them|hours) accurate\b/i, /\bspecial hours\b/i, /\bbusiness hours\b/i],
    pack: [/\bhours\b/]
  }
];

const FEATURE_WATCHLIST = [
  {
    id: 'gbp_qa',
    recommend:
      /\b(?:you can seed|seed your own|seed(?:ing)? (?:your )?(?:own )?(?:questions|Q\s*&\s*A)|Q\s*&\s*A\b[\s\S]{0,400}(?:missed opportunity|leave this blank|you can seed|seed your own))/i,
    reason:
      'Google discontinued the My Business Q&A API on November 3, 2025 and began replacing the traditional Business Profile Q&A experience. Do not instruct readers to seed Q&A unless a current first-party source in the pack shows that workflow still exists.'
  }
];

function articleFullText(article) {
  return [
    article.title,
    article.meta_title,
    article.meta_description,
    article.excerpt,
    article.body
  ].join('\n');
}

function containsEmDash(text) {
  return String(text).includes('\u2014');
}

function firstBanHit(text) {
  const lower = String(text).toLowerCase();
  return BAN_PHRASES.find((phrase) => lower.includes(phrase)) || null;
}

function firstUnsupportedQuantifier(text) {
  const match = String(text).match(
    /\b(?:most|the majority of)\s+(?:(?:local|small|service)\s+)*(?:business\s+)?(?:people|businesses|owners|customers|callers|visitors|companies)\b|\bevery(?:one|body)\b/i
  );
  return match ? match[0] : null;
}

function checkQuantifiersByField(article) {
  const problems = [];
  const fields = [
    ['title', article.title],
    ['meta_title', article.meta_title],
    ['meta_description', article.meta_description],
    ['excerpt', article.excerpt],
    ['body', article.body]
  ];
  for (const [name, value] of fields) {
    const hit = firstUnsupportedQuantifier(value);
    if (hit) {
      problems.push({
        code: 'V9_QUANTIFIER',
        message: `Unsupported quantifier in ${name}: “${hit}”. Ground it in an approved source, or describe the mechanism.`
      });
    }
  }
  return problems;
}

function percentInAllowedClaims(amount, allowedClaims) {
  const needle = String(amount);
  return (allowedClaims || []).some((item) => {
    const blob = `${item.claim || ''} ${item.evidence || ''}`;
    return new RegExp(`${needle}\\s*%`).test(blob) || blob.includes(needle);
  });
}

function checkPrices(text, allowlist) {
  const problems = [];
  const re = /\$\s*([\d,]+(?:\.\d+)?)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const amount = Number(String(match[1]).replace(/,/g, ''));
    const start = Math.max(0, match.index - 180);
    const window = text.slice(start, match.index + match[0].length);
    const labeled = /Brandible|our range|our (?:typical )?(?:website )?projects|we (?:typically |usually )?(?:charge|run|build)|PEAC/i.test(
      window
    );
    if (!moneySetHas(allowlist, amount)) {
      problems.push({
        code: 'V1_UNAPPROVED_FIRST_PARTY_NUMBER',
        message: `Price ${match[0]} is not an approved Brandible first-party figure. Delete that number and the claim that depends on it. Do not substitute another number. Do not estimate. Do not infer a market range.`
      });
      continue;
    }
    if (!labeled) {
      problems.push({
        code: 'V5_UNLABELED_FIRST_PARTY',
        message: `Price ${match[0]} must be clearly labeled as Brandible’s.`
      });
    }
  }
  return problems;
}

function checkBrandiblePercents(text, allowlist, allowedClaims) {
  const problems = [];
  const re = /(\d+(?:\.\d+)?)\s*%/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const amount = Number(match[1]);
    const start = Math.max(0, match.index - 160);
    const window = text.slice(start, match.index + match[0].length + 80);
    const brandibleWindow = /Brandible|PEAC/i.test(window);
    if (!brandibleWindow) continue;
    if (allowlist.percents.has(amount)) continue;
    if (percentInAllowedClaims(amount, allowedClaims)) continue;
    problems.push({
      code: 'V1_UNAPPROVED_FIRST_PARTY_NUMBER',
      message: `Percentage “${match[0]}” is not an approved Brandible first-party figure. Delete that number and the claim that depends on it. Do not substitute another number.`
    });
  }
  return problems;
}

function firstUnsourcedMetric(text, sourcePack, allowlist) {
  if (/\bin a week or two\b/i.test(text)) {
    return {
      code: 'V1_UNAPPROVED_FIRST_PARTY_NUMBER',
      message: 'Illustrative timeline “in a week or two” can be mistaken for a factual delivery window.'
    };
  }
  const hasExternalSources = sourcePack && sourcePack.needed && sourcePack.sources && sourcePack.sources.length > 0;
  const percent = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percent) {
    const start = Math.max(0, percent.index - 160);
    const window = text.slice(start, percent.index + percent[0].length + 80);
    const amount = Number(percent[1]);
    const labeled = /Brandible|PEAC/i.test(window);
    const allowlisted = allowlist && allowlist.percents.has(amount) && labeled;
    if (!allowlisted && !hasExternalSources) {
      return {
        code: 'V1_UNAPPROVED_FIRST_PARTY_NUMBER',
        message: `Percentage “${percent[0]}” looks like data and is not an approved Brandible figure.`
      };
    }
  }
  const responseTime = text.match(/\b\d+\s*(?:-|–)?\s*\d*\s*(seconds?|minutes?)\b/i);
  if (responseTime && !hasExternalSources) {
    return {
      code: 'V1_UNAPPROVED_FIRST_PARTY_NUMBER',
      message: `Response-time figure “${responseTime[0]}” looks like data. Describe the mechanism, or drop the number.`
    };
  }
  const duration = text.match(/\b(?:in|within)\s+\d+\s*(hours?|days?|weeks?|months?)\b/i);
  if (duration) {
    const start = Math.max(0, duration.index - 160);
    const window = text.slice(start, duration.index + duration[0].length);
    const allowedWebsiteWeeks =
      allowlist &&
      allowlist.timelines.some((item) => item.unit === 'weeks') &&
      /\b2\s*[–-]\s*4\s+weeks\b/i.test(window) &&
      /Brandible/i.test(window);
    if (!allowedWebsiteWeeks && !hasExternalSources) {
      return {
        code: 'V1_UNAPPROVED_FIRST_PARTY_NUMBER',
        message: `Timeline “${duration[0]}” looks like data and is not a labeled Brandible first-party figure.`
      };
    }
  }
  return null;
}

function automationDescribedAsAi(text) {
  const sections = String(text).split(/^##\s+/m);
  for (const section of sections) {
    const block = section.slice(0, 900);
    const framesAi = /\bAI\b/i.test(block);
    const ordinaryAutomation = /automatic text|auto-reply|auto reply|text reply when a call|unanswered/i.test(block);
    const distinguishes = /\bautomation\b/i.test(block) || /not AI|isn['’]t AI|is automation/i.test(block);
    if (framesAi && ordinaryAutomation && !distinguishes) {
      return 'Describes ordinary automation (automatic texts, auto-replies) as AI. Use the simplest correct term.';
    }
  }
  return null;
}

function bodyContainsIdea(body, idea) {
  const text = String(idea || '').trim();
  if (text.length < 12) return false;
  const nBody = normalizeEvidence(body);
  const nIdea = normalizeEvidence(text);
  if (!nIdea) return false;
  if (nBody.includes(nIdea)) return true;
  const words = nIdea.split(' ').filter((word) => word.length > 2);
  if (words.length < 4) return nBody.includes(nIdea.slice(0, Math.min(20, nIdea.length)));
  const hits = words.filter((word) => nBody.includes(word));
  return hits.length / words.length >= 0.6;
}

function checkCtaContract(article) {
  const problems = [];
  const cta = article.cta && typeof article.cta === 'object' ? article.cta : {};
  if (!ctaNamesBrandible(article)) return problems;
  const fit = String(cta.fit_case || '').trim();
  const walkAway = String(cta.walk_away_case || '').trim();
  if (!fit || !walkAway) {
    problems.push({
      code: 'V2_CTA_SELF_QUALIFY',
      message:
        'CTA names Brandible but the output contract is missing fit_case or walk_away_case. Supply both fields. Code renders them into the close. Walk-away: if the reader already has the identified problem handled effectively, they may not need Brandible.'
    });
    return problems;
  }
  if (!bodyContainsIdea(article.body, fit)) {
    problems.push({
      code: 'V2_CTA_SELF_QUALIFY',
      message: 'CTA fit_case is not present in the article body.'
    });
  }
  if (!bodyContainsIdea(article.body, walkAway)) {
    problems.push({
      code: 'V2_CTA_SELF_QUALIFY',
      message: 'CTA walk_away_case is not present in the article body.'
    });
  }
  return problems;
}

function checkInternalLinks(body, catalog) {
  const problems = [];
  const allowed = allowedUrlSet(catalog);
  const hrefs = extractMarkdownHrefs(body);
  const internal = hrefs.filter((href) => href.startsWith('/'));
  const seen = new Set();
  for (const href of internal) {
    if (seen.has(href)) {
      problems.push(`Internal link repeated: ${href}`);
    }
    seen.add(href);
    if (!allowed.has(href)) {
      problems.push(`Internal link is not in the approved catalog: ${href}`);
    }
  }
  if (seen.size > 3) {
    problems.push('Too many internal destinations. Keep 1–3 useful links.');
  }
  return problems;
}

function checkExternalLinks(body, sourcePack) {
  const problems = [];
  const allowed = sourceUrlSet(sourcePack);
  const hrefs = extractMarkdownHrefs(body);
  for (const href of hrefs) {
    if (!/^https?:\/\//i.test(href)) continue;
    if (!allowed.has(href)) {
      problems.push(`External link is not in the source pack: ${href}`);
    }
  }
  return problems;
}

function normalizeEvidence(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function significantTerms(text) {
  return normalizeEvidence(text)
    .split(' ')
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
}

function numbersIn(text) {
  return String(text).match(/\d+(?:\.\d+)?/g) || [];
}

function packEvidence(sourcePack, articleProduct) {
  return (sourcePack.sources || [])
    .filter((source) => productsCompatible(articleProduct, inferSourceProduct(source)))
    .map((source) =>
      [source.title, source.url, source.product, (source.features || []).join(' '), sourceEvidenceText(source)].join('\n')
    )
    .join('\n');
}

function claimProduct(text) {
  if (/local services ads|\blsa\b|ad rankings|cost(?:s)? per lead/i.test(text)) return 'local_services_ads';
  if (/\bgoogle ads\b|\bsearch ads\b/i.test(text)) return 'google_ads';
  if (/business profile|\bgbp\b|local search|local results|google maps/i.test(text)) {
    return 'google_business_profile';
  }
  return null;
}

function articleDiscussedProduct(article, topic) {
  if (topic) {
    const fromTopic = topicProductScope(topic);
    if (fromTopic) return fromTopic;
  }
  return claimProduct(`${article.title || ''} ${article.body || ''}`);
}

function evidenceHasTerm(evidence, term) {
  if (evidence.includes(term)) return true;
  if (term === 'information' && /\binfo\b/.test(evidence)) return true;
  return false;
}

function excerptSupportsClaim(claimText, excerpt) {
  const evidence = normalizeEvidence(excerpt);
  if (evidence.length < 20) {
    return { ok: false, reason: 'Source excerpt is empty or too thin to support the claim.' };
  }
  const terms = significantTerms(claimText);
  if (terms.length) {
    const hits = terms.filter((term) => evidenceHasTerm(evidence, term));
    const ratio = hits.length / terms.length;
    const specific = terms.filter((term) => term.length >= 5);
    const specificHits = specific.filter((term) => evidenceHasTerm(evidence, term));
    const specificRatio = specific.length ? specificHits.length / specific.length : 1;
    if (ratio < 0.4 || hits.length < Math.min(3, terms.length) || specificRatio < 0.7) {
      return {
        ok: false,
        reason: 'Stored excerpt does not support the exact claim. Soften or remove it.'
      };
    }
  }
  for (const num of numbersIn(claimText)) {
    if (!evidence.includes(num)) {
      return {
        ok: false,
        reason: `Claim uses “${num}” but that figure is not in the stored source excerpt.`
      };
    }
  }
  return { ok: true };
}

function claimStrongerThanSource(claimText, excerpt) {
  const evidence = excerpt || '';
  if (/stock/i.test(claimText) && !/stock/i.test(evidence)) {
    return 'Claim compares real vs stock photos, but the stored source does not.';
  }
  for (const pattern of COMPARATIVE_PATTERNS) {
    if (pattern.test(claimText) && !pattern.test(evidence)) {
      if (!/\b(?:better|higher|most important|most underused|outperform)\b/i.test(evidence)) {
        return 'Claim contains a stronger comparison than the stored source supports.';
      }
    }
  }
  for (const pattern of CAUSAL_RANKING_PATTERNS) {
    if (pattern.test(claimText)) {
      if (!/\b(?:more likely|rank|ranking|prominence|popularity|influence|affect|profile quality)\b/i.test(evidence)) {
        return 'Claim contains a stronger ranking or causal statement than the stored source supports.';
      }
    }
  }
  if (/prominence/i.test(claimText) && !/prominence/i.test(evidence) && /popularity/i.test(evidence)) {
    return 'Claim says “prominence” but the stored excerpt says “popularity.” Use the source’s wording.';
  }
  if (/\bno residual\b|there(?:['’]s| is) no residual/i.test(claimText)) {
    if (!/residual|stop paying|stop showing|no longer (?:show|appear)/i.test(evidence)) {
      return 'Absolute “no residual benefit” claim is stronger than the stored source supports.';
    }
  }
  if (/\bthere(?:['’]s| is) no\b|\bnever\b|\bcannot\b/i.test(claimText)) {
    if (!/\b(?:no |not |never |cannot |does not |doesn['’]t )/i.test(evidence)) {
      return 'Absolute statement is stronger than the stored source supports.';
    }
  }
  return null;
}

function sourceAllowsCurrentQa(sourcePack) {
  return (sourcePack.sources || []).some((source) => {
    const status = String(source.feature_status || 'unknown').toLowerCase();
    if (status === 'deprecated' || status === 'changing') return false;
    const blob = `${source.title || ''} ${sourceEvidenceText(source)} ${(source.features || []).join(' ')}`;
    return (
      status === 'current' &&
      /q\s*&\s*a|questions and answers|q_and_a/i.test(blob) &&
      /seed|post questions|answer questions|q&a section/i.test(blob)
    );
  });
}

function checkClaims(article, sourcePack, articleProduct, allowedClaims) {
  const problems = [];
  const claims = Array.isArray(article.claims) ? article.claims : [];
  const plan = allowedClaims || [];
  for (const claim of claims) {
    const kind = String(claim.kind || '').trim();
    const text = String(claim.claim || '').trim();
    if (!CLAIM_KINDS.has(kind)) {
      problems.push({
        code: 'V7_CLAIM_LEDGER',
        message: `Claim kind “${kind || '(empty)'}” is not allowed. Use sourced_fact, first_party, hypothetical, or opinion.`
      });
      continue;
    }
    if (!text) {
      problems.push({ code: 'V7_CLAIM_LEDGER', message: 'A claims[] entry is missing claim text.' });
      continue;
    }
    if (kind !== 'sourced_fact') continue;
    if (plan.length) {
      const allowed = findAllowedClaim(plan, claim.allowed_claim_id);
      if (!allowed) {
        problems.push({
          code: 'V7_CLAIM_LEDGER',
          message: `sourced_fact is not mapped to the allowed external-facts plan: “${text}” Set allowed_claim_id to an AC id from the plan, or delete the fact.`
        });
        continue;
      }
      if (claim.source_id && claim.source_id !== allowed.source_id) {
        problems.push({
          code: 'V7_CLAIM_LEDGER',
          message: `sourced_fact ${allowed.id} source_id ${claim.source_id} does not match the allowed claim source ${allowed.source_id}.`
        });
      }
      if (isAbsoluteUpgrade(allowed.evidence || allowed.claim, text)) {
        problems.push({
          code: 'V6_ABSOLUTE_WORDING',
          message: `sourced_fact upgrades certainty beyond allowed claim ${allowed.id}. Keep likelihood language from the stored evidence. Claim: “${text}”`
        });
      }
    }
    const sourceId = claim.source_id;
    if (!sourceId) {
      problems.push({ code: 'V3_SOURCE_ENTAILMENT', message: `sourced_fact has no source_id: “${text}”` });
      continue;
    }
    const source = findSource(sourcePack, sourceId);
    if (!source) {
      problems.push({
        code: 'V3_SOURCE_ENTAILMENT',
        message: `sourced_fact references ${sourceId}, which is missing from the source pack: “${text}”`
      });
      continue;
    }
    const excerpt = sourceEvidenceText(source);
    const sourceProduct = inferSourceProduct(source);
    const statedProduct = claimProduct(text) || articleProduct;
    if (sourceProduct === 'local_services_ads' && statedProduct === 'google_business_profile') {
      problems.push({
        code: 'V3_SOURCE_ENTAILMENT',
        message: `sourced_fact uses a Local Services Ads source for a Google Business Profile claim: “${text}” (${sourceId})`
      });
    } else if (statedProduct && !productsCompatible(statedProduct, sourceProduct)) {
      problems.push({
        code: 'V3_SOURCE_ENTAILMENT',
        message: `sourced_fact uses a ${sourceProduct} source for a ${statedProduct} claim: “${text}” (${sourceId})`
      });
    }
    const entailment = excerptSupportsClaim(text, excerpt);
    if (!entailment.ok) {
      problems.push({
        code: 'V3_SOURCE_ENTAILMENT',
        message: `sourced_fact is not supported by the stored excerpt (${sourceId}): ${entailment.reason} Claim: “${text}”`
      });
    }
    const stronger = claimStrongerThanSource(text, excerpt);
    if (stronger) {
      const absolute = /absolute/i.test(stronger);
      problems.push({
        code: absolute ? 'V6_ABSOLUTE_WORDING' : 'V3_SOURCE_ENTAILMENT',
        message: `sourced_fact is stronger than the stored source (${sourceId}): ${stronger} Claim: “${text}”`
      });
    }
  }
  return problems;
}

function stripMarkdownLinks(text) {
  return String(text || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function checkUnsupportedComparatives(article, sourcePack) {
  const problems = [];
  const body = stripMarkdownLinks(article.body || '');
  const claims = Array.isArray(article.claims) ? article.claims : [];
  for (const pattern of COMPARATIVE_PATTERNS) {
    const match = body.match(pattern);
    if (!match) continue;
    const supported = claims.some((claim) => {
      if (claim.kind !== 'sourced_fact') return false;
      if (!pattern.test(String(claim.claim || ''))) return false;
      const source = findSource(sourcePack, claim.source_id);
      if (!source) return false;
      const excerpt = sourceEvidenceText(source);
      return (
        excerptSupportsClaim(String(claim.claim || ''), excerpt).ok &&
        !claimStrongerThanSource(String(claim.claim || ''), excerpt)
      );
    });
    if (!supported) {
      problems.push(
        `Unsupported comparative or performance claim: “${match[0]}”. Needs a source excerpt that supports that comparison, or rewrite it as practical advice/opinion.`
      );
    }
  }
  return problems;
}

function surroundingSentence(body, index, length) {
  const start = body.lastIndexOf('.', index);
  const end = body.indexOf('.', index + length);
  const from = start === -1 ? Math.max(0, index - 180) : start + 1;
  const to = end === -1 ? Math.min(body.length, index + length + 180) : end + 1;
  return body.slice(from, to).trim();
}

function checkLinkedSentences(body, sourcePack, articleProduct) {
  const problems = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match;
  while ((match = re.exec(body)) !== null) {
    const url = match[2];
    const source = (sourcePack.sources || []).find((item) => item.url === url);
    if (!source) continue;
    const sentence = surroundingSentence(body, match.index, match[0].length);
    const sourceProduct = inferSourceProduct(source);
    const sentenceProduct = claimProduct(sentence) || articleProduct;
    if (sourceProduct === 'local_services_ads' && sentenceProduct === 'google_business_profile') {
      problems.push(
        `Citation product mismatch: the sentence is about Google Business Profile / local ranking but the linked source is Local Services Ads (${url}).`
      );
    } else if (sentenceProduct && sourceProduct !== 'unknown' && !productsCompatible(sentenceProduct, sourceProduct)) {
      problems.push(
        `Citation product mismatch: sentence appears to discuss ${sentenceProduct} but the linked source is ${sourceProduct} (${url}).`
      );
    }
    const stronger = claimStrongerThanSource(sentence, sourceEvidenceText(source));
    if (stronger) {
      problems.push(`Linked sentence is stronger than the stored source excerpt (${source.id}): ${stronger}`);
    }
  }
  return problems;
}

function checkMaterialSubsections(body, sourcePack, articleProduct) {
  if (!sourcePack.needed) return [];
  const problems = [];
  const evidence = packEvidence(sourcePack, articleProduct);
  for (const feature of PLATFORM_FEATURES) {
    const used = feature.body.some((pattern) => pattern.test(body));
    if (!used) continue;
    const covered = feature.pack.some((pattern) => pattern.test(evidence));
    if (!covered) {
      problems.push(
        `Article includes factual ${feature.id} guidance, but the source pack has no supporting excerpt for that feature. Drop the instruction or research that section.`
      );
    }
  }
  return problems;
}

function checkDeprecatedFeatures(body, sourcePack) {
  const problems = [];
  for (const feature of FEATURE_WATCHLIST) {
    if (!feature.recommend.test(body)) continue;
    if (sourceAllowsCurrentQa(sourcePack)) continue;
    problems.push(`Platform feature appears deprecated or materially changed: ${feature.reason}`);
  }
  return problems;
}

function checkTopicScope(article, topic) {
  if (!topic) return [];
  const allowed = topicAllowedProducts(topic);
  if (!allowed || allowed.includes('google_business_profile')) return [];
  const body = `${article.body || ''}\n${JSON.stringify(article.claims || [])}`;
  const problems = [];
  if (
    /this business IS a/i.test(body) ||
    /choose the category that completes/i.test(body) ||
    /\bprimary category\b/i.test(body) ||
    /Google Business Profile categor/i.test(body)
  ) {
    problems.push({
      code: 'V8_OUT_OF_SCOPE',
      message:
        'Out-of-scope Google Business Profile category guidance. This topic does not own GBP optimization. Remove that subsection and any sourced_fact that depends on it.'
    });
  }
  if (/local services ads|\bLSA\b/i.test(body) && !allowed.includes('local_services_ads')) {
    problems.push({
      code: 'V8_OUT_OF_SCOPE',
      message: 'Out-of-scope Local Services Ads guidance. Remove it unless the owned question is about Local Services Ads.'
    });
  }
  return problems;
}

function splitSentences(text) {
  return String(text || '')
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z*"“])/)
    .map((item) => item.trim())
    .filter((item) => item.length > 20);
}

function textOverlap(a, b) {
  const terms = significantTerms(a);
  if (!terms.length) return 0;
  const other = normalizeEvidence(b);
  const hits = terms.filter((term) => evidenceHasTerm(other, term));
  return hits.length / terms.length;
}

function coveringClaim(sentence, claims) {
  let best = null;
  let bestScore = 0;
  const plain = stripMarkdownLinks(sentence);
  for (const claim of claims || []) {
    const claimText = String(claim.claim || '');
    const score = Math.max(textOverlap(plain, claimText), textOverlap(claimText, plain) * 0.85);
    if (score > bestScore) {
      bestScore = score;
      best = claim;
    }
  }
  if (bestScore >= 0.45) return best;
  return null;
}

function looksLikeAdvice(sentence) {
  const text = stripMarkdownLinks(sentence).trim();
  return /^(?:\*\*)?(?:start with|then layer|run seo|get the site|fix the foundation|one reason|one more thing|the businesses that|without tracking, you're paying|that's a legitimate|this isn't a rule|if you want|if you're already|if you genuinely)/i.test(
    text
  );
}

function looksLikeHypothetical(sentence) {
  const text = stripMarkdownLinks(sentence);
  return (
    /\bif someone searches\b/i.test(text) ||
    /^(?:consider |a brand-new business |a business that['’]s been)/i.test(text.trim())
  );
}

function looksLikeFirstParty(sentence) {
  const text = stripMarkdownLinks(sentence);
  return /Brandible/i.test(text) && /(?:\$|15\s*%|PEAC|month-to-month|digital marketing engagements)/i.test(text);
}

function looksLikeExternalFact(sentence, sectionHeading) {
  const text = stripMarkdownLinks(sentence);
  if (looksLikeAdvice(text) || looksLikeHypothetical(text) || looksLikeFirstParty(text)) return false;
  if (/^#{1,6}\s/.test(text) || /^\*\*[^*]+\*\*\s*$/.test(text)) return false;
  if (/\?\s*$/.test(text)) return false;
  if (/\bno residual benefit\b/i.test(text) || /when you stop paying[\s\S]{0,80}stop showing up/i.test(text)) {
    return true;
  }
  const platform =
    /\b(?:google ads|google search ad|ad rank|google search|google runs an auction|organic (?:search|results)|conversion tracking|google doesn['’]t|google doesn't)\b/i.test(
      text
    ) || (/\bgoogle\b/i.test(text) && /\bauction\b/i.test(text));
  const mechanism =
    /\b(?:auction|ad rank|eligible to show|recalculated|determines? whether|track(?:s|ing)? whether clicks|lets you track|bidding for a position|doesn['’]t accept payment|doesn't accept payment|crawl a site|rank (?:a site |it )?higher)\b/i.test(
      text
    );
  const absoluteOutcome =
    /\bthere(?:['’]s| is) no\b/i.test(text) && /\b(?:google|ads|seo|search|rank|residual|lever)\b/i.test(`${sectionHeading} ${text}`);
  const untrackedRank =
    /\bnothing to rank\b/i.test(text) ||
    (/\bno (?:real )?content\b/i.test(text) && /\brank/i.test(text));
  return (platform && mechanism) || absoluteOutcome || untrackedRank;
}

function paragraphSourceHrefs(paragraph, sourcePack) {
  const allowed = sourceUrlSet(sourcePack);
  return extractMarkdownHrefs(paragraph).filter((href) => allowed.has(href));
}

function sourceForUrl(sourcePack, url) {
  return (sourcePack.sources || []).find((item) => item.url === url) || null;
}

function paragraphSupportsSentence(paragraph, sentence, sourcePack) {
  const hrefs = paragraphSourceHrefs(paragraph, sourcePack);
  for (const href of hrefs) {
    const source = sourceForUrl(sourcePack, href);
    if (!source) continue;
    const excerpt = sourceEvidenceText(source);
    if (excerptSupportsClaim(sentence, excerpt).ok && !claimStrongerThanSource(sentence, excerpt)) {
      return source;
    }
  }
  return null;
}

function bodySections(body) {
  const chunks = String(body || '').split(/^(?=##\s)/m);
  return chunks
    .map((chunk) => {
      const lines = chunk.trim();
      const headingMatch = lines.match(/^##\s+(.+)/);
      return {
        heading: headingMatch ? headingMatch[1].trim() : '',
        text: lines
      };
    })
    .filter((section) => section.text);
}

function paragraphLinksAllowedClaim(paragraph, allowed) {
  if (!allowed || !allowed.url) return false;
  return extractMarkdownHrefs(paragraph).includes(allowed.url);
}

function checkClaimLedger(article, sourcePack, allowedClaims) {
  const problems = [];
  const claims = Array.isArray(article.claims) ? article.claims : [];
  const pack = sourcePack && sourcePack.needed ? sourcePack : { needed: false, sources: [] };
  const plan = allowedClaims || [];

  const frontmatterBits = [
    ['title', article.title],
    ['meta_title', article.meta_title],
    ['meta_description', article.meta_description],
    ['excerpt', article.excerpt]
  ];
  for (const [field, value] of frontmatterBits) {
    for (const sentence of splitSentences(value)) {
      if (!looksLikeExternalFact(sentence, field)) continue;
      const covered = coveringClaim(sentence, claims);
      if (!covered) {
        problems.push({
          code: 'V7_CLAIM_LEDGER',
          message: `Factual claim in ${field} is not allowed outside a body claim token: “${sentence}” Move the fact into a {{AC#}} token in the body, or rewrite the field as non-factual.`
        });
      } else if (covered.kind === 'sourced_fact') {
        problems.push({
          code: 'V4_MISSING_SOURCE_LINK',
          message: `Factual claim in ${field} needs a reader-facing body citation, not only a claims[] entry: “${sentence}”`
        });
      }
    }
  }

  if (!pack.needed) return problems;

  for (const section of bodySections(article.body)) {
    const paragraphs = section.text.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      if (/^##\s+/.test(paragraph) && !paragraph.includes('\n')) continue;
      for (const sentence of splitSentences(paragraph)) {
        if (!looksLikeExternalFact(sentence, section.heading)) continue;
        const renderedMatch = matchingRenderedFact(sentence, article.rendered_facts || []);
        const covered = coveringClaim(sentence, claims);
        const linked = paragraphSupportsSentence(paragraph, stripMarkdownLinks(sentence), pack);
        const allowed = renderedMatch
          ? findAllowedClaim(plan, renderedMatch.id)
          : covered && covered.allowed_claim_id
            ? findAllowedClaim(plan, covered.allowed_claim_id)
            : null;

        if (/\bno residual benefit\b|there(?:['’]s| is) no residual/i.test(sentence) && !renderedMatch) {
          const excerpt = linked ? sourceEvidenceText(linked) : '';
          const anySupport = (pack.sources || []).some((source) => {
            const text = sourceEvidenceText(source);
            return (
              excerptSupportsClaim(sentence, text).ok && !claimStrongerThanSource(sentence, text)
            );
          });
          if (!anySupport) {
            problems.push({
              code: 'V6_ABSOLUTE_WORDING',
              message: `Absolute statement is not supported by the source pack at that level of certainty: “${stripMarkdownLinks(sentence)}” Soften it, or drop it.`
            });
            continue;
          }
          if (linked && claimStrongerThanSource(sentence, excerpt)) {
            problems.push({
              code: 'V6_ABSOLUTE_WORDING',
              message: `Absolute statement is stronger than the linked source excerpt: “${stripMarkdownLinks(sentence)}”`
            });
            continue;
          }
        }

        if (!renderedMatch) {
          problems.push({
            code: 'V7_CLAIM_LEDGER',
            message: `Factual platform assertion is not an approved claim token: “${stripMarkdownLinks(sentence)}” Replace it with an approved {{AC#}} token or delete it. Do not invent a new sourced sentence.`
          });
          continue;
        }
        if (allowed && allowed.requires_citation && !paragraphLinksAllowedClaim(paragraph, allowed)) {
          problems.push({
            code: 'V4_MISSING_SOURCE_LINK',
            message: `Approved claim ${allowed.id} is missing its reader-facing source link: “${stripMarkdownLinks(sentence)}” Code should insert a markdown link to ${allowed.url}.`
          });
        }
      }
    }
  }
  return problems;
}

function checkAbsoluteWording(article, allowedClaims) {
  const problems = [];
  const plan = allowedClaims || [];
  if (!plan.length) return problems;
  const body = String(article.body || '');
  for (const sentence of splitSentences(body)) {
    const plain = stripMarkdownLinks(sentence);
    if (isRenderedAllowedFact(sentence, article.rendered_facts || [])) continue;
    const matched = plan.find((item) => textOverlap(plain, item.claim) >= 0.4);
    if (!matched) continue;
    if (isAbsoluteUpgrade(matched.evidence || matched.claim, plain)) {
      problems.push({
        code: 'V6_ABSOLUTE_WORDING',
        message: `Body sentence upgrades certainty beyond allowed claim ${matched.id}: “${plain}” Replace it with {{${matched.id}}} or delete it.`
      });
    }
  }
  return problems;
}

function checkUnresolvedTokens(article) {
  const problems = [];
  const leftover = String(article.body || '').match(/\{\{\s*AC\d+\s*\}\}/g) || [];
  for (const token of leftover) {
    problems.push({
      code: 'V7_CLAIM_LEDGER',
      message: `Unresolved claim token ${token}. Use an approved {{AC#}} from the plan, or remove it.`
    });
  }
  const front = [
    ['title', article.title],
    ['meta_title', article.meta_title],
    ['meta_description', article.meta_description],
    ['excerpt', article.excerpt]
  ];
  for (const [name, value] of front) {
    const tokens = extractClaimTokens(value);
    if (!tokens.length) continue;
    problems.push({
      code: 'V7_CLAIM_LEDGER',
      message: `Claim tokens are only allowed in the body (${name}): ${tokens.map((id) => '{{' + id + '}}').join(', ')}`
    });
  }
  return problems;
}

function problemMessage(item) {
  if (item && typeof item === 'object') return String(item.message || '');
  return String(item || '');
}

function problemCode(item) {
  if (item && typeof item === 'object' && item.code) return item.code;
  return classifyMessage(problemMessage(item));
}

function classifyMessage(message) {
  const text = String(message || '');
  if (/not an approved Brandible first-party figure|unapproved Brandible|looks like data|in a week or two/i.test(text)) {
    return 'V1_UNAPPROVED_FIRST_PARTY_NUMBER';
  }
  if (/CTA |fit_case|walk_away|self-qualify|self.qualify/i.test(text)) return 'V2_CTA_SELF_QUALIFY';
  if (/Absolute statement|upgrades certainty|level of certainty/i.test(text)) return 'V6_ABSOLUTE_WORDING';
  if (
    /not supported by the stored excerpt|stronger than the stored source|stronger than the linked|Citation product mismatch|has no source_id|missing from the source pack/i.test(
      text
    )
  ) {
    return 'V3_SOURCE_ENTAILMENT';
  }
  if (/reader-facing source link|reader-facing body citation/i.test(text)) return 'V4_MISSING_SOURCE_LINK';
  if (/must be clearly labeled as Brandible/i.test(text)) return 'V5_UNLABELED_FIRST_PARTY';
  if (/allowed external-facts plan|not recorded in claims\[\]|allowed_claim_id|Claim kind/i.test(text)) {
    return 'V7_CLAIM_LEDGER';
  }
  if (/Out-of-scope/i.test(text)) return 'V8_OUT_OF_SCOPE';
  if (/Unsupported quantifier/i.test(text)) return 'V9_QUANTIFIER';
  return 'V10_OTHER';
}

function stampProblems(problems) {
  const counts = {};
  return (problems || []).map((item) => {
    const code = problemCode(item);
    const message = problemMessage(item);
    counts[code] = (counts[code] || 0) + 1;
    return {
      id: `${code}_${counts[code]}`,
      code,
      message
    };
  });
}

function allowedActionsForCode(code) {
  switch (code) {
    case 'V1_UNAPPROVED_FIRST_PARTY_NUMBER':
      return ['deleted'];
    case 'V2_CTA_SELF_QUALIFY':
      return ['self_qualified'];
    case 'V3_SOURCE_ENTAILMENT':
      return ['deleted', 'replaced_with_token'];
    case 'V4_MISSING_SOURCE_LINK':
      return ['deleted', 'replaced_with_token'];
    case 'V5_UNLABELED_FIRST_PARTY':
      return ['attributed', 'deleted'];
    case 'V6_ABSOLUTE_WORDING':
      return ['replaced_with_token', 'deleted'];
    case 'V7_CLAIM_LEDGER':
      return ['deleted', 'replaced_with_token', 'removed_token'];
    case 'V8_OUT_OF_SCOPE':
      return ['deleted'];
    case 'V9_QUANTIFIER':
      return ['rewritten_to_evidence', 'replaced_with_token', 'deleted'];
    case 'V10_OTHER':
      return ['deleted', 'rewritten_to_evidence', 'attributed', 'self_qualified'];
    default: {
      return ['deleted', 'replaced_with_token', 'removed_token', 'rewritten_to_evidence', 'attributed', 'self_qualified'];
    }
  }
}

function assertRevisionResolutions(problems, parsed) {
  const missing = [];
  const resolutions = parsed && Array.isArray(parsed.resolutions) ? parsed.resolutions : [];
  const byId = new Map();
  for (const item of resolutions) {
    if (item && item.failure_id) byId.set(String(item.failure_id), item);
  }
  for (const problem of problems || []) {
    const resolution = byId.get(problem.id);
    if (!resolution) {
      missing.push(`${problem.id}: no resolution`);
      continue;
    }
    const action = String(resolution.action || '').trim();
    if (!RESOLUTION_ACTIONS.has(action)) {
      missing.push(
        `${problem.id}: action must be one of deleted, replaced_with_token, removed_token, attributed, self_qualified, rewritten_to_evidence`
      );
      continue;
    }
    const allowed = allowedActionsForCode(problem.code);
    if (!allowed.includes(action)) {
      missing.push(`${problem.id}: action must be ${allowed.join(' or ')}`);
      continue;
    }
    if (action === 'replaced_with_token' && !/\{\{\s*AC\d+\s*\}\}/.test(String(resolution.resulting_sentence || ''))) {
      missing.push(`${problem.id}: replaced_with_token requires a resulting_sentence containing an {{AC#}} token`);
      continue;
    }
    if (action !== 'deleted' && !String(resolution.resulting_sentence || '').trim()) {
      missing.push(`${problem.id}: resulting_sentence required unless action is deleted`);
    }
  }
  return missing;
}

function formatProblem(problem) {
  if (problem && problem.id) return `${problem.id}: ${problem.message}`;
  return problemMessage(problem);
}

function revisionRepairHints(problems) {
  const hints = [];
  const list = problems || [];
  const hasCode = (code) => list.some((item) => problemCode(item) === code);
  if (hasCode('V1_UNAPPROVED_FIRST_PARTY_NUMBER')) {
    hints.push(
      'V1_UNAPPROVED_FIRST_PARTY_NUMBER: action must be deleted. Remove the unauthorized number and the claim that depends on it. Do not substitute another number. Do not estimate. Do not infer a market range.'
    );
  }
  if (hasCode('V5_UNLABELED_FIRST_PARTY')) {
    hints.push(
      'V5_UNLABELED_FIRST_PARTY: action attributed or deleted. Keep the approved figure and put “Brandible” in the same clause, or delete the figure.'
    );
  }
  if (hasCode('V9_QUANTIFIER')) {
    hints.push(
      'V9_QUANTIFIER: rewrite the unsupported quantifier without the absolute wording, replace the factual sentence with an approved {{AC#}} token when appropriate, or delete it.'
    );
  }
  if (hasCode('V7_CLAIM_LEDGER')) {
    hints.push(
      'V7_CLAIM_LEDGER: replace the raw platform fact with an approved {{AC#}} token, delete it, or remove an unused token. Do not invent a new sourced sentence.'
    );
  }
  if (hasCode('V4_MISSING_SOURCE_LINK')) {
    hints.push(
      'V4_MISSING_SOURCE_LINK: replace the raw factual sentence with the matching {{AC#}} token, or delete it. Code inserts the source link.'
    );
  }
  if (hasCode('V2_CTA_SELF_QUALIFY')) {
    hints.push(
      'V2_CTA_SELF_QUALIFY: action self_qualified. Set cta.fit_case and cta.walk_away_case. Code renders both into the close. Walk-away: if the reader already has the identified problem handled effectively, they may not need Brandible.'
    );
  }
  if (hasCode('V6_ABSOLUTE_WORDING')) {
    hints.push(
      'V6_ABSOLUTE_WORDING: replace the upgraded sentence with the matching {{AC#}} token, or delete it. Do not rewrite the fact in prose.'
    );
  }
  if (hasCode('V3_SOURCE_ENTAILMENT')) {
    hints.push(
      'V3_SOURCE_ENTAILMENT: replace unsupported factual copy with an approved {{AC#}} token, or delete it. Do not paraphrase a sourced sentence.'
    );
  }
  if (hasCode('V8_OUT_OF_SCOPE')) {
    hints.push(
      'V8_OUT_OF_SCOPE: action deleted. Remove the out-of-scope sentences and any sourced_fact that depends on them.'
    );
  }
  return hints;
}

function validateGeneratedArticle(article, context) {
  const facts = context.facts;
  const catalog = context.catalog;
  const sourcePack = context.sourcePack || { needed: false, sources: [] };
  const cmsCategories = context.cmsCategories;
  const allowlist = context.allowlist || buildAllowlist(facts);
  const allowedClaims = context.allowedClaims || [];

  const problems = [];
  if (!article.title) problems.push({ code: 'V10_OTHER', message: 'Missing title.' });
  if (!article.body) problems.push({ code: 'V10_OTHER', message: 'Missing body.' });
  if (!article.excerpt) problems.push({ code: 'V10_OTHER', message: 'Missing excerpt.' });
  if (!article.meta_description) problems.push({ code: 'V10_OTHER', message: 'Missing meta_description.' });
  if (!cmsCategories.includes(article.category)) {
    problems.push({ code: 'V10_OTHER', message: `Category must be one of: ${cmsCategories.join(', ')}.` });
  }
  const full = articleFullText(article);
  if (containsEmDash(full)) {
    problems.push({ code: 'V10_OTHER', message: 'Contains an em dash.' });
  }
  const banHit = firstBanHit(`${article.title}\n${article.body}`);
  if (banHit) problems.push({ code: 'V10_OTHER', message: `Contains banned phrasing: "${banHit}".` });
  if (/^\s*#\s/m.test(article.body)) {
    problems.push({
      code: 'V10_OTHER',
      message: 'Body should not repeat the title as an H1. The CMS page already renders the title.'
    });
  }
  problems.push(...checkQuantifiersByField(article));
  problems.push(...checkPrices(full, allowlist));
  problems.push(...checkBrandiblePercents(full, allowlist, allowedClaims));
  const metricProblem = firstUnsourcedMetric(full, sourcePack, allowlist);
  if (metricProblem) problems.push(metricProblem);
  const aiProblem = automationDescribedAsAi(article.body);
  if (aiProblem) problems.push({ code: 'V10_OTHER', message: aiProblem });
  problems.push(...checkCtaContract(article));
  problems.push(...checkSeoFields(article).map((message) => ({ code: 'V10_OTHER', message })));
  problems.push(...checkInternalLinks(article.body, catalog).map((message) => ({ code: 'V10_OTHER', message })));
  problems.push(...checkExternalLinks(article.body, sourcePack).map((message) => ({ code: 'V10_OTHER', message })));
  const articleProduct = articleDiscussedProduct(article, context.topic);
  problems.push(...checkClaims(article, sourcePack, articleProduct, allowedClaims));
  problems.push(
    ...checkUnsupportedComparatives(article, sourcePack).map((message) => ({
      code: 'V3_SOURCE_ENTAILMENT',
      message
    }))
  );
  problems.push(
    ...checkLinkedSentences(article.body, sourcePack, articleProduct).map((message) => ({
      code: /Absolute/i.test(message) ? 'V6_ABSOLUTE_WORDING' : 'V3_SOURCE_ENTAILMENT',
      message
    }))
  );
  problems.push(
    ...checkMaterialSubsections(article.body, sourcePack, articleProduct).map((message) => ({
      code: 'V3_SOURCE_ENTAILMENT',
      message
    }))
  );
  problems.push(
    ...checkDeprecatedFeatures(article.body, sourcePack).map((message) => ({
      code: 'V8_OUT_OF_SCOPE',
      message
    }))
  );
  problems.push(...checkTopicScope(article, context.topic));
  problems.push(...checkUnresolvedTokens(article));
  problems.push(...checkClaimLedger(article, sourcePack, allowedClaims));
  problems.push(...checkAbsoluteWording(article, allowedClaims));
  return stampProblems(problems);
}

module.exports = {
  PHASE1_HARD_CHECKS,
  PHASE2_GROUNDING_CHECKS,
  RESOLUTION_ACTIONS,
  validateGeneratedArticle,
  revisionRepairHints,
  stampProblems,
  classifyMessage,
  assertRevisionResolutions,
  allowedActionsForCode,
  formatProblem
};
