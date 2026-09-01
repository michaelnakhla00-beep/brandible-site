'use strict';

const PRIMARY_DOMAINS = [
  'developers.google.com',
  'support.google.com',
  'ads.google.com',
  'business.google.com',
  'search.google.com',
  'developers.facebook.com',
  'facebook.com',
  'transparency.meta.com',
  'ftc.gov',
  'www.ftc.gov',
  'sba.gov',
  'www.sba.gov',
  'thinkwithgoogle.com'
];

const MAX_SEARCHES = 3;
const MAX_FETCHES = 5;
const MAX_FETCH_TOKENS = 8000;
const MAX_SOURCES = 5;
const MAX_EXCERPT = 2500;
const MAX_EVIDENCE_SNIPPETS = 6;
const MAX_EVIDENCE_QUOTE = 700;

const PRODUCT_URL_HINTS = [
  { product: 'local_services_ads', test: /support\.google\.com\/localservices/i },
  { product: 'google_ads', test: /ads\.google\.com|support\.google\.com\/google-ads/i },
  { product: 'google_business_profile', test: /support\.google\.com\/business|business\.google\.com|developers\.google\.com\/my-business/i },
  { product: 'google_search', test: /developers\.google\.com\/search|support\.google\.com\/webmasters/i },
  { product: 'google_maps', test: /support\.google\.com\/maps/i },
  { product: 'meta', test: /facebook\.com|developers\.facebook\.com|transparency\.meta\.com|instagram\.com/i }
];

function topicNeedsResearch(topic) {
  const blob = `${topic.title || ''} ${topic.service || ''} ${topic.type || ''} ${topic.detail || ''}`.toLowerCase();
  if (/how much should a small business website cost|how long a website project actually takes|doesn.?t lock you into a long contract/.test(blob)) {
    return false;
  }
  if (/thought leadership|opinion/.test(blob) && !/google|seo|ads|meta|facebook|maps|search/.test(blob)) {
    return false;
  }
  return /google|seo|gbp|business profile|ads|meta|facebook|instagram|maps|algorithm|search central|near me|local pack/.test(
    blob
  );
}

function ownedQuestion(topic) {
  return String((topic && topic.title) || '').trim();
}

function isPaidVsOrganicTopic(topic) {
  const title = ownedQuestion(topic).toLowerCase();
  return /google ads vs seo|ads vs seo|paid (?:search )?vs (?:organic )?seo/.test(title);
}

function topicProductScope(topic) {
  const title = ownedQuestion(topic).toLowerCase();
  const blob = `${topic.title || ''} ${topic.service || ''} ${topic.type || ''} ${topic.detail || ''}`.toLowerCase();
  if (/local services ads|\blsa\b/.test(title)) return 'local_services_ads';
  if (isPaidVsOrganicTopic(topic) || /google ads|\bppc\b|paid search/.test(title)) return 'google_ads';
  if (/business profile|\bgbp\b/.test(title)) return 'google_business_profile';
  if (/facebook|instagram/.test(title)) return 'meta';
  if (/local services ads|\blsa\b/.test(blob)) return 'local_services_ads';
  if (/google ads|\bppc\b|paid search/.test(blob) && !/business profile|\bgbp\b/.test(title)) {
    return 'google_ads';
  }
  if (/business profile|\bgbp\b|maps|local seo|near me|local pack/.test(blob) && !isPaidVsOrganicTopic(topic)) {
    return 'google_business_profile';
  }
  if (/facebook|instagram|\bmeta\b/.test(blob)) return 'meta';
  if (/google ads|\bppc\b/.test(blob)) return 'google_ads';
  return null;
}

function topicAllowedProducts(topic) {
  if (isPaidVsOrganicTopic(topic) || topicProductScope(topic) === 'google_ads') {
    return ['google_ads', 'google_search'];
  }
  const scope = topicProductScope(topic);
  if (scope === 'google_business_profile' || scope === 'google_maps') {
    return ['google_business_profile', 'google_maps'];
  }
  if (scope) return [scope];
  return null;
}

function inferSourceProduct(source) {
  if (!source) return 'unknown';
  const stated = String(source.product || source.surface || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (stated) {
    if (/local_services|localservices|\blsa\b/.test(stated)) return 'local_services_ads';
    if (/google_ads|google ads/.test(stated)) return 'google_ads';
    if (/business_profile|gbp|google business/.test(stated)) return 'google_business_profile';
    if (/google_search|search central|organic search/.test(stated)) return 'google_search';
    if (/google_maps|maps/.test(stated)) return 'google_maps';
    if (/meta|facebook|instagram/.test(stated)) return 'meta';
    return stated;
  }
  const blob = `${source.url || ''} ${source.title || ''} ${source.publisher || ''}`;
  for (const hint of PRODUCT_URL_HINTS) {
    if (hint.test.test(blob)) return hint.product;
  }
  return 'unknown';
}

function productsCompatible(articleProduct, sourceProduct) {
  if (!articleProduct || !sourceProduct || sourceProduct === 'unknown') return true;
  if (articleProduct === sourceProduct) return true;
  if (
    (articleProduct === 'google_business_profile' && sourceProduct === 'google_maps') ||
    (articleProduct === 'google_maps' && sourceProduct === 'google_business_profile')
  ) {
    return true;
  }
  if (
    (articleProduct === 'google_ads' && sourceProduct === 'google_search') ||
    (articleProduct === 'google_search' && sourceProduct === 'google_ads')
  ) {
    return true;
  }
  return false;
}

function emptyPack(reason, topic) {
  return {
    needed: false,
    skipped_reason: reason,
    topic_id: topic && topic.id,
    topic_product: topic ? topicProductScope(topic) : null,
    owned_question: topic ? ownedQuestion(topic) : null,
    allowed_products: topic ? topicAllowedProducts(topic) : null,
    queries: [],
    sources: [],
    retrieved_at: new Date().toISOString()
  };
}

function extractText(content) {
  if (!Array.isArray(content)) return String(content || '');
  return content
    .filter((block) => block && block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function parseJsonObject(text) {
  let candidate = String(text).trim();
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidate = fenced[1].trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Research step did not return JSON.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function harvestUrls(content) {
  const urls = [];
  if (!Array.isArray(content)) return urls;
  for (const block of content) {
    const result = block.web_search_tool_result || block.content;
    const nested = Array.isArray(block.content) ? block.content : Array.isArray(result) ? result : [];
    for (const item of nested) {
      const url = (item && (item.url || (item.page && item.page.url))) || null;
      if (url) urls.push(url);
    }
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const item of block.content) {
        if (item.url) urls.push(item.url);
        if (item.type === 'web_search_result' && item.url) urls.push(item.url);
      }
    }
  }
  return [...new Set(urls)];
}

function sourceFitsTopic(source, topic) {
  const allowed = topicAllowedProducts(topic);
  const product = inferSourceProduct(source);
  const url = String((source && source.url) || '');
  if (/support\.google\.com\/localservices/i.test(url) && !(allowed && allowed.includes('local_services_ads'))) {
    return false;
  }
  if (/support\.google\.com\/business|business\.google\.com|developers\.google\.com\/my-business/i.test(url)) {
    if (!allowed || !allowed.includes('google_business_profile')) return false;
  }
  if (!allowed) return productsCompatible(topicProductScope(topic), product);
  if (product === 'unknown') return true;
  return allowed.includes(product);
}

function normalizeEvidenceSnippets(item) {
  const raw = Array.isArray(item && item.evidence) ? item.evidence : [];
  const snippets = [];
  const seen = new Set();
  for (const entry of raw) {
    const quote = String((entry && (entry.quote || entry.text || entry.passage)) || '')
      .trim()
      .slice(0, MAX_EVIDENCE_QUOTE);
    if (!quote || seen.has(quote)) continue;
    seen.add(quote);
    snippets.push({
      about: String((entry && (entry.about || entry.claim || entry.topic)) || '')
        .trim()
        .slice(0, 120),
      quote
    });
    if (snippets.length >= MAX_EVIDENCE_SNIPPETS) break;
  }
  return snippets;
}

function normalizeSources(raw, harvestedUrls, topic) {
  const list = Array.isArray(raw) ? raw : [];
  const sources = [];
  const pushSource = (item, fallbackUrl) => {
    const url = String((item && item.url) || fallbackUrl || '').trim();
    if (!url) return;
    const source = {
      id: (item && item.id) || `S${sources.length + 1}`,
      url,
      title: String((item && item.title) || '').trim(),
      publisher: String((item && item.publisher) || '').trim(),
      excerpt: String((item && (item.excerpt || item.content || item.useful_passage)) || '')
        .trim()
        .slice(0, MAX_EXCERPT),
      evidence: normalizeEvidenceSnippets(item),
      why_selected: String((item && item.why_selected) || '').trim(),
      product: inferSourceProduct({ ...item, url }),
      features: Array.isArray(item && item.features)
        ? item.features.map((feature) => String(feature).trim()).filter(Boolean)
        : [],
      feature_status: String((item && item.feature_status) || 'unknown').trim() || 'unknown'
    };
    if (!sourceFitsTopic(source, topic)) return;
    if (sources.some((existing) => existing.url === source.url)) return;
    sources.push({ ...source, id: `S${sources.length + 1}` });
  };

  for (let i = 0; i < list.length && sources.length < MAX_SOURCES; i += 1) {
    pushSource(list[i], harvestedUrls[i]);
  }
  if (sources.length < 2) {
    for (const url of harvestedUrls) {
      if (sources.length >= Math.min(2, MAX_SOURCES)) break;
      pushSource({ url, why_selected: 'Harvested from search results.' }, url);
    }
  }
  return sources.slice(0, MAX_SOURCES);
}

async function anthropicMessages({ apiKey, model, messages, tools, maxTokens }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens || 4096,
      messages,
      tools
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Anthropic research request failed (${response.status}): ${JSON.stringify(payload).slice(0, 800)}`);
  }
  return payload;
}

function researchSearchPlan(topic, topicProduct) {
  const question = ownedQuestion(topic) || 'the selected topic';
  if (isPaidVsOrganicTopic(topic) || topicProduct === 'google_ads') {
    return [
      `Owned question: ${question}`,
      'Search plan (use the 3 searches for these jobs):',
      '1. Official Google Ads docs: how Search ads are selected and ranked (Ad Rank / auction), and that ads stop showing when spend stops.',
      '2. Official organic Search / SEO docs (Search Central). Not Google Business Profile field how-tos.',
      '3. Current Ads feature state: campaign types and conversion tracking. Skip deprecated or replaced workflows.',
      '',
      'Do not fetch Google Business Profile category, services, photos, hours, Q&A, or Local Services Ads pages unless the owned question is about those products.',
      'A page can be official and still be the wrong product. Do not add a source just because it is related to local marketing.'
    ].join('\n');
  }
  if (topicProduct === 'google_business_profile') {
    return [
      `Owned question: ${question}`,
      'Search plan (use the 3 searches for these jobs):',
      '1. Official ranking / how Google Business Profile and local results actually work.',
      '2. Official how-to for the profile fields this article will teach (categories, services, photos, description limits, reviews/hours as needed).',
      '3. Current feature state for instructional features. Search whether those features still exist or were deprecated/replaced.',
      '',
      'Do not use Local Services Ads or Google Ads as evidence for organic Business Profile or Maps ranking.'
    ].join('\n');
  }
  return [
    `Owned question: ${question}`,
    'Search plan (use the 3 searches for these jobs):',
    '1. Official ranking / how the product actually works for THIS topic’s product surface.',
    '2. Official how-to only for features this owned question needs. Do not pull adjacent-product field guides.',
    '3. Current feature state for instructional features. Platform instructions need stronger recency than evergreen concepts.',
    '',
    'Do not fetch Google Business Profile or Local Services Ads pages unless the owned question is about those products.'
  ].join('\n');
}

function researchPrompt(topic, topicProduct) {
  const allowed = topicAllowedProducts(topic) || [];
  return [
    'Research this Brandible blog topic using web_search, then web_fetch.',
    'Run at most 3 focused searches. Prefer official documentation over blogs that rank well.',
    'Allowed domains are already filtered on the tools. Stay on Google Ads help, Google Search Central, Google Business Profile / Maps help only when the owned question needs them, Meta/Facebook official docs, developers.google.com, or government sources.',
    '',
    researchSearchPlan(topic, topicProduct),
    '',
    'After search, fetch only the strongest 2–5 primary pages with web_fetch. Do not fetch more.',
    'Select pages whose stored text can support the exact claims, not merely a related page from the same company.',
    'A source being findable does not justify including it. Every source must help answer the owned question.',
    'Do not use Local Services Ads, Google Ads, or another product as evidence for organic Google Business Profile or Maps ranking unless the topic is explicitly about that other product.',
    'If a feature is deprecated or being replaced (for example traditional Business Profile Q&A after late 2025), include the first-party notice and set feature_status to "deprecated" or "changing". Do not treat a deprecated workflow as current setup advice.',
    'After each web_fetch, copy verbatim passages from THAT page only.',
    'excerpt: one short overview passage for compatibility. Do not pad it to cover every subsection.',
    'evidence: additional verbatim quotes for distinct planned claims this page actually states (ranking, categories, completeness, reviews, crawl/index timing, hours, photos, and similar). Each quote must appear on the fetched page.',
    'If the page does not contain a passage for a planned subsection, omit that evidence item. Do not paraphrase, summarize, or invent a stronger sentence so a later claim can pass.',
    'why_selected is a planning note only. It is not evidence. Never copy it into excerpt or evidence.',
    'Do not invent URLs, titles, or quotations.',
    '',
    `Topic product/surface to prefer: ${topicProduct || 'infer from the topic'}`,
    `Allowed products/surfaces: ${allowed.length ? allowed.join(', ') : 'infer from the owned question'}`,
    '',
    'Topic:',
    topic.detail || `${topic.id} ${topic.title}`,
    '',
    'Return JSON only:',
    '{ "queries": ["..."], "sources": [{ "id": "S1", "url": "", "title": "", "publisher": "", "product": "google_ads|google_search|google_business_profile|google_maps|local_services_ads|meta", "features": ["ad_rank","auction","conversion_tracking","organic_search","ranking"], "feature_status": "current|deprecated|changing|unknown", "excerpt": "verbatim overview passage from the page", "evidence": [{ "about": "ranking|categories|indexing|completeness|reviews|hours|photos", "quote": "verbatim passage from this page that actually states that point" }], "why_selected": "planning note only; not evidence" }] }'
  ].join('\n');
}

async function runAnthropicResearch({ apiKey, model, topic }) {
  const topicProduct = topicProductScope(topic);
  const tools = [
    {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: MAX_SEARCHES,
      allowed_domains: PRIMARY_DOMAINS
    },
    {
      type: 'web_fetch_20250910',
      name: 'web_fetch',
      max_uses: MAX_FETCHES,
      allowed_domains: PRIMARY_DOMAINS,
      citations: { enabled: true },
      max_content_tokens: MAX_FETCH_TOKENS
    }
  ];

  let messages = [{ role: 'user', content: researchPrompt(topic, topicProduct) }];
  let payload = await anthropicMessages({
    apiKey,
    model,
    messages,
    tools,
    maxTokens: 8192
  });

  let guard = 0;
  while (payload.stop_reason === 'pause_turn' && guard < 2) {
    guard += 1;
    messages = [
      ...messages,
      { role: 'assistant', content: payload.content },
      { role: 'user', content: 'Continue. Then return the JSON source pack only.' }
    ];
    payload = await anthropicMessages({
      apiKey,
      model,
      messages,
      tools,
      maxTokens: 8192
    });
  }

  const text = extractText(payload.content);
  let parsed = { queries: [], sources: [] };
  try {
    parsed = parseJsonObject(text);
  } catch (error) {
    parsed = { queries: [], sources: [], parse_error: error.message };
  }

  const harvested = harvestUrls(payload.content);
  const sources = normalizeSources(parsed.sources, harvested, topic);
  return {
    needed: true,
    skipped_reason: null,
    topic_id: topic.id,
    topic_product: topicProduct,
    owned_question: ownedQuestion(topic),
    allowed_products: topicAllowedProducts(topic),
    queries: Array.isArray(parsed.queries) ? parsed.queries.slice(0, MAX_SEARCHES) : [],
    sources,
    harvested_urls: harvested,
    retrieved_at: new Date().toISOString(),
    parse_error: parsed.parse_error || null
  };
}

async function buildSourcePack({ topic, provider, apiKey, model }) {
  if (!topicNeedsResearch(topic)) {
    return emptyPack('Topic does not require outside facts. Use first-party facts, opinion, and hypotheticals only.', topic);
  }
  if (provider !== 'anthropic') {
    return emptyPack(
      'Phase 2 web search and web fetch run on the Anthropic path. This provider skipped external research. Do not invent platform or statistical claims.',
      topic
    );
  }
  console.log('Research needed. Using Anthropic web_search + web_fetch.');
  const allowed = topicAllowedProducts(topic);
  if (allowed && allowed.length) {
    console.log(`Research scope: ${ownedQuestion(topic) || topic.id} (${allowed.join(', ')})`);
  }
  const pack = await runAnthropicResearch({ apiKey, model, topic });
  if (pack.sources.length === 0) {
    pack.skipped_reason =
      'Research ran but returned no usable sources. Do not invent external facts. Describe mechanisms or skip the claim.';
  } else {
    console.log(`Research pack: ${pack.sources.length} source(s).`);
  }
  return pack;
}

function sourceEvidenceText(source) {
  if (!source) return '';
  const quotes = Array.isArray(source.evidence)
    ? source.evidence.map((item) => (item && item.quote) || '').filter(Boolean)
    : [];
  return [source.excerpt, source.content, ...quotes].filter(Boolean).join('\n');
}

function sourcePackForPrompt(pack) {
  if (!pack.needed || !pack.sources.length) {
    return [
      'No external source pack is available.',
      pack.skipped_reason || 'Do not invent statistics, platform rules, dates, or citations.',
      'You may use Brandible first-party facts, labeled hypotheticals, and Brandible opinion only.'
    ].join('\n');
  }
  const lines = [
    pack.owned_question
      ? `Owned question: ${pack.owned_question}. Cite ONLY these sources, and only when they help answer that question. A source being available does not justify using it.`
      : 'You may cite ONLY these sources for external facts.',
    'A source supports a claim only if the stored excerpt or evidence quotes actually say it. why_selected is not evidence. Do not use page titles or memory.',
    'Do not use a related page from the same company as a substitute for the exact claim.',
    'Do not use evidence about one product/surface to make claims about another.',
    'If the stored excerpt and evidence quotes do not support the specificity, comparison, ranking statement, or causal claim, drop it or rewrite it as mechanism, opinion, or a labeled hypothetical.',
    'Do not instruct readers to use a platform feature unless a current first-party source in this pack shows that feature still exists.',
    'If you write factual guidance on categories, services, reviews, description limits, photos, hours, or similar, this pack must contain a stored quote for that feature. If it does not, omit the instruction.',
    'Do not introduce Google Business Profile field how-tos or Local Services Ads unless a source in this pack is for that product and the owned question requires it.',
    ''
  ];
  for (const source of pack.sources) {
    lines.push(`${source.id}. ${source.title || '(title unknown)'} — ${source.url}`);
    lines.push(`   Product/surface: ${inferSourceProduct(source)}`);
    if (source.features && source.features.length) {
      lines.push(`   Features: ${source.features.join(', ')}`);
    }
    if (source.feature_status) lines.push(`   Feature status: ${source.feature_status}`);
    if (source.publisher) lines.push(`   Publisher: ${source.publisher}`);
    if (source.excerpt) lines.push(`   Excerpt: ${source.excerpt}`);
    if (Array.isArray(source.evidence) && source.evidence.length) {
      lines.push('   Evidence quotes:');
      for (const item of source.evidence) {
        const about = item.about ? `[${item.about}] ` : '';
        lines.push(`   - ${about}${item.quote}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function sourceUrlSet(pack) {
  return new Set((pack.sources || []).map((item) => item.url));
}

function findSource(pack, sourceId) {
  return (pack.sources || []).find((item) => item.id === sourceId) || null;
}

module.exports = {
  topicNeedsResearch,
  topicProductScope,
  topicAllowedProducts,
  ownedQuestion,
  inferSourceProduct,
  productsCompatible,
  sourceEvidenceText,
  findSource,
  buildSourcePack,
  sourcePackForPrompt,
  sourceUrlSet,
  emptyPack
};
