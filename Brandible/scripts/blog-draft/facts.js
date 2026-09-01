'use strict';

const fs = require('fs');
const path = require('path');

function loadFacts(editorialDir) {
  const filePath = path.join(editorialDir, 'first-party-facts.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing first-party facts file: ${filePath}`);
  }
  const facts = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!facts.last_verified) {
    throw new Error('first-party-facts.json must include last_verified.');
  }
  if (!facts.services || typeof facts.services !== 'object') {
    throw new Error('first-party-facts.json must include a services object.');
  }
  return facts;
}

function approvedAmounts(facts) {
  const set = new Set();
  for (const value of facts.amounts || []) {
    set.add(Number(value));
  }
  return set;
}

function factsForPrompt(facts) {
  return JSON.stringify(facts, null, 2);
}

function serviceByTopic(facts, topic) {
  const service = String((topic && topic.service) || '').toLowerCase();
  if (service.includes('web design')) return facts.services['web-design'];
  if (service.includes('media')) return facts.services['media-management'];
  if (service.includes('branding')) return facts.services.branding;
  if (service.includes('ai')) return facts.services.ai;
  if (service.includes('digital marketing') || service.includes('seo') || service.includes('ads')) {
    return facts.services['digital-marketing'];
  }
  return null;
}

module.exports = {
  loadFacts,
  approvedAmounts,
  factsForPrompt,
  serviceByTopic
};
