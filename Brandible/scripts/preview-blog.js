#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const { BRANDIBLE_ROOT, REPO_ROOT } = require('./blog-image/config');
const { readPost } = require('./blog-image/frontmatter');

const DEFAULT_PORT = 4173;
const HOST = '127.0.0.1';
const TEMPLATE_PATH = path.join(BRANDIBLE_ROOT, 'blogs', 'post.html');
const POSTS_DIR = path.join(BRANDIBLE_ROOT, 'blogs', 'posts');
const INDEX_JSON = path.join(POSTS_DIR, 'index.json');
const RENDERER_PATH = path.join(BRANDIBLE_ROOT, 'assets', 'js', 'blog-post-renderer.js');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function usage() {
  return [
    'Usage:',
    '  npm run preview:blog -- --post Brandible/blogs/posts/2026-08-31-google-ads-vs-seo-local-businesses.md',
    '  npm run preview:blog -- --post <path> --port 4173',
    '',
    'Serves the Brandible site locally and renders the selected post even if draft: true.',
    'Does not change the markdown, draft status, research sidecar, image sidecar, or production builds.',
    'Stop with Ctrl+C.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = { post: null, port: DEFAULT_PORT, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (token === '--post') {
      if (!argv[i + 1] || String(argv[i + 1]).startsWith('--')) {
        fail(`--post requires a markdown path.\n\n${usage()}`);
      }
      args.post = argv[i + 1];
      i += 1;
    } else if (token.startsWith('--post=')) {
      args.post = token.slice('--post='.length);
    } else if (token === '--port') {
      if (!argv[i + 1] || String(argv[i + 1]).startsWith('--')) {
        fail(`--port requires a number.\n\n${usage()}`);
      }
      args.port = Number(argv[i + 1]);
      i += 1;
    } else if (token.startsWith('--port=')) {
      args.port = Number(token.slice('--port='.length));
    } else {
      fail(`Unknown argument: ${token}\n\n${usage()}`);
    }
  }
  if (args.post != null && String(args.post).trim() === '') {
    fail(`--post requires a markdown path.\n\n${usage()}`);
  }
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) {
    fail(`--port must be an integer from 1 to 65535.\n\n${usage()}`);
  }
  return args;
}

function resolvePostPath(input) {
  const raw = String(input).trim();
  const candidates = [];
  if (path.isAbsolute(raw)) candidates.push(raw);
  candidates.push(path.resolve(process.cwd(), raw));
  candidates.push(path.resolve(REPO_ROOT, raw));
  candidates.push(path.resolve(BRANDIBLE_ROOT, raw));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  fail(`Post not found: ${input}`);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function previewMarkdown(raw) {
  const match = String(raw).match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!match) return raw;
  const yaml = match[2].replace(/^draft:\s*"?true"?\s*$/m, 'draft: false');
  return `${match[1]}${yaml}${match[3]}${raw.slice(match[0].length)}`;
}

function buildPreviewHtml(title) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    fail(`Blog post template not found: ${TEMPLATE_PATH}`);
  }
  let html = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  html = html.replace(/\.\.\/assets\//g, '../../assets/');
  const escapedTitle = escapeHtml(title);
  html = html.replace(/\{\{BLOG_POST_TITLE\}\}/g, escapedTitle);
  html = html.replace(/<title>.*?<\/title>/, `<title>${escapedTitle} | Brandible Marketing Group</title>`);
  html = html.replace(
    /<meta name="robots" content="[^"]*" \/>/,
    '<meta name="robots" content="noindex, nofollow" />'
  );
  return html;
}

function previewIndexJson(selectedFilename) {
  let list = [];
  if (fs.existsSync(INDEX_JSON)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(INDEX_JSON, 'utf8'));
      if (Array.isArray(parsed)) list = parsed.slice();
    } catch {
      list = [];
    }
  }
  if (!list.includes(selectedFilename)) list.unshift(selectedFilename);
  return `${JSON.stringify(list, null, 2)}\n`;
}

function previewRenderer(source) {
  return source.replace(
    /`https:\/\/www\.brandiblemg\.com\$\{frontmatter\.featured_image\}`/g,
    'frontmatter.featured_image'
  );
}

function mimeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function insideRoot(absPath) {
  const root = path.resolve(BRANDIBLE_ROOT);
  const resolved = path.resolve(absPath);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

function mapUrlToFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0] || '/');
  if (!rel.startsWith('/')) rel = `/${rel}`;
  if (rel === '/favicon.ico') rel = '/assets/favicon.ico';
  if (rel.endsWith('/')) rel += 'index.html';
  else if (!path.extname(rel)) {
    const asDir = `${rel}/index.html`;
    const dirAbs = path.join(BRANDIBLE_ROOT, asDir);
    if (fs.existsSync(dirAbs)) rel = asDir;
  }
  const abs = path.resolve(BRANDIBLE_ROOT, `.${rel}`);
  if (!insideRoot(abs)) return null;
  return abs;
}

function send(res, status, body, headers) {
  res.writeHead(status, {
    'cache-control': 'no-store',
    ...headers
  });
  res.end(body);
}

function sendFile(res, filePath) {
  const data = fs.readFileSync(filePath);
  send(res, 200, data, { 'content-type': mimeFor(filePath) });
}

function createPreviewServer({ postPath, filename, slug, title }) {
  const previewHtml = buildPreviewHtml(title);
  const previewIndex = previewIndexJson(filename);
  const previewPath = `/blogs/${slug}/`;
  const markdownUrl = `/blogs/posts/${filename}`;
  const indexUrl = '/blogs/posts/index.json';
  const rendererUrl = '/assets/js/blog-post-renderer.js';

  return http.createServer((req, res) => {
    const host = req.headers.host || `${HOST}`;
    let url;
    try {
      url = new URL(req.url || '/', `http://${host}`);
    } catch {
      send(res, 400, 'Bad request', { 'content-type': 'text/plain; charset=utf-8' });
      return;
    }

    const pathname = url.pathname;

    if (pathname === `/blogs/${slug}` && !pathname.endsWith('/')) {
      res.writeHead(302, { location: previewPath, 'cache-control': 'no-store' });
      res.end();
      return;
    }

    if (pathname === previewPath || pathname === `/blogs/${slug}/index.html`) {
      send(res, 200, previewHtml, { 'content-type': 'text/html; charset=utf-8' });
      return;
    }

    if (pathname === markdownUrl) {
      send(res, 200, previewMarkdown(fs.readFileSync(postPath, 'utf8')), {
        'content-type': 'text/markdown; charset=utf-8'
      });
      return;
    }

    if (pathname === indexUrl) {
      send(res, 200, previewIndex, { 'content-type': 'application/json; charset=utf-8' });
      return;
    }

    if (pathname === rendererUrl && fs.existsSync(RENDERER_PATH)) {
      send(res, 200, previewRenderer(fs.readFileSync(RENDERER_PATH, 'utf8')), {
        'content-type': 'text/javascript; charset=utf-8'
      });
      return;
    }

    const filePath = mapUrlToFile(pathname);
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      send(res, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' });
      return;
    }
    sendFile(res, filePath);
  });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, HOST);
  });
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

  const postPath = resolvePostPath(args.post);
  const post = readPost(postPath);
  if (!post.title) fail(`Post has no title: ${postPath}`);
  const filename = path.basename(postPath);
  const slug = post.slug;
  const previewUrl = `http://${HOST}:${args.port}/blogs/${slug}/`;

  const server = createPreviewServer({
    postPath,
    filename,
    slug,
    title: post.title
  });

  try {
    await listen(server, args.port);
  } catch (error) {
    if (error && error.code === 'EADDRINUSE') {
      fail(`Port ${args.port} is already in use. Pass --port with a free port.`);
    }
    throw error;
  }

  const diskDraft = post.draft === 'true' || post.draft === true;
  console.log(`Local blog preview`);
  console.log(`Post: ${path.relative(REPO_ROOT, postPath).split(path.sep).join('/')}`);
  console.log(`draft on disk: ${diskDraft ? 'true' : 'false'} (unchanged)`);
  console.log(`URL: ${previewUrl}`);
  console.log('This server is local only. Production builds still skip draft: true posts.');
  console.log('Press Ctrl+C to stop.');

  const stop = () => {
    server.close(() => {
      console.log('Stopped local blog preview.');
      process.exit(0);
    });
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => {
  fail(error && error.stack ? error.stack : String(error));
});
