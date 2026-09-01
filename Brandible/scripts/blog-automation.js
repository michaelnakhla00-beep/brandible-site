#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseFrontmatter, filenameSlug } = require('./blog-draft/catalog');
const { loadFacts } = require('./blog-draft/facts');
const { parseQueueTopics, findTopic, padTopicId } = require('./blog-draft/queue');
const { unlinkQuiet } = require('./blog-image/commit');

const BRANDIBLE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BRANDIBLE_ROOT, '..');
const POSTS_DIR = path.join(BRANDIBLE_ROOT, 'blogs', 'posts');
const EDITORIAL_DIR = path.join(BRANDIBLE_ROOT, 'blogs', 'editorial');
const QUEUE_PATH = path.join(EDITORIAL_DIR, 'topic-queue.md');
const RESEARCH_DIR = path.join(EDITORIAL_DIR, 'research');
const EMPTY_QUEUE_MESSAGE = 'No eligible Brandible blog topics. Nothing generated.';
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'for',
  'of',
  'your',
  'you',
  'is',
  'not',
  'they',
  'have',
  'has',
  'with',
  'when',
  'what',
  'why',
  'how',
  'most',
  'dont',
  'doesnt',
  'might',
  'into',
  'from',
  'that',
  'this',
  'than'
]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function usage() {
  return [
    'Usage:',
    '  npm run blog:automation',
    '  npm run blog:automation -- --topic 02',
    '  npm run blog:automation -- --dry-run',
    '',
    'Selects one eligible queued topic, runs blog:draft then blog:image, and writes PR metadata.',
    'Does not commit, push, merge, or change draft: true.',
    'Requires ANTHROPIC_API_KEY, GEMINI_API_KEY, BLOG_DRAFT_PROVIDER, and BLOG_DRAFT_MODEL unless --dry-run.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = { topic: null, outDir: null, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (token === '--dry-run') {
      args.dryRun = true;
    } else if (token === '--topic') {
      if (!argv[i + 1] || String(argv[i + 1]).startsWith('--')) {
        fail(`--topic requires a topic number.\n\n${usage()}`);
      }
      args.topic = argv[i + 1];
      i += 1;
    } else if (token.startsWith('--topic=')) {
      args.topic = token.slice('--topic='.length);
    } else if (token === '--out-dir') {
      if (!argv[i + 1] || String(argv[i + 1]).startsWith('--')) {
        fail(`--out-dir requires a path.\n\n${usage()}`);
      }
      args.outDir = argv[i + 1];
      i += 1;
    } else if (token.startsWith('--out-dir=')) {
      args.outDir = token.slice('--out-dir='.length);
    } else {
      fail(`Unknown argument: ${token}\n\n${usage()}`);
    }
  }
  return args;
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
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

function contentTokens(text) {
  return slugify(text)
    .split('-')
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function titlesMatchTopic(topic, postTitle, fileSlug) {
  const topicSlug = slugify(topic.title);
  const titleSlug = slugify(postTitle || '');
  if (topicSlug && (topicSlug === titleSlug || topicSlug === fileSlug)) return true;
  if (topicSlug && titleSlug && (titleSlug.startsWith(topicSlug) || topicSlug.startsWith(titleSlug))) {
    return true;
  }
  const topicTokens = contentTokens(topic.title);
  const hayTokens = new Set([...contentTokens(postTitle || ''), ...contentTokens(fileSlug || '')]);
  if (topicTokens.length === 0) return false;
  let shared = 0;
  for (const token of topicTokens) {
    if (hayTokens.has(token)) shared += 1;
  }
  return shared >= 3 && shared / topicTokens.length >= 0.45;
}

function automationEnabled() {
  const raw = String(process.env.BLOG_AUTOMATION_ENABLED || 'true')
    .trim()
    .toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(raw);
}

function factsMaxAgeDays() {
  const parsed = Number(process.env.BLOG_FACTS_MAX_AGE_DAYS || 90);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail('BLOG_FACTS_MAX_AGE_DAYS must be a positive number.');
  }
  return parsed;
}

function factsAgeDays(lastVerified) {
  const stamp = String(lastVerified || '').trim();
  const parsed = Date.parse(`${stamp}T00:00:00Z`);
  if (Number.isNaN(parsed)) {
    fail(`first-party-facts.json last_verified is not a valid date: ${stamp}`);
  }
  return Math.floor((Date.now() - parsed) / 86400000);
}

function assertFactsFresh(facts) {
  const age = factsAgeDays(facts.last_verified);
  const maxAge = factsMaxAgeDays();
  if (age > maxAge) {
    fail(
      `first-party-facts.json last_verified is ${facts.last_verified} (${age} days old). Re-verify within ${maxAge} days before automation can run.`
    );
  }
}

function appendGithubOutput(name, value) {
  const dest = process.env.GITHUB_OUTPUT;
  if (!dest) return;
  fs.appendFileSync(dest, `${name}=${value}\n`);
}

function writeStepSummary(text) {
  const dest = process.env.GITHUB_STEP_SUMMARY;
  if (dest) fs.appendFileSync(dest, `${text}\n`);
  console.log(text);
}

function priorityRank(priority) {
  const value = String(priority || '').toLowerCase();
  if (value === 'high') return 0;
  if (value === 'medium') return 1;
  return 2;
}

function postFiles() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs.readdirSync(POSTS_DIR).filter((name) => name.endsWith('.md'));
}

function occupiedTopicIdsFromCms(topics) {
  const occupied = new Set();
  if (fs.existsSync(RESEARCH_DIR)) {
    for (const name of fs.readdirSync(RESEARCH_DIR).filter((file) => file.endsWith('.json'))) {
      try {
        const record = JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, name), 'utf8'));
        if (record.topic_id) occupied.add(padTopicId(record.topic_id));
      } catch {
        // ignore unreadable sidecars
      }
    }
  }
  for (const name of postFiles()) {
    const filePath = path.join(POSTS_DIR, name);
    const frontmatter = parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
    const fileSlug = filenameSlug(name);
    for (const topic of topics) {
      if (titlesMatchTopic(topic, frontmatter.title || '', fileSlug)) {
        occupied.add(topic.id);
      }
    }
  }
  return occupied;
}

function runCaptured(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
    ...options
  });
  return result;
}

function listOpenAutomationPrs() {
  const result = runCaptured('gh', [
    'pr',
    'list',
    '--state',
    'open',
    '--limit',
    '100',
    '--json',
    'headRefName,url'
  ]);
  if (result.status !== 0) {
    if (process.env.GITHUB_ACTIONS) {
      fail(`Could not list open pull requests (gh exited ${result.status}).`);
    }
    console.log('Warning: gh is unavailable. Open automation PRs were not checked.');
    return [];
  }
  try {
    return JSON.parse(result.stdout || '[]');
  } catch (error) {
    fail(`Could not parse gh pr list JSON: ${error.message}`);
  }
}

function listRemoteAutomationBranches() {
  const result = runCaptured('git', ['ls-remote', '--heads', 'origin']);
  if (result.status !== 0) return [];
  const branches = [];
  for (const line of String(result.stdout || '').split('\n')) {
    const match = line.match(/refs\/heads\/(automation\/blog-\d{2}-.+)\s*$/);
    if (match) branches.push(match[1]);
  }
  return branches;
}

function topicIdFromAutomationRef(refName) {
  const match = String(refName || '').match(/^automation\/blog-(\d{2})-/);
  return match ? match[1] : null;
}

function occupancy(topics) {
  const cms = occupiedTopicIdsFromCms(topics);
  const prs = listOpenAutomationPrs();
  const branches = listRemoteAutomationBranches();
  const reasons = new Map();
  function mark(id, reason) {
    if (!id) return;
    const current = reasons.get(id) || [];
    current.push(reason);
    reasons.set(id, current);
    cms.add(id);
  }
  for (const id of cms) mark(id, 'existing CMS post');
  for (const pr of prs) {
    const id = topicIdFromAutomationRef(pr.headRefName);
    if (id) mark(id, `open PR ${pr.url || pr.headRefName}`);
  }
  for (const branch of branches) {
    const id = topicIdFromAutomationRef(branch);
    if (id) mark(id, `existing branch ${branch}`);
  }
  return { ids: cms, reasons };
}

function ineligibleReason(topic, occupied) {
  if (!topic) return 'not in the topic queue';
  if (topic.status === 'hold') return 'status is hold';
  const reasons = occupied.reasons.get(topic.id);
  if (reasons && reasons.length) return reasons[0];
  return null;
}

function eligibleTopics(topics, occupied) {
  return topics
    .filter((topic) => topic.status === 'queued' && !occupied.ids.has(topic.id))
    .sort((a, b) => {
      const rank = priorityRank(a.priority) - priorityRank(b.priority);
      if (rank !== 0) return rank;
      return Number(a.id) - Number(b.id);
    });
}

function branchNameFor(topic) {
  const slug = slugify(topic.title).slice(0, 60).replace(/-$/, '');
  return `automation/blog-${topic.id}-${slug}`;
}

function firstLineMatch(text, pattern) {
  const match = String(text).match(pattern);
  return match ? match[1].trim() : null;
}

function runNodeScript(scriptPath, args) {
  const result = runCaptured(process.execPath, [scriptPath, ...args]);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${path.basename(scriptPath)} failed with exit code ${result.status}.`);
  }
  return result.stdout || '';
}

function resolveCreatedPath(loggedPath) {
  if (!loggedPath) return null;
  const absolute = path.isAbsolute(loggedPath) ? loggedPath : path.resolve(REPO_ROOT, loggedPath);
  return fs.existsSync(absolute) ? absolute : null;
}

function cleanupFiles(filePaths) {
  for (const filePath of filePaths) {
    unlinkQuiet(filePath);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sourceLines(sidecar) {
  const sources = Array.isArray(sidecar.sources) ? sidecar.sources : [];
  if (!sources.length) return ['None'];
  return sources.map((source) => {
    const title = source.title || source.url || source.id || 'source';
    return source.url ? `- ${title} (${source.url})` : `- ${title}`;
  });
}

function repairLines(repairs) {
  if (!Array.isArray(repairs) || repairs.length === 0) {
    return ['None. First generation passed validation, or no deterministic cleanup was required.'];
  }
  return repairs.map((item) => {
    const code = item.code || 'repair';
    const action = item.action || 'applied';
    const reason = item.reason || '';
    return reason ? `- **${code}:** ${action} — ${reason}` : `- **${code}:** ${action}`;
  });
}

function buildPrBody(payload) {
  const research = payload.research;
  const researchStatus = research.needed
    ? `Needed. ${payload.sourceCount} source(s) stored.`
    : `Skipped. ${research.skipped_reason || 'Topic does not require outside facts.'}`;
  return [
    `## Brandible draft ${payload.topic.id}`,
    '',
    `- **Topic:** ${payload.topic.id} — ${payload.topic.title}`,
    `- **Article:** \`${payload.postRel}\``,
    `- **Category:** ${payload.category}`,
    `- **Research:** ${researchStatus}`,
    '- **Model revision:** None. GitHub automation uses one structured generation plus deterministic cleanup.',
    `- **Image model:** ${payload.imageModel}`,
    `- **Image:** \`${payload.imageRel}\``,
    `- **Facts verified:** ${payload.factsLastVerified}`,
    `- **draft:** \`true\` — merging this PR does not publish or list the post. Flip \`draft: false\` only after human approval.`,
    '',
    '### Automated cleanup',
    ...repairLines(payload.sidecar && payload.sidecar.repairs),
    '',
    '### Sources',
    ...sourceLines(payload.sidecar),
    '',
    '### Local preview',
    '',
    '```bash',
    `npm run preview:blog -- --post ${payload.postRel}`,
    '```',
    '',
    '### Review checklist',
    '',
    '- [ ] Read article',
    '- [ ] Verify factual claims/sources',
    '- [ ] Review featured image',
    '- [ ] Check mobile/local preview',
    '- [ ] Approve editorial voice',
    '',
    'Never merge automatically. Never change `draft: true` to `false` in this PR unless you are deliberately publishing.',
    'If this topic should not be retried, set its queue status to `hold`.'
  ].join('\n');
}

function writeOutputs(outDir, result) {
  fs.mkdirSync(outDir, { recursive: true });
  const resultPath = path.join(outDir, 'result.json');
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  if (result.pr_body) {
    fs.writeFileSync(path.join(outDir, 'pr-body.md'), result.pr_body, 'utf8');
  }
  appendGithubOutput('skipped', result.skipped ? 'true' : 'false');
  appendGithubOutput('branch', result.branch || '');
  appendGithubOutput('post_path', result.post_path || '');
  appendGithubOutput('pr_title', result.pr_title || '');
  appendGithubOutput('out_dir', outDir);
}

function skipSuccessfully(outDir, message) {
  writeStepSummary(message);
  writeOutputs(outDir, {
    skipped: true,
    message,
    branch: '',
    post_path: '',
    pr_title: '',
    paths: []
  });
  process.exit(0);
}

function selectTopic(args, topics, occupied) {
  if (args.topic) {
    const topic = findTopic(topics, args.topic);
    const reason = ineligibleReason(topic, occupied);
    if (!topic) fail(`Topic ${args.topic} is not in the approved topic queue.`);
    if (reason) fail(`Topic ${topic.id} is not eligible: ${reason}.`);
    return topic;
  }
  const eligible = eligibleTopics(topics, occupied);
  return eligible[0] || null;
}

function generatePackage(topic) {
  const created = [];
  try {
    const draftOut = runNodeScript(path.join(__dirname, 'draft-blog.js'), ['--topic', topic.id, '--deterministic']);
    const postPath = resolveCreatedPath(firstLineMatch(draftOut, /^Wrote (.+)$/m));
    const researchPath = resolveCreatedPath(firstLineMatch(draftOut, /^Research sidecar: (.+)$/m));
    if (!postPath) throw new Error('blog:draft did not report a written post path.');
    if (!researchPath) throw new Error('blog:draft did not report a research sidecar path.');
    created.push(postPath, researchPath);

    const sidecar = readJson(researchPath);
    const needed = Boolean(sidecar.research && sidecar.research.needed);
    const sources = Array.isArray(sidecar.sources) ? sidecar.sources : [];
    if (needed && sources.length === 0) {
      throw new Error(
        `Research was required for topic ${topic.id} but the source pack is empty. No PR created.`
      );
    }

    const imageOut = runNodeScript(path.join(__dirname, 'blog-image.js'), [
      '--post',
      repoRelative(postPath)
    ]);
    const imagePath = resolveCreatedPath(firstLineMatch(imageOut, /^Wrote (.+)$/m));
    const imageSidecarPath = resolveCreatedPath(firstLineMatch(imageOut, /^Sidecar: (.+)$/m));
    if (!imagePath || !imageSidecarPath) {
      throw new Error('blog:image did not write both the featured image and the image sidecar.');
    }
    created.push(imagePath, imageSidecarPath);

    const imageSidecar = readJson(imageSidecarPath);
    const post = parseFrontmatter(fs.readFileSync(postPath, 'utf8'));
    if (post.draft !== true) {
      throw new Error('Automation refusing to continue because draft is not true.');
    }

    return {
      postPath,
      researchPath,
      imagePath,
      imageSidecarPath,
      sidecar,
      imageSidecar,
      imageModel:
        firstLineMatch(imageOut, /^Image model: (.+)$/m) || imageSidecar.model || '',
      alt: post.featured_image_alt || '',
      category: post.category || '',
      created
    };
  } catch (error) {
    cleanupFiles(created);
    fail(error && error.message ? error.message : String(error));
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const outDir = path.resolve(args.outDir || path.join(os.tmpdir(), 'brandible-blog-automation'));
  fs.mkdirSync(outDir, { recursive: true });

  if (!automationEnabled()) {
    skipSuccessfully(outDir, 'Blog automation is disabled (BLOG_AUTOMATION_ENABLED).');
  }

  const facts = loadFacts(EDITORIAL_DIR);
  assertFactsFresh(facts);

  if (!fs.existsSync(QUEUE_PATH)) fail(`Missing topic queue: ${QUEUE_PATH}`);
  const topics = parseQueueTopics(fs.readFileSync(QUEUE_PATH, 'utf8'));
  if (!topics.length) fail('Could not parse topics from the topic queue.');

  const occupied = occupancy(topics);
  const topic = selectTopic(args, topics, occupied);
  if (!topic) {
    skipSuccessfully(outDir, EMPTY_QUEUE_MESSAGE);
  }

  const branch = branchNameFor(topic);
  console.log(`Selected topic ${topic.id}: ${topic.title}`);
  console.log(`Branch: ${branch}`);

  if (args.dryRun) {
    writeStepSummary(`Dry run selected topic ${topic.id}: ${topic.title}`);
    writeOutputs(outDir, {
      skipped: false,
      dry_run: true,
      topic_id: topic.id,
      title: topic.title,
      branch,
      post_path: '',
      pr_title: `Draft blog ${topic.id}: ${topic.title}`,
      paths: []
    });
    return;
  }

  const generated = generatePackage(topic);
  const postRel = repoRelative(generated.postPath);
  const result = {
    skipped: false,
    topic_id: topic.id,
    title: topic.title,
    category: generated.category,
    branch,
    post_path: postRel,
    pr_title: `Draft blog ${topic.id}: ${topic.title}`,
    paths: generated.created.map(repoRelative),
    facts_last_verified: facts.last_verified,
    image_model: generated.imageModel,
    featured_image_alt: generated.alt,
    pr_body: buildPrBody({
      topic,
      postRel,
      category: generated.category,
      research: generated.sidecar.research || {},
      sourceCount: (generated.sidecar.sources || []).length,
      sidecar: generated.sidecar,
      imageModel: generated.imageModel,
      imageRel: repoRelative(generated.imagePath),
      factsLastVerified: facts.last_verified
    })
  };
  writeOutputs(outDir, result);
  writeStepSummary(`Prepared draft topic ${topic.id}: ${postRel}`);
}

main();
