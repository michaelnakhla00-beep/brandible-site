'use strict';

const { GEMINI_GENERATE_URL, GEMINI_GENERATE_URL_BETA, REQUEST_TIMEOUT_MS } = require('./config');

function inlineFromPart(part) {
  if (!part || typeof part !== 'object') return null;
  const blob = part.inlineData || part.inline_data;
  if (!blob || !blob.data) return null;
  return {
    data: blob.data,
    mimeType: blob.mimeType || blob.mime_type || 'image/png'
  };
}

function extractLastImage(payload) {
  const parts = (((payload || {}).candidates || [])[0] || {}).content
    ? payload.candidates[0].content.parts || []
    : [];
  const images = [];
  for (const part of parts) {
    const inline = inlineFromPart(part);
    if (inline) images.push(inline);
  }
  if (!images.length) return null;
  return images[images.length - 1];
}

function extractText(payload) {
  const parts = (((payload || {}).candidates || [])[0] || {}).content
    ? payload.candidates[0].content.parts || []
    : [];
  return parts
    .filter((part) => part && part.text && !part.thought)
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function parseModelJson(text, label) {
  let candidate = String(text || '').trim();
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidate = fenced[1].trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`${label} did not return JSON.`);
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (error) {
    throw new Error(`Could not parse ${label} JSON: ${error.message}`);
  }
}

function finishReason(payload) {
  return (((payload || {}).candidates || [])[0] || {}).finishReason
    || (((payload || {}).candidates || [])[0] || {}).finish_reason
    || null;
}

function blockedMessage(payload) {
  const feedback = (payload || {}).promptFeedback || (payload || {}).prompt_feedback;
  if (!feedback) return null;
  const reason = feedback.blockReason || feedback.block_reason;
  return reason ? `Gemini blocked the prompt (${reason}).` : null;
}

async function postGenerate(url, { apiKey, body, signal }) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(body),
    signal
  });
}

async function generateContent({ apiKey, model, body }) {
  const encodedModel = encodeURIComponent(model);
  const primary = `${GEMINI_GENERATE_URL}/${encodedModel}:generateContent`;
  const fallback = `${GEMINI_GENERATE_URL_BETA}/${encodedModel}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await postGenerate(primary, { apiKey, body, signal: controller.signal });
    if (response.status === 404 || response.status === 400) {
      const beta = await postGenerate(fallback, { apiKey, body, signal: controller.signal });
      if (beta.ok || response.status === 404) {
        response = beta;
      }
    }
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(`Gemini request timed out after ${REQUEST_TIMEOUT_MS / 1000}s (${model}).`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = JSON.stringify(payload).slice(0, 800);
    throw new Error(`Gemini request failed (${response.status}) for ${model}: ${detail}`);
  }
  const blocked = blockedMessage(payload);
  if (blocked) throw new Error(blocked);
  return payload;
}

module.exports = {
  generateContent,
  extractLastImage,
  extractText,
  parseModelJson,
  finishReason
};
