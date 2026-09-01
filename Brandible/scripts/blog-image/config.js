'use strict';

const path = require('path');

const BRANDIBLE_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(BRANDIBLE_ROOT, '..');

const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';
const DEFAULT_BRIEF_MODEL = 'gemini-3.6-flash';

const SOURCE_ASPECT_RATIO = '16:9';
const SOURCE_IMAGE_SIZE = '2K';

const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1200;
const TARGET_RATIO = TARGET_WIDTH / TARGET_HEIGHT;

const WEBP_QUALITY = 80;
const WEBP_QUALITY_FLOOR = 50;
const TARGET_BYTES_MIN = 150 * 1024;
const TARGET_BYTES_MAX = 250 * 1024;
const MAX_BYTES = 400 * 1024;

const PUBLIC_IMAGE_PREFIX = '/assets/blog-images';
const IMAGES_DIR = path.join(BRANDIBLE_ROOT, 'assets', 'blog-images');
const POSTS_DIR = path.join(BRANDIBLE_ROOT, 'blogs', 'posts');
const EDITORIAL_DIR = path.join(BRANDIBLE_ROOT, 'blogs', 'editorial');
const SIDECAR_DIR = path.join(EDITORIAL_DIR, 'images');
const IMAGE_SYSTEM_PATH = path.join(EDITORIAL_DIR, 'image-system.md');

const PROTECTED_BASENAMES = [
  'welcomeblogcover.webp',
  'welcomeblogcover.svg',
  'webblogcover.webp',
  'webblogcover.svg',
  'blog-covers.webp',
  'blog-covers.svg',
  'socialmedia1.webp',
  'socialmedia1.png',
  'brandiblesmaller.webp',
  'brandiblesmaller.png'
];

const GEMINI_GENERATE_URL = 'https://generativelanguage.googleapis.com/v1/models';
const GEMINI_GENERATE_URL_BETA = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 240000;

function envTrim(name) {
  return String(process.env[name] || '').trim();
}

function getImageModel() {
  return envTrim('BLOG_IMAGE_MODEL') || DEFAULT_IMAGE_MODEL;
}

function getBriefModel() {
  return envTrim('BLOG_IMAGE_BRIEF_MODEL') || DEFAULT_BRIEF_MODEL;
}

function getGeminiApiKey() {
  return envTrim('GEMINI_API_KEY');
}

function isProtectedBasename(name) {
  return PROTECTED_BASENAMES.includes(String(name).toLowerCase());
}

module.exports = {
  BRANDIBLE_ROOT,
  REPO_ROOT,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_BRIEF_MODEL,
  SOURCE_ASPECT_RATIO,
  SOURCE_IMAGE_SIZE,
  TARGET_WIDTH,
  TARGET_HEIGHT,
  TARGET_RATIO,
  WEBP_QUALITY,
  WEBP_QUALITY_FLOOR,
  TARGET_BYTES_MIN,
  TARGET_BYTES_MAX,
  MAX_BYTES,
  PUBLIC_IMAGE_PREFIX,
  IMAGES_DIR,
  POSTS_DIR,
  EDITORIAL_DIR,
  SIDECAR_DIR,
  IMAGE_SYSTEM_PATH,
  PROTECTED_BASENAMES,
  GEMINI_GENERATE_URL,
  GEMINI_GENERATE_URL_BETA,
  REQUEST_TIMEOUT_MS,
  getImageModel,
  getBriefModel,
  getGeminiApiKey,
  isProtectedBasename
};
