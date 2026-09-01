'use strict';

const fs = require('fs');
const { IMAGE_SYSTEM_PATH, SOURCE_ASPECT_RATIO, SOURCE_IMAGE_SIZE, getBriefModel } = require('./config');
const { firstParagraphs } = require('./frontmatter');
const { generateContent, extractText, parseModelJson } = require('./gemini');

function loadImageSystem() {
  if (!fs.existsSync(IMAGE_SYSTEM_PATH)) {
    throw new Error(`Missing image system file: ${IMAGE_SYSTEM_PATH}`);
  }
  return fs.readFileSync(IMAGE_SYSTEM_PATH, 'utf8');
}

function normalizeBrief(parsed) {
  const avoid = Array.isArray(parsed.avoid)
    ? parsed.avoid.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  return {
    thesis: String(parsed.thesis || '').trim(),
    subject: String(parsed.subject || '').trim(),
    composition: String(parsed.composition || '').trim(),
    mood: String(parsed.mood || '').trim(),
    avoid,
    color_notes: String(parsed.color_notes || '').trim(),
    center_safe: String(parsed.center_safe || '').trim()
  };
}

function assertBrief(brief) {
  const missing = ['thesis', 'subject', 'composition', 'mood'].filter((key) => !brief[key]);
  if (missing.length) {
    throw new Error(`Visual brief missing ${missing.join(', ')}.`);
  }
}

function buildBriefPrompt({ imageSystem, post, notes }) {
  const bodySample = firstParagraphs(post.body, 3500);
  const extra = notes
    ? `\nHuman regeneration notes (honor these without breaking the visual system):\n${notes}\n`
    : '';
  return [
    'You plan one Brandible blog featured image. Return JSON only.',
    'Keys: thesis, subject, composition, mood, avoid, color_notes, center_safe.',
    'avoid is an array of strings. Do not write an image prompt that is just the article title.',
    'The scene must express the thesis with one physical subject. No type, no Brandible logo, no fake UI, no stock handshake.',
    'Keep the subject in a center-safe zone. Source generation is 16:9 and will be cropped to 16:10 from the center.',
    '',
    '=== IMAGE SYSTEM ===',
    imageSystem,
    '',
    '=== ARTICLE ===',
    `Title: ${post.title}`,
    `Category: ${post.category || '(none)'}`,
    `Excerpt: ${post.excerpt || '(none)'}`,
    '',
    bodySample,
    extra,
    'JSON only.'
  ].join('\n');
}

function lockedAvoidList(brief) {
  const locked = [
    'readable text, headlines, captions, watermarks, or typography',
    'Brandible logo, wordmark, or letter B',
    'fake Google, Meta, Ads, or Search UI and readable screenshots',
    'generic corporate stock: handshakes, laptops on white desks, smiling teams',
    'cyberpunk, cartoon, or glossy AI-glass people'
  ];
  const seen = new Set(locked.map((item) => item.toLowerCase()));
  for (const item of brief.avoid) {
    if (!seen.has(item.toLowerCase())) locked.push(item);
  }
  return locked;
}

function buildGenerationPrompt(brief, { notes, imageToImage }) {
  const avoid = lockedAvoidList(brief)
    .map((item) => `- ${item}`)
    .join('\n');
  const editLine = imageToImage
    ? [
        'This is an image-to-image edit of the attached Brandible cover.',
        'Keep the same visual system, palette, and physical still-life language.',
        notes ? `Apply these notes: ${notes}` : 'Refine the scene. Do not add type or logos.',
        'Keep the subject in the center-safe zone for a later 16:10 crop.'
      ].join(' ')
    : notes
      ? `Honor these extra notes without breaking the system: ${notes}`
      : '';
  return [
    'Create one original Brandible blog featured image.',
    'Quiet tactile still-life. Slightly 3D physical objects. Matte materials. Soft directional light.',
    'Navy field (#0A1633 / #060D1F) with orange accent (#F97316). Electric blue only sparingly.',
    'No typography. No logos. No fake UI. No stock photography tropes.',
    `Generate as a ${SOURCE_IMAGE_SIZE} ${SOURCE_ASPECT_RATIO} landscape. Important subject stays in the center 70% horizontally and vertically, with breathing room on every edge, because the image will later be cropped to 16:10.`,
    '',
    `Thesis: ${brief.thesis}`,
    `Subject: ${brief.subject}`,
    `Composition: ${brief.composition}`,
    `Mood: ${brief.mood}`,
    `Color: ${brief.color_notes || 'Navy field, orange as a small accent, cloud highlights.'}`,
    `Center-safe: ${brief.center_safe || 'Subject in the middle 70%. Nothing essential on the far left or right.'}`,
    '',
    'Do not appear:',
    avoid,
    editLine ? `\n${editLine}` : '',
    '',
    'Output the image only. Do not render words in the picture.'
  ]
    .filter((line) => line !== '')
    .join('\n');
}

async function buildVisualBrief({ apiKey, post, notes }) {
  const imageSystem = loadImageSystem();
  const model = getBriefModel();
  const payload = await generateContent({
    apiKey,
    model,
    body: {
      contents: [{ role: 'user', parts: [{ text: buildBriefPrompt({ imageSystem, post, notes }) }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048
      }
    }
  });
  const text = extractText(payload);
  if (!text) throw new Error('Visual brief model returned no text.');
  const brief = normalizeBrief(parseModelJson(text, 'Visual brief'));
  assertBrief(brief);
  return { brief, briefModel: model, imageSystem };
}

const MIN_ALT_WORDS = 8;
const MAX_ALT_WORDS = 28;
const DANGLING_LAST_WORD =
  /^(a|an|the|and|or|but|nor|with|of|to|for|from|at|in|on|by|as|its|their|his|her|this|that|these|those|than|then|into|onto|over|under|while|when|where|which|who|whom|whose)$/i;
const LOCKED_FALLBACK_ALT = 'A navy still-life object sits in soft directional light.';

function wordList(text) {
  return String(text || '')
    .replace(/[.!?]+$/, '')
    .split(/\s+/)
    .filter(Boolean);
}

function asAltSentence(text) {
  const alt = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/[—–]/g, ',')
    .trim()
    .replace(/[,:;]+$/g, '')
    .replace(/[.!?]+$/, '');
  if (!alt) return '';
  return `${alt}.`;
}

function isWellFormedAlt(text) {
  const alt = asAltSentence(text);
  if (!alt) return false;
  if (/\b(image of|photo of|picture of|graphic of|illustration of|featured image)\b/i.test(alt)) {
    return false;
  }
  const words = wordList(alt);
  if (words.length < MIN_ALT_WORDS || words.length > MAX_ALT_WORDS) return false;
  if (DANGLING_LAST_WORD.test(words[words.length - 1])) return false;
  return true;
}

function completeClauseAlt(scene) {
  const cleaned = String(scene || '')
    .replace(/\s+/g, ' ')
    .replace(/[—–]/g, ',')
    .trim()
    .replace(/[.!?]+$/, '');
  if (!cleaned) return '';

  const full = asAltSentence(cleaned);
  if (isWellFormedAlt(full)) return full;

  const clauses = cleaned.split(/,(?=\s)/).map((clause) => clause.trim()).filter(Boolean);
  let built = '';
  let chosen = '';
  for (const clause of clauses) {
    built = built ? `${built}, ${clause}` : clause;
    const candidate = asAltSentence(built);
    if (!isWellFormedAlt(candidate)) continue;
    chosen = candidate;
    if (wordList(candidate).length <= 18) break;
  }
  return chosen;
}

function fallbackAlt(brief) {
  const fromSubject = completeClauseAlt(brief && brief.subject);
  if (fromSubject) return fromSubject;

  const mood = String((brief && brief.mood) || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '');
  const withMood = completeClauseAlt(
    [brief && brief.subject, mood].filter(Boolean).join(' in ')
  );
  if (withMood) return withMood;

  return LOCKED_FALLBACK_ALT;
}

function normalizeAlt(text, brief) {
  let alt = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/^["']|["']$/g, '')
    .replace(/^(an?\s+)?(image|photo|picture|graphic|illustration)\s+of\s+/i, '')
    .replace(/^featured image for\b[^.]*/i, '')
    .trim()
    .replace(/[—–]/g, ',');
  if (isWellFormedAlt(alt)) return asAltSentence(alt);
  if (brief) return fallbackAlt(brief);
  return '';
}

async function buildAltText({ apiKey, imageBuffer, mimeType, brief }) {
  const model = getBriefModel();
  const payload = await generateContent({
    apiKey,
    model,
    body: {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                'Write alt text for this Brandible blog featured image.',
                'Describe only what is visible in one complete grammatical sentence, 8 to 18 words.',
                'Never truncate mid-phrase. Never end on a, an, the, with, of, or similar.',
                'No keywords, no title, no "image of", no "featured image". JSON only: {"alt":"..."}.'
              ].join(' ')
            },
            {
              inline_data: {
                mime_type: mimeType || 'image/webp',
                data: imageBuffer.toString('base64')
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 256
      }
    }
  });
  const text = extractText(payload);
  if (!text) {
    if (!brief) throw new Error('Alt-text model returned no text.');
    return fallbackAlt(brief);
  }
  const parsed = parseModelJson(text, 'Alt text');
  const alt = normalizeAlt(parsed.alt, brief);
  if (!alt) throw new Error('Alt-text model returned empty alt.');
  return alt;
}

module.exports = {
  loadImageSystem,
  buildVisualBrief,
  buildGenerationPrompt,
  buildAltText,
  fallbackAlt,
  normalizeAlt
};
