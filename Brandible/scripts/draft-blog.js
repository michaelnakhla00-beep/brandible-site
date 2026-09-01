#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BRANDIBLE_ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(BRANDIBLE_ROOT, 'blogs', 'posts');
const EDITORIAL_DIR = path.join(BRANDIBLE_ROOT, 'blogs', 'editorial');

const { loadFacts, factsForPrompt, buildAllowlist, allowlistForPrompt, allowlistSnapshot } = require('./blog-draft/facts');
const { buildCatalog, catalogForPrompt } = require('./blog-draft/catalog');
const { parseQueueTopics, findTopic: findQueuedTopic } = require('./blog-draft/queue');
const { buildSourcePack, sourcePackForPrompt } = require('./blog-draft/research');
const { buildAllowedClaims, allowedClaimsForPrompt } = require('./blog-draft/allowed-claims');
const { assembleArticle, refreshAssemblyState } = require('./blog-draft/assemble');
const { applySafetyFallback } = require('./blog-draft/safety-fallback');
const {
  PHASE1_HARD_CHECKS,
  PHASE2_GROUNDING_CHECKS,
  validateGeneratedArticle,
  revisionRepairHints,
  assertRevisionResolutions,
  formatProblem,
  allowedActionsForCode,
  formatV4Diagnostics
} = require('./blog-draft/validate');
const {
  completeAnthropicStructured,
  GENERATION_TOOL_NAME,
  REVISION_TOOL_NAME,
  GENERATION_INPUT_SCHEMA,
  REVISION_INPUT_SCHEMA
} = require('./blog-draft/anthropic-structured');

const CMS_CATEGORIES = [
  'Marketing',
  'Web Design',
  'SEO',
  'Social Media',
  'Business Tips',
  'Case Studies'
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function usage() {
  return [
    'Usage:',
    '  npm run blog:draft -- --topic 01',
    '  npm run blog:draft -- --from-editorial Brandible/blogs/editorial/drafts/topic-19-human-edit.md',
    '',
    'AI generation requires:',
    '  BLOG_DRAFT_PROVIDER=openai|anthropic',
    '  BLOG_DRAFT_MODEL=<model>',
    '  OPENAI_API_KEY or ANTHROPIC_API_KEY',
    '',
    'If both API keys are set, BLOG_DRAFT_PROVIDER is required.',
    'Phase 2 research (web search + web fetch) runs on the Anthropic path when the topic needs outside facts.',
    'Writes draft: true only. Does not publish, commit, or overwrite.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = { topic: null, fromEditorial: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (token === '--topic') {
      if (!argv[i + 1] || String(argv[i + 1]).startsWith('--')) {
        fail(`--topic requires a topic number.\n\n${usage()}`);
      }
      args.topic = argv[i + 1];
      i += 1;
    } else if (token.startsWith('--topic=')) {
      args.topic = token.slice('--topic='.length);
    } else if (token === '--from-editorial') {
      if (!argv[i + 1] || String(argv[i + 1]).startsWith('--')) {
        fail(`--from-editorial requires a file path.\n\n${usage()}`);
      }
      args.fromEditorial = argv[i + 1];
      i += 1;
    } else if (token.startsWith('--from-editorial=')) {
      args.fromEditorial = token.slice('--from-editorial='.length);
    } else {
      fail(`Unknown argument: ${token}\n\n${usage()}`);
    }
  }
  if (args.topic != null && String(args.topic).trim() === '') {
    fail(`--topic requires a topic number.\n\n${usage()}`);
  }
  if (args.fromEditorial != null && String(args.fromEditorial).trim() === '') {
    fail(`--from-editorial requires a file path.\n\n${usage()}`);
  }
  return args;
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function editorialPath(name) {
  return path.join(EDITORIAL_DIR, name);
}

function yamlQuote(value) {
  const text = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, ' ').trim();
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildFrontmatter(fields) {
  const lines = [
    `draft: ${fields.draft === true ? 'true' : 'false'}`,
    `title: ${yamlQuote(fields.title)}`,
    `slug: ${yamlQuote(fields.slug)}`,
    `date: ${fields.date}`,
    `author: ${yamlQuote(fields.author)}`,
    `meta_title: ${yamlQuote(fields.meta_title)}`,
    `meta_description: ${yamlQuote(fields.meta_description)}`,
    `excerpt: ${yamlQuote(fields.excerpt)}`,
    `category: ${yamlQuote(fields.category)}`
  ];
  return `---\n${lines.join('\n')}\n---\n`;
}

function slugify(title) {
  return String(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function dateStamp(iso) {
  return iso.slice(0, 10);
}

function listPostFiles() {
  if (!fs.existsSync(POSTS_DIR)) {
    fail(`Blog posts directory not found: ${POSTS_DIR}`);
  }
  return fs.readdirSync(POSTS_DIR).filter((name) => name.endsWith('.md'));
}

function filenameSlug(filename) {
  return filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
}

function assertNoCollision(slug, filename) {
  const targetPath = path.join(POSTS_DIR, filename);
  if (fs.existsSync(targetPath)) {
    fail(`Refusing to overwrite existing post: ${path.relative(process.cwd(), targetPath)}`);
  }
  const taken = listPostFiles().map(filenameSlug);
  if (taken.includes(slug)) {
    fail(`Slug already exists in Brandible/blogs/posts/: ${slug}`);
  }
}

function assertCategory(category) {
  if (!CMS_CATEGORIES.includes(category)) {
    fail(`Invalid category "${category}". Must be one of: ${CMS_CATEGORIES.join(', ')}`);
  }
}

function categoryFromService(service) {
  const value = String(service || '').toLowerCase();
  if (value.includes('web design')) return 'Web Design';
  if (value.includes('media management') || value.includes('social')) return 'Social Media';
  if (value.includes('branding')) return 'Business Tips';
  if (value.includes('ai')) return 'Business Tips';
  if (value.includes('seo') || value.includes('google')) return 'SEO';
  if (value.includes('digital marketing') || value.includes('ads') || value.includes('all')) {
    return 'Marketing';
  }
  return 'Business Tips';
}

function clipAtSentence(text, maxLen) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  const slice = clean.slice(0, maxLen);
  const breakAt = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '));
  if (breakAt >= Math.floor(maxLen * 0.5)) {
    return slice.slice(0, breakAt + 1).trim();
  }
  return `${slice.trim().replace(/[,:;–-]+$/, '')}…`;
}

function firstPlainParagraph(markdown) {
  const blocks = String(markdown).split(/\n\s*\n/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s/.test(trimmed)) continue;
    if (/^\[[^\]]+\]\([^)]+\)\s*$/.test(trimmed)) continue;
    return trimmed.replace(/\s+/g, ' ');
  }
  return '';
}

function parseEditorialArticle(raw) {
  const text = raw.replace(/^\uFEFF/, '');
  const match = text.match(/^#\s+(.+?)\r?\n/);
  if (!match) {
    fail('Editorial file must start with an H1 title (# Title).');
  }
  return {
    title: match[1].trim(),
    body: text.slice(match[0].length)
  };
}

function inferTopicId(filePath, title, topics) {
  const base = path.basename(filePath);
  const fromName = base.match(/topic-(\d+)/i);
  if (fromName) return fromName[1].padStart(2, '0');

  const normalized = slugify(title);
  for (const topic of topics) {
    if (slugify(topic.title) === normalized) return topic.id;
  }
  return null;
}

function resolveProvider() {
  const provider = String(process.env.BLOG_DRAFT_PROVIDER || '').trim().toLowerCase();
  const model = String(process.env.BLOG_DRAFT_MODEL || '').trim();
  const openaiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const anthropicKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
  const hasOpenAI = Boolean(openaiKey);
  const hasAnthropic = Boolean(anthropicKey);

  if (provider && provider !== 'openai' && provider !== 'anthropic') {
    fail(`BLOG_DRAFT_PROVIDER must be openai or anthropic.\n\n${usage()}`);
  }

  if (!provider) {
    if (hasOpenAI && hasAnthropic) {
      fail(
        'Both OPENAI_API_KEY and ANTHROPIC_API_KEY are set. Set BLOG_DRAFT_PROVIDER=openai or BLOG_DRAFT_PROVIDER=anthropic, and set BLOG_DRAFT_MODEL, so this command does not pick a provider for you.\n\n' +
          usage()
      );
    }
    if (!hasOpenAI && !hasAnthropic) {
      fail(
        'No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY, plus BLOG_DRAFT_PROVIDER and BLOG_DRAFT_MODEL.\n\n' +
          usage()
      );
    }
    if (!model) {
      fail(`BLOG_DRAFT_MODEL is not set.\n\n${usage()}`);
    }
    if (hasOpenAI) return { provider: 'openai', model, apiKey: openaiKey };
    return { provider: 'anthropic', model, apiKey: anthropicKey };
  }

  if (provider === 'openai' && !hasOpenAI) {
    fail(`BLOG_DRAFT_PROVIDER=openai but OPENAI_API_KEY is not set.\n\n${usage()}`);
  }
  if (provider === 'anthropic' && !hasAnthropic) {
    fail(`BLOG_DRAFT_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.\n\n${usage()}`);
  }
  if (!model) {
    fail(`BLOG_DRAFT_MODEL is not set.\n\n${usage()}`);
  }
  return {
    provider,
    model,
    apiKey: provider === 'openai' ? openaiKey : anthropicKey
  };
}

async function completeChat({ provider, model, apiKey, prompt }) {
  if (provider === 'anthropic') {
    fail('Anthropic generation and revision use structured tool output, not free-form JSON text.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(`OpenAI request failed (${response.status}): ${JSON.stringify(payload).slice(0, 500)}`);
  }
  const text =
    payload.choices && payload.choices[0] && payload.choices[0].message
      ? String(payload.choices[0].message.content || '').trim()
      : '';
  if (!text) fail('OpenAI returned an empty response.');
  return text;
}

function parseModelJson(text) {
  let candidate = String(text).trim();
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidate = fenced[1].trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    fail('Model did not return JSON with title, category, excerpt, and body.');
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (error) {
    fail(`Could not parse model JSON: ${error.message}`);
  }
}

async function completeArticle({ provider, model, apiKey, prompt, mode }) {
  if (provider === 'anthropic') {
    try {
      return await completeAnthropicStructured({
        model,
        apiKey,
        prompt,
        toolName: mode === 'revision' ? REVISION_TOOL_NAME : GENERATION_TOOL_NAME,
        inputSchema: mode === 'revision' ? REVISION_INPUT_SCHEMA : GENERATION_INPUT_SCHEMA
      });
    } catch (error) {
      fail(error.message || String(error));
    }
  }

  return parseModelJson(await completeChat({ provider, model, apiKey, prompt }));
}

function askTopic(topics) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      fail(`Select a topic with --topic NN, or use --from-editorial.\n\n${usage()}`);
    }
    console.log('Approved topics:\n');
    for (const topic of topics) {
      console.log(`  ${topic.id}  [${topic.priority}]  ${topic.type}  ${topic.title}`);
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\nEnter topic number: ', (answer) => {
      rl.close();
      resolve(String(answer || '').trim());
    });
  });
}

function findTopic(topics, rawId) {
  const topic = findQueuedTopic(topics, rawId);
  if (!topic) fail(`Topic ${rawId} is not in the approved topic queue.`);
  return topic;
}

function buildGeneratePrompt({
  voiceGuide,
  editorialStandard,
  checklist,
  topicQueue,
  topic,
  facts,
  catalog,
  sourcePack,
  allowlist,
  allowedClaims
}) {
  return [
    'You are writing one Brandible Marketing Group blog post for brandiblemg.com.',
    'Follow the Voice Guide, Editorial Standard, and Voice Test Checklist exactly.',
    'Return JSON only with keys: title, slug, meta_title, meta_description, excerpt, category, body, claims, cta.',
    'claims is an array of { "claim", "kind", "source_id" } for first_party, hypothetical, and opinion only.',
    'Do not include sourced_fact rows. Code derives sourced facts from {{AC#}} tokens used in the body.',
    'kind must be one of: first_party, hypothetical, opinion.',
    'cta is { "names_brandible": boolean, "fit_case": string, "walk_away_case": string }.',
    'If the closing names Brandible, names_brandible must be true and both fit_case and walk_away_case must be non-empty. Code renders those two fields into the final close.',
    'walk_away_case: if the reader already has the identified problem handled effectively, they may not need Brandible.',
    'External platform facts: insert {{AC#}} tokens from the approved token list. Do not write or paraphrase those factual sentences. Surrounding commentary may be Brandible voice.',
    'category must be exactly one of: Marketing, Web Design, SEO, Social Media, Business Tips, Case Studies.',
    'body is markdown. Do not include frontmatter. Do not repeat the title as an H1.',
    'Never use em dashes. Never invent statistics, citations, client stories, or unnamed clients.',
    'Brandible currency amounts, percentages, timelines, and numeric case metrics may come ONLY from the approved number allowlist. Any other Brandible number is forbidden.',
    'Do not write Google/Meta/platform facts in prose. If a fact is not an approved token, drop it or keep it as clearly labeled opinion, a hypothetical, or Brandible advice.',
    'Article ownership: every factual subsection must directly help answer the selected topic’s owned question. A source being available does not justify using it. Do not introduce adjacent platform guidance merely because it is related to the broader service.',
    'For a Google Ads vs SEO topic, distinguish Google Ads, organic Search/SEO, and Brandible’s own service/pricing. Google Business Profile optimization and Local Services Ads stay out unless the owned question requires them.',
    'When an allowed claim has citation required, insert its {{AC#}} token. Code adds the markdown link.',
    'Internal links: only URLs in the INTERNAL LINK CATALOG. 1–3 useful links. Do not repeat a destination. Do not link unpublished drafts.',
    'SEO: meta_title can be shorter than the editorial title. No | Brandible suffix. meta_description 80–170 characters. excerpt is listing-card copy, not a copy of meta_description. slug is short and search-intent, not the full headline.',
    '',
    '=== PHASE 1 HARD CHECKS ===',
    PHASE1_HARD_CHECKS.map((item, i) => `${i + 1}. ${item}`).join('\n'),
    '',
    '=== PHASE 2 GROUNDING CHECKS ===',
    PHASE2_GROUNDING_CHECKS.map((item, i) => `${i + 1}. ${item}`).join('\n'),
    '',
    '=== APPROVED FIRST-PARTY NUMBER ALLOWLIST ===',
    allowlistForPrompt(allowlist),
    '',
    '=== FIRST-PARTY FACTS (sanitized to the allowlist) ===',
    factsForPrompt(facts, allowlist),
    '',
    '=== ALLOWED EXTERNAL CLAIMS ===',
    allowedClaimsForPrompt(allowedClaims),
    '',
    '=== SOURCE PACK ===',
    sourcePackForPrompt(sourcePack),
    '',
    '=== INTERNAL LINK CATALOG ===',
    catalogForPrompt(catalog),
    '',
    '=== VOICE GUIDE ===',
    voiceGuide,
    '',
    '=== EDITORIAL STANDARD ===',
    editorialStandard,
    '',
    '=== VOICE TEST CHECKLIST ===',
    checklist,
    '',
    '=== TOPIC QUEUE (adjacent-article awareness) ===',
    topicQueue,
    '',
    '=== SELECTED TOPIC ===',
    `Owned question: ${topic.title}`,
    topic.detail || `${topic.id} ${topic.title}\nType: ${topic.type}\nService: ${topic.service}`,
    '',
    'Write the selected topic only. JSON only.'
  ].join('\n');
}

function buildRevisionPrompt(article, problems, { facts, catalog, sourcePack, topic, allowlist, allowedClaims }) {
  const hints = revisionRepairHints(problems);
  const numbered = problems.map((item) => {
    const actions = allowedActionsForCode(item.code).join(' | ');
    return `${item.id} [${item.code}] required action: ${actions}\n${item.message}`;
  });
  return [
    'Revise this Brandible blog JSON so it passes validation.',
    'Keep the same argument and the same owned question. Fix only the listed failures.',
    topic ? `Owned question: ${topic.title}` : '',
    'Return JSON only with keys: title, slug, meta_title, meta_description, excerpt, category, body, claims, cta, resolutions.',
    'claims may include first_party, hypothetical, and opinion only. Do not return sourced_fact rows.',
    'cta is { "names_brandible": boolean, "fit_case": string, "walk_away_case": string }.',
    'resolutions is an array with one entry per supplied failure_id: { "failure_id", "action", "resulting_sentence" }.',
    'action must be one of: deleted, replaced_with_token, removed_token, attributed, self_qualified, rewritten_to_evidence.',
    'For sourced-fact failures, replace raw factual copy with an approved {{AC#}} token, delete it, or remove an unused token. Do not invent a new sourced sentence.',
    'If action is replaced_with_token, resulting_sentence must contain the {{AC#}} token. If action is deleted, resulting_sentence may be "deleted".',
    'A response missing a resolution for any supplied failure_id is rejected immediately.',
    'Never use em dashes. Do not invent sources. Brandible numbers only from the approved allowlist. why_selected is not evidence.',
    'Every factual subsection must directly help answer the owned question. A source being available does not justify keeping it. Do not add Google Business Profile field how-tos or Local Services Ads unless the owned question requires them.',
    PHASE1_HARD_CHECKS.join(' '),
    PHASE2_GROUNDING_CHECKS.join(' '),
    '',
    'Validator failures. Return a resolutions[] entry for every ID. You get only this one revision call.',
    numbered.join('\n\n'),
    '',
    hints.length ? `Required actions:\n${hints.map((item) => `- ${item}`).join('\n')}` : '',
    '',
    '=== APPROVED FIRST-PARTY NUMBER ALLOWLIST ===',
    allowlistForPrompt(allowlist),
    '',
    '=== FIRST-PARTY FACTS (sanitized to the allowlist) ===',
    factsForPrompt(facts, allowlist),
    '',
    '=== ALLOWED EXTERNAL CLAIMS ===',
    allowedClaimsForPrompt(allowedClaims),
    '',
    '=== SOURCE PACK ===',
    sourcePackForPrompt(sourcePack),
    '',
    '=== INTERNAL LINK CATALOG ===',
    catalogForPrompt(catalog),
    '',
    'Current JSON (tokens unresolved; code will render claims and the CTA after this call):',
    JSON.stringify(forRevision(article), null, 2)
  ].join('\n');
}

function forRevision(article) {
  return {
    title: article.title,
    slug: article.slug,
    meta_title: article.meta_title,
    meta_description: article.meta_description,
    excerpt: article.excerpt,
    category: article.category,
    body: article.body,
    claims: (article.claims || []).filter((item) => String(item.kind || '') !== 'sourced_fact'),
    cta: article.cta
  };
}

function normalizeGenerated(article, topic) {
  const title = String(article.title || topic.title).trim();
  const category = String(article.category || categoryFromService(topic.service)).trim();
  const slug = slugify(article.slug || title);
  const claims = Array.isArray(article.claims) ? article.claims : [];
  const cta = article.cta && typeof article.cta === 'object' ? article.cta : {};
  return {
    title,
    slug,
    meta_title: String(article.meta_title || title).trim(),
    meta_description: String(article.meta_description || article.excerpt || '').trim(),
    excerpt: String(article.excerpt || '').trim(),
    category,
    body: `${String(article.body || '')
      .replace(/^\uFEFF/, '')
      .replace(/^\s*#\s+.+?\n+/, '')
      .trim()}\n`,
    claims,
    cta: {
      names_brandible: Boolean(cta.names_brandible),
      fit_case: String(cta.fit_case || '').trim(),
      walk_away_case: String(cta.walk_away_case || '').trim()
    }
  };
}

function writeDraft({ fields, body }) {
  assertCategory(fields.category);
  const filename = `${dateStamp(fields.date)}-${fields.slug}.md`;
  assertNoCollision(fields.slug, filename);
  const outPath = path.join(POSTS_DIR, filename);
  const markdown = `${buildFrontmatter(fields)}${body.startsWith('\n') ? body : `\n${body}`}`;
  const ended = markdown.endsWith('\n') ? markdown : `${markdown}\n`;
  fs.writeFileSync(outPath, ended, 'utf8');
  return outPath;
}

function writeSourceRecord({ fields, facts, sourcePack, claims, allowedClaims, allowlist, claimTokensUsed }) {
  const dir = path.join(EDITORIAL_DIR, 'research');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${dateStamp(fields.date)}-${fields.slug}.json`;
  const record = {
    post: `${dateStamp(fields.date)}-${fields.slug}.md`,
    topic_id: sourcePack.topic_id || null,
    generated_at: new Date().toISOString(),
    facts_last_verified: facts.last_verified,
    research: {
      needed: Boolean(sourcePack.needed),
      skipped_reason: sourcePack.skipped_reason || null,
      queries: sourcePack.queries || [],
      retrieved_at: sourcePack.retrieved_at || null
    },
    sources: sourcePack.sources || [],
    allowed_claims: Array.isArray(allowedClaims) ? allowedClaims : [],
    claim_tokens_used: Array.isArray(claimTokensUsed) ? claimTokensUsed : [],
    approved_first_party_numbers: allowlistSnapshot(allowlist),
    claims: Array.isArray(claims) ? claims : [],
    internal_links_catalog_note: 'Internal URLs in the article must come from the approved catalog of live posts, services, and core pages.'
  };
  const outPath = path.join(dir, filename);
  fs.writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return outPath;
}

function reportWritten(outPath, fields, sourcePath) {
  const relative = path.relative(process.cwd(), outPath);
  console.log(`Wrote ${relative}`);
  if (sourcePath) {
    console.log(`Research sidecar: ${path.relative(process.cwd(), sourcePath)}`);
  }
  console.log('draft: true');
  console.log(`slug: ${fields.slug}`);
  console.log(`category: ${fields.category}`);
  console.log('Not published. Human review next. Do not flip draft to false in this command.');
}

function validationContext({ facts, catalog, sourcePack, topic, allowlist, allowedClaims }) {
  return {
    facts,
    catalog,
    sourcePack,
    topic: topic || null,
    allowlist,
    allowedClaims: allowedClaims || [],
    cmsCategories: CMS_CATEGORIES
  };
}

async function fromEditorial(fileArg, topics) {
  const sourcePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(sourcePath)) {
    fail(`Editorial file not found: ${fileArg}`);
  }
  const raw = readUtf8(sourcePath);
  const article = parseEditorialArticle(raw);
  const topicId = inferTopicId(sourcePath, article.title, topics);
  const topic = topicId ? topics.find((item) => item.id === topicId) : null;
  const category = topic ? categoryFromService(topic.service) : 'Business Tips';
  const plain = firstPlainParagraph(article.body);
  if (!plain) fail('Could not derive an excerpt from the editorial draft.');

  const fields = {
    draft: true,
    title: article.title,
    slug: slugify(article.title),
    date: new Date().toISOString(),
    author: 'Brandible Team',
    meta_title: article.title,
    meta_description: clipAtSentence(plain, 155),
    excerpt: clipAtSentence(plain, 220),
    category
  };

  const outPath = writeDraft({ fields, body: article.body });
  reportWritten(outPath, fields, null);
  return outPath;
}

async function generateFromTopic(topic, editorial) {
  const config = resolveProvider();
  const facts = loadFacts(EDITORIAL_DIR);
  const catalog = buildCatalog({ postsDir: POSTS_DIR, facts });
  const sourcePack = await buildSourcePack({
    topic,
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model
  });

  const allowlist = buildAllowlist(facts);
  const allowedClaims = buildAllowedClaims(sourcePack);

  const prompt = buildGeneratePrompt({
    voiceGuide: editorial.voiceGuide,
    editorialStandard: editorial.editorialStandard,
    checklist: editorial.checklist,
    topicQueue: editorial.topicQueue,
    topic,
    facts,
    catalog,
    sourcePack,
    allowlist,
    allowedClaims
  });

  console.log(`Provider: ${config.provider}`);
  console.log(`Model: ${config.model}`);
  console.log(`Approved first-party numbers: ${allowlist.moneyList.length} money / ${allowlist.percentList.length} percent / ${allowlist.countList.length} count.`);
  console.log(`Allowed external claims: ${allowedClaims.length}.`);

  const ctx = validationContext({ facts, catalog, sourcePack, topic, allowlist, allowedClaims });
  let parsed = await completeArticle({ ...config, prompt, mode: 'generation' });
  let tokenized = normalizeGenerated(parsed, topic);
  let article = assembleArticle(tokenized, allowedClaims);
  let problems = validateGeneratedArticle(article, ctx);
  if (problems.length) {
    console.log('First generation failed validation:');
    for (const problem of problems) {
      console.log(`  - ${formatProblem(problem)}`);
    }
    console.log('Running the single revision pass.');
    parsed = await completeArticle({
      ...config,
      prompt: buildRevisionPrompt(tokenized, problems, {
        facts,
        catalog,
        sourcePack,
        topic,
        allowlist,
        allowedClaims
      }),
      mode: 'revision'
    });
    const missingResolutions = assertRevisionResolutions(problems, parsed);
    if (missingResolutions.length) {
      fail(
        `Revision rejected: missing or invalid resolutions. No draft written.\n- ${missingResolutions.join('\n- ')}`
      );
    }
    tokenized = normalizeGenerated(parsed, topic);
    article = assembleArticle(tokenized, allowedClaims);
    problems = validateGeneratedArticle(article, ctx);
    if (problems.length) {
      const fallback = applySafetyFallback(article, problems);
      if (fallback.refused) {
        console.log(`Deterministic safety fallback refused: ${fallback.reason}`);
      } else if (fallback.applied.length) {
        console.log(`Deterministic safety fallback: ${fallback.applied.join(', ')}.`);
        article = fallback.article;
        if (fallback.needsAssemble) {
          // Re-assemble only if claim tokens remain. Assembling already-rendered
          // markdown would drop the sourced ledger.
          article = assembleArticle(article, allowedClaims);
        }
        article = refreshAssemblyState(article, allowedClaims);
        problems = validateGeneratedArticle(article, ctx);
      }
    }
  } else {
    console.log('First generation passed validation. No revision pass.');
  }
  if (problems.length) {
    const v4Diagnostics = formatV4Diagnostics(article, problems, allowedClaims);
    if (v4Diagnostics.length) {
      console.error('V4 citation diagnostic:');
      for (const line of v4Diagnostics) {
        console.error(`  ${line}`);
      }
    }
    fail(`Draft failed validation after one revision:\n- ${problems.map(formatProblem).join('\n- ')}`);
  }
  console.log('Draft passed validation.');
  if (article.claim_tokens_used && article.claim_tokens_used.length) {
    console.log(`Claim tokens used: ${article.claim_tokens_used.join(', ')}.`);
  }

  const fields = {
    draft: true,
    title: article.title,
    slug: article.slug || slugify(article.title),
    date: new Date().toISOString(),
    author: 'Brandible Team',
    meta_title: article.meta_title || article.title,
    excerpt: article.excerpt,
    meta_description: article.meta_description || article.excerpt,
    category: article.category
  };

  const outPath = writeDraft({ fields, body: article.body });
  const sidecarPath = writeSourceRecord({
    fields,
    facts,
    sourcePack,
    claims: article.claims,
    allowedClaims,
    allowlist,
    claimTokensUsed: article.claim_tokens_used
  });
  reportWritten(outPath, fields, sidecarPath);
  return outPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.topic && args.fromEditorial) {
    fail('Use either --topic or --from-editorial, not both.');
  }

  const topicQueue = readUtf8(editorialPath('topic-queue.md'));
  const topics = parseQueueTopics(topicQueue);
  if (topics.length === 0) fail('Could not parse topics from the topic queue.');

  if (args.fromEditorial) {
    await fromEditorial(args.fromEditorial, topics);
    return;
  }

  const editorial = {
    voiceGuide: readUtf8(editorialPath('brandible-voice-guide.md')),
    editorialStandard: readUtf8(editorialPath('editorial-standard.md')),
    checklist: readUtf8(editorialPath('voice-test-checklist.md')),
    topicQueue
  };

  const topicId = args.topic || (await askTopic(topics));
  const topic = findTopic(topics, topicId);
  await generateFromTopic(topic, editorial);
}

main().catch((error) => {
  fail(error && error.stack ? error.stack : String(error));
});
