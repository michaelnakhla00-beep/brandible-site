#!/usr/bin/env node
'use strict';

const { getBriefModel, getGeminiApiKey } = require('./blog-image/config');
const { generateContent } = require('./blog-image/gemini');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function conciseGeminiError(error) {
  const text = error && error.message ? String(error.message) : String(error || 'Gemini preflight failed.');
  const match = text.match(/^Gemini request failed \((\d+)\) for (.+): ([\s\S]+)$/);
  if (!match) return text.split('\n')[0].slice(0, 300);
  const status = match[1];
  const model = match[2];
  const detail = match[3].trim();
  let apiMessage = '';
  let apiStatus = '';
  try {
    const payload = JSON.parse(detail);
    const api = payload.error || {};
    apiMessage = String(api.message || '').trim();
    apiStatus = String(api.status || '').trim();
  } catch (_) {
    const messageMatch = detail.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (messageMatch) apiMessage = messageMatch[1].replace(/\\"/g, '"');
    const statusMatch = detail.match(/"status"\s*:\s*"([^"]+)"/);
    if (statusMatch) apiStatus = statusMatch[1];
  }
  if (apiMessage) {
    const kind = /api key|permission|unauth|invalid|denied|forbidden|credential/i.test(
      `${apiMessage} ${apiStatus} ${status}`
    )
      ? 'Gemini authentication failed'
      : 'Gemini request failed';
    return `${kind} (${status}${apiStatus ? ` ${apiStatus}` : ''}) for ${model}: ${apiMessage}`;
  }
  return `Gemini request failed (${status}) for ${model}.`;
}

async function runPreflight() {
  const apiKey = getGeminiApiKey();
  if (!apiKey) fail('GEMINI_API_KEY is not set.');
  const model = getBriefModel();
  try {
    await generateContent({
      apiKey,
      model,
      body: {
        contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 16
        }
      }
    });
  } catch (error) {
    fail(conciseGeminiError(error));
  }
  console.log(`Gemini preflight passed: ${model}`);
}

if (require.main === module) {
  runPreflight().catch((error) => fail(conciseGeminiError(error)));
}

module.exports = {
  conciseGeminiError,
  runPreflight
};
