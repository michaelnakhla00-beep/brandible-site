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

function parseNumeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value || '')
    .replace(/,/g, '')
    .match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function addNumber(set, value) {
  const parsed = parseNumeric(value);
  if (parsed == null || Number.isNaN(parsed)) return;
  set.add(parsed);
}

function collectStructuredMoney(facts, money) {
  for (const value of facts.amounts || []) addNumber(money, value);
  const ads = facts.services && facts.services['digital-marketing'] && facts.services['digital-marketing'].ads;
  if (ads) {
    addNumber(money, ads.setup_fee);
    addNumber(money, ads.email_from);
    const minSpend = String(ads.min_spend || '');
    for (const match of minSpend.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)) {
      addNumber(money, match[1]);
    }
  }
  const emailFrom = facts.services && facts.services['digital-marketing'] && facts.services['digital-marketing'].email_from;
  addNumber(money, emailFrom);
}

function collectExampleMetrics(facts, money, percents, counts) {
  const examples = facts.examples || {};
  for (const example of Object.values(examples)) {
    for (const line of example.facts || []) {
      const text = String(line);
      for (const match of text.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)) {
        addNumber(money, match[1]);
      }
      for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
        addNumber(percents, match[1]);
      }
      for (const match of text.matchAll(/\bx(\d+(?:\.\d+)?)/gi)) {
        addNumber(counts, match[1]);
      }
      for (const match of text.matchAll(/(?<!\$)(?<!\.)\b(\d{1,3}(?:,\d{3})+|\d+)\b(?!\s*%)/g)) {
        const amount = Number(String(match[1]).replace(/,/g, ''));
        if (amount >= 1900 && amount <= 2100 && !String(match[1]).includes(',')) continue;
        if (amount >= 10) counts.add(amount);
      }
    }
  }
}

function buildAllowlist(facts) {
  const money = new Set();
  const percents = new Set();
  const counts = new Set();
  const timelines = [];

  collectStructuredMoney(facts, money);
  collectExampleMetrics(facts, money, percents, counts);

  const ads = facts.services && facts.services['digital-marketing'] && facts.services['digital-marketing'].ads;
  if (ads && ads.management) {
    const percent = String(ads.management).match(/(\d+(?:\.\d+)?)\s*%/);
    if (percent) addNumber(percents, percent[1]);
  }

  const webTimeline = facts.services && facts.services['web-design'] && facts.services['web-design'].timeline;
  const weeks = String(webTimeline || '').match(/(\d+)\s*[–-]\s*(\d+)\s+weeks/i);
  if (weeks) {
    timelines.push({ min: Number(weeks[1]), max: Number(weeks[2]), unit: 'weeks', text: `${weeks[1]}–${weeks[2]} weeks` });
  }
  const contracts = facts.company && facts.company.contracts;
  const notice = String(contracts || '').match(/(\d+)\s+days/i);
  if (notice) {
    timelines.push({ min: Number(notice[1]), max: Number(notice[1]), unit: 'days', text: `${notice[1]} days` });
  }

  const volume = facts.services && facts.services['media-management'] && facts.services['media-management'].typical_volume;
  if (volume) {
    const posts = String(volume).match(/(\d+)\s+posts/i);
    const platforms = String(volume).match(/(\d+)\s+platforms/i);
    if (posts) addNumber(counts, posts[1]);
    if (platforms) addNumber(counts, platforms[1]);
  }

  return {
    money,
    percents,
    counts,
    timelines,
    moneyList: [...money].sort((a, b) => a - b),
    percentList: [...percents].sort((a, b) => a - b),
    countList: [...counts].sort((a, b) => a - b)
  };
}

function approvedAmounts(facts) {
  return buildAllowlist(facts).money;
}

function moneySetHas(allowlist, amount) {
  if (allowlist.money.has(amount)) return true;
  for (const value of allowlist.money) {
    if (Math.abs(value - amount) < 0.001) return true;
  }
  return false;
}

function formatMoney(amount) {
  if (Number.isInteger(amount)) return amount.toLocaleString('en-US');
  return String(amount);
}

function allowlistForPrompt(allowlist) {
  const money = allowlist.moneyList.map((value) => `$${formatMoney(value)}`).join(', ');
  const percents = allowlist.percentList.map((value) => `${value}%`).join(', ') || '(none)';
  const timelines = allowlist.timelines.map((item) => item.text).join(', ') || '(none)';
  const counts = allowlist.countList.join(', ') || '(none)';
  return [
    'Approved Brandible number allowlist. These are the only Brandible monetary figures, percentages, timelines, and numeric case metrics you may use.',
    `Money: ${money}`,
    `Percentages: ${percents}`,
    `Timelines: ${timelines}`,
    `Case-study / volume counts: ${counts}`,
    'Any other Brandible currency amount, percentage, timeline, or numeric case metric is forbidden.',
    'If a number is not on this list, delete it and the claim that depends on it. Do not substitute another number. Do not estimate. Do not infer a market range.'
  ].join('\n');
}

function sanitizePriceDisplay(text, allowlist) {
  const original = String(text || '');
  const matches = [...original.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)];
  if (!matches.length) return original;
  const amounts = matches.map((match) => Number(String(match[1]).replace(/,/g, '')));
  const approved = amounts.filter((amount) => moneySetHas(allowlist, amount));
  if (approved.length === amounts.length) return original;
  if (!approved.length) return 'Brandible typical range (use only numbers from the approved allowlist)';
  const unique = [...new Set(approved)].sort((a, b) => a - b);
  if (unique.length === 1) return `$${formatMoney(unique[0])}+`;
  return `$${formatMoney(unique[0])}–$${formatMoney(unique[unique.length - 1])}+`;
}

function sanitizeFactsNode(node, allowlist) {
  if (Array.isArray(node)) return node.map((item) => sanitizeFactsNode(item, allowlist));
  if (!node || typeof node !== 'object') return node;
  const next = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'price_display' && typeof value === 'string') {
      next[key] = sanitizePriceDisplay(value, allowlist);
    } else if (typeof value === 'string') {
      next[key] = value.replace(/\$\s*([\d,]+(?:\.\d+)?)/g, (match, raw) => {
        const amount = Number(String(raw).replace(/,/g, ''));
        return moneySetHas(allowlist, amount) ? match : '[unapproved amount removed]';
      });
    } else {
      next[key] = sanitizeFactsNode(value, allowlist);
    }
  }
  return next;
}

function factsForPrompt(facts, allowlist) {
  if (!allowlist) return JSON.stringify(facts, null, 2);
  return JSON.stringify(sanitizeFactsNode(facts, allowlist), null, 2);
}

function allowlistSnapshot(allowlist) {
  return {
    money: allowlist.moneyList,
    percents: allowlist.percentList,
    counts: allowlist.countList,
    timelines: (allowlist.timelines || []).map((item) => item.text)
  };
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
  buildAllowlist,
  allowlistForPrompt,
  allowlistSnapshot,
  moneySetHas,
  factsForPrompt,
  serviceByTopic
};
