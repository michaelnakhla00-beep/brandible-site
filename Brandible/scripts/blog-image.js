#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const {
  BRANDIBLE_ROOT,
  REPO_ROOT,
  IMAGES_DIR,
  PUBLIC_IMAGE_PREFIX,
  SIDECAR_DIR,
  TARGET_WIDTH,
  TARGET_HEIGHT,
  TARGET_BYTES_MIN,
  TARGET_BYTES_MAX,
  MAX_BYTES,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_BRIEF_MODEL,
  getImageModel,
  getBriefModel,
  getGeminiApiKey,
  isProtectedBasename
} = require('./blog-image/config');
const { readPost, patchImageFields } = require('./blog-image/frontmatter');
const { buildVisualBrief, buildGenerationPrompt, buildAltText, fallbackAlt } = require('./blog-image/brief');
const { generateBlogImage } = require('./blog-image/generate');
const { optimizeToWebp } = require('./blog-image/optimize');
const { commitImageAndMarkdown } = require('./blog-image/commit');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function usage() {
  return [
    'Usage:',
    '  npm run blog:image -- --post Brandible/blogs/posts/2026-08-31-google-ads-vs-seo-local-businesses.md',
    '  npm run blog:image -- --post <path> --force',
    '  npm run blog:image -- --post <path> --force --notes "less clutter, warmer light"',
    '  npm run blog:image -- --post <path> --input <image-path>',
    '  npm run blog:image -- --post <path> --input <image-path> --model <name> --style-kit <name>',
    '  npm run blog:image -- --post <path> --input <image-path> --alt "visible scene in 8-18 words"',
    '',
    'Gemini generation requires GEMINI_API_KEY.',
    `Image model: BLOG_IMAGE_MODEL (default ${DEFAULT_IMAGE_MODEL}).`,
    `Brief model: BLOG_IMAGE_BRIEF_MODEL (default ${DEFAULT_BRIEF_MODEL}).`,
    '',
    '--input skips Gemini image generation and ingests a file produced separately (Artlist MCP / Toolkit).',
    '--input uses Gemini vision for alt text only if GEMINI_API_KEY is set; otherwise --alt is required.',
    '--notes cannot be combined with --input.',
    '',
    'Writes a WebP to Brandible/assets/blog-images/{slug}.webp and sets featured_image plus featured_image_alt.',
    'Does not publish, does not set og_image, and does not change article body, research, SEO fields, or draft: true.'
  ].join('\n');
}

function requireValue(argv, i, flag) {
  if (!argv[i + 1] || String(argv[i + 1]).startsWith('--')) {
    fail(`${flag} requires a value.\n\n${usage()}`);
  }
  return argv[i + 1];
}

function parseArgs(argv) {
  const args = {
    post: null,
    force: false,
    notes: '',
    input: null,
    model: null,
    styleKit: null,
    alt: null,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (token === '--force') {
      args.force = true;
    } else if (token === '--post') {
      args.post = requireValue(argv, i, '--post');
      i += 1;
    } else if (token.startsWith('--post=')) {
      args.post = token.slice('--post='.length);
    } else if (token === '--notes') {
      args.notes = requireValue(argv, i, '--notes');
      i += 1;
    } else if (token.startsWith('--notes=')) {
      args.notes = token.slice('--notes='.length);
    } else if (token === '--input') {
      args.input = requireValue(argv, i, '--input');
      i += 1;
    } else if (token.startsWith('--input=')) {
      args.input = token.slice('--input='.length);
    } else if (token === '--model') {
      args.model = requireValue(argv, i, '--model');
      i += 1;
    } else if (token.startsWith('--model=')) {
      args.model = token.slice('--model='.length);
    } else if (token === '--style-kit') {
      args.styleKit = requireValue(argv, i, '--style-kit');
      i += 1;
    } else if (token.startsWith('--style-kit=')) {
      args.styleKit = token.slice('--style-kit='.length);
    } else if (token === '--alt') {
      args.alt = requireValue(argv, i, '--alt');
      i += 1;
    } else if (token.startsWith('--alt=')) {
      args.alt = token.slice('--alt='.length);
    } else {
      fail(`Unknown argument: ${token}\n\n${usage()}`);
    }
  }
  if (args.post != null && String(args.post).trim() === '') {
    fail(`--post requires a markdown path.\n\n${usage()}`);
  }
  if (args.input != null && String(args.input).trim() === '') {
    fail(`--input requires an image path.\n\n${usage()}`);
  }
  return args;
}

function optionalText(value) {
  const text = String(value == null ? '' : value).trim();
  return text || null;
}

function resolveExistingFile(input, label) {
  const raw = String(input).trim();
  const candidates = [];
  if (path.isAbsolute(raw)) candidates.push(raw);
  candidates.push(path.resolve(process.cwd(), raw));
  candidates.push(path.resolve(REPO_ROOT, raw));
  candidates.push(path.resolve(BRANDIBLE_ROOT, raw));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  fail(`${label} not found: ${input}`);
}

function resolvePostPath(input) {
  return resolveExistingFile(input, 'Post');
}

function repoRelative(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
}

function publicImagePath(slug) {
  return `${PUBLIC_IMAGE_PREFIX}/${slug}.webp`;
}

function destImagePath(slug) {
  return path.join(IMAGES_DIR, `${slug}.webp`);
}

function sidecarPathFor(post) {
  const stamp = post.dateStamp || new Date().toISOString().slice(0, 10);
  return path.join(SIDECAR_DIR, `${stamp}-${post.slug}.json`);
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

function resolveExistingImageFile(post) {
  const dest = destImagePath(post.slug);
  if (fs.existsSync(dest)) return dest;
  const featured = String(post.featuredImage || '').trim();
  if (!featured) return null;
  if (!featured.startsWith(`${PUBLIC_IMAGE_PREFIX}/`)) return null;
  const base = path.basename(featured);
  if (isProtectedBasename(base)) return null;
  const onDisk = path.join(IMAGES_DIR, base);
  if (fs.existsSync(onDisk)) return onDisk;
  return null;
}

function assertSafeDestination(slug, { force }) {
  const dest = destImagePath(slug);
  const base = path.basename(dest);
  if (isProtectedBasename(base)) {
    fail(`Refusing to write over a protected live cover: ${base}`);
  }
  if (fs.existsSync(dest) && !force) {
    fail(
      `Image already exists: ${repoRelative(dest)}\nPass --force to replace it after a successful new generate. Existing markdown will stay untouched until then.`
    );
  }
  return dest;
}

function reportOptimized(optimized) {
  console.log(
    `Source ${optimized.source.width}x${optimized.source.height} → crop ${optimized.crop.width}x${optimized.crop.height} → ${optimized.width}x${optimized.height} WebP ${optimized.bytes} bytes (q${optimized.quality})`
  );
  if (optimized.bytes < TARGET_BYTES_MIN || optimized.bytes > TARGET_BYTES_MAX) {
    console.log(
      `Note: file size is outside the ${TARGET_BYTES_MIN / 1024}–${TARGET_BYTES_MAX / 1024} KB target, still under ${MAX_BYTES / 1024} KB.`
    );
  }
}

function suppliedAlt(text) {
  const alt = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/[—–]/g, ',')
    .trim();
  if (!alt) {
    fail('--alt must be non-empty text describing the visible scene.');
  }
  return /[.!?]$/.test(alt) ? alt : `${alt}.`;
}

async function resolveInputAlt({ apiKey, altArg, optimized }) {
  const provided = optionalText(altArg);
  if (apiKey) {
    try {
      const alt = await buildAltText({
        apiKey,
        imageBuffer: optimized.buffer,
        mimeType: 'image/webp',
        brief: null
      });
      if (alt) return alt;
      if (provided) {
        console.log('Alt-text model returned empty alt. Using --alt.');
        return suppliedAlt(provided);
      }
      fail('Alt-text model returned empty alt. Pass --alt to set featured_image_alt without Gemini vision.');
    } catch (error) {
      if (provided) {
        console.log(`Alt-text model failed (${error.message}). Using --alt.`);
        return suppliedAlt(provided);
      }
      fail(`Alt-text model failed (${error.message}). Pass --alt to set featured_image_alt without Gemini vision.`);
    }
  }
  if (!provided) {
    fail('GEMINI_API_KEY is not set. Pass --alt to set featured_image_alt without Gemini vision.');
  }
  return suppliedAlt(provided);
}

async function ingestExternal({ args, apiKey, postPath, originalMarkdown, post, dest }) {
  const inputPath = resolveExistingFile(args.input, 'Input image');
  const model = optionalText(args.model);
  const styleKit = optionalText(args.styleKit);
  console.log(`Post: ${repoRelative(postPath)}`);
  console.log(`Slug: ${post.slug}`);
  console.log('Mode: external (Artlist ingest)');
  console.log(`Input: ${repoRelative(inputPath)}`);
  if (model) console.log(`Model: ${model}`);
  if (styleKit) console.log(`Style kit: ${styleKit}`);

  const sourceBuffer = fs.readFileSync(inputPath);
  console.log('Optimizing supplied image...');
  const optimized = await optimizeToWebp(sourceBuffer);
  reportOptimized(optimized);

  const alt = await resolveInputAlt({ apiKey, altArg: args.alt, optimized });
  const featuredImage = publicImagePath(post.slug);
  const importedAt = new Date().toISOString();
  const sidecar = {
    source_post_path: repoRelative(postPath),
    slug: post.slug,
    visual_brief: null,
    final_generation_prompt: null,
    provider: 'artlist',
    model,
    style_kit: styleKit,
    generated_at: null,
    imported_at: importedAt,
    generation_mode: 'external',
    regeneration_notes: null,
    original_source_filename: path.basename(inputPath),
    final_dimensions: { width: TARGET_WIDTH, height: TARGET_HEIGHT },
    final_byte_size: optimized.bytes,
    final_image_path: repoRelative(dest),
    licensing: 'Imported Artlist-generated image. Provenance recorded. Created under the user\'s Artlist subscription terms.'
  };

  const nextMarkdown = patchImageFields(originalMarkdown, {
    featuredImage,
    featuredImageAlt: alt
  });
  commitImageAndMarkdown({
    destPath: dest,
    webpBuffer: optimized.buffer,
    postPath,
    originalMarkdown,
    nextMarkdown,
    sidecarPath: sidecarPathFor(post),
    sidecar
  });

  console.log(`Wrote ${repoRelative(dest)}`);
  console.log(`Sidecar: ${repoRelative(sidecarPathFor(post))}`);
  console.log(`featured_image: ${featuredImage}`);
  console.log(`featured_image_alt: ${alt}`);
  console.log('draft status unchanged. Not published. Human review next.');
}

async function generateWithGemini({ args, apiKey, postPath, originalMarkdown, post, dest }) {
  const notes = String(args.notes || '').trim();
  const existingFile = resolveExistingImageFile(post);
  const useImageToImage = Boolean(notes && existingFile);

  const imageModel = getImageModel();
  const briefModel = getBriefModel();
  console.log(`Post: ${repoRelative(postPath)}`);
  console.log(`Slug: ${post.slug}`);
  console.log(`Image model: ${imageModel}`);
  console.log(`Brief model: ${briefModel}`);
  console.log(`Mode: ${useImageToImage ? 'image-to-image' : 'new'}`);

  const { brief } = await buildVisualBrief({ apiKey, post, notes });
  console.log(`Subject: ${brief.subject}`);

  const prompt = buildGenerationPrompt(brief, {
    notes,
    imageToImage: useImageToImage
  });

  let source = null;
  if (useImageToImage) {
    source = {
      buffer: fs.readFileSync(existingFile),
      mimeType: mimeFromPath(existingFile)
    };
  }

  console.log('Generating image...');
  const generated = await generateBlogImage({ apiKey, prompt, source });
  console.log(`Received ${generated.mimeType}, ${generated.buffer.length} bytes. Optimizing...`);

  const optimized = await optimizeToWebp(generated.buffer);
  reportOptimized(optimized);

  let alt;
  try {
    alt = await buildAltText({
      apiKey,
      imageBuffer: optimized.buffer,
      mimeType: 'image/webp',
      brief
    });
  } catch (error) {
    console.log(`Alt-text model failed (${error.message}). Using the visual brief instead.`);
    alt = fallbackAlt(brief);
  }

  const featuredImage = publicImagePath(post.slug);
  const sidecar = {
    source_post_path: repoRelative(postPath),
    slug: post.slug,
    visual_brief: brief,
    final_generation_prompt: prompt,
    provider: 'gemini',
    model: generated.model,
    generated_at: new Date().toISOString(),
    generation_mode: useImageToImage ? 'image-to-image' : 'new',
    regeneration_notes: notes || null,
    final_dimensions: { width: TARGET_WIDTH, height: TARGET_HEIGHT },
    final_byte_size: optimized.bytes,
    final_image_path: repoRelative(dest),
    licensing: 'Original AI-generated imagery created under the provider\'s API terms, with generation provenance recorded.'
  };

  const nextMarkdown = patchImageFields(originalMarkdown, {
    featuredImage,
    featuredImageAlt: alt
  });
  commitImageAndMarkdown({
    destPath: dest,
    webpBuffer: optimized.buffer,
    postPath,
    originalMarkdown,
    nextMarkdown,
    sidecarPath: sidecarPathFor(post),
    sidecar
  });

  console.log(`Wrote ${repoRelative(dest)}`);
  console.log(`Sidecar: ${repoRelative(sidecarPathFor(post))}`);
  console.log(`featured_image: ${featuredImage}`);
  console.log(`featured_image_alt: ${alt}`);
  console.log('draft status unchanged. Not published. Human review next.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.post) {
    fail(`--post is required.\n\n${usage()}`);
  }

  const hasInput = Boolean(optionalText(args.input));
  if (!hasInput) {
    if (optionalText(args.model) || optionalText(args.styleKit) || optionalText(args.alt)) {
      fail('--model, --style-kit, and --alt are only valid with --input.');
    }
  } else if (optionalText(args.notes)) {
    fail('--notes cannot be combined with --input. --notes is Gemini image-to-image only.');
  }

  const apiKey = getGeminiApiKey();
  if (!hasInput && !apiKey) {
    fail(`GEMINI_API_KEY is not set.\n\n${usage()}`);
  }

  const postPath = resolvePostPath(args.post);
  const originalMarkdown = fs.readFileSync(postPath, 'utf8');
  const post = readPost(postPath);
  const dest = assertSafeDestination(post.slug, { force: args.force });

  if (hasInput) {
    await ingestExternal({ args, apiKey, postPath, originalMarkdown, post, dest });
    return;
  }

  await generateWithGemini({ args, apiKey, postPath, originalMarkdown, post, dest });
}

main().catch((error) => {
  fail(error && error.stack ? error.stack : String(error));
});
