'use strict';

function padTopicId(raw) {
  return String(raw || '')
    .replace(/^#/, '')
    .trim()
    .padStart(2, '0');
}

function normalizeStatus(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (value === 'hold') return 'hold';
  return 'queued';
}

function tableCells(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed.startsWith('|')) return [];
  return trimmed
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function parseQueueTopics(queueText) {
  const topics = new Map();
  for (const line of String(queueText).split('\n')) {
    const cells = tableCells(line);
    if (cells.length < 5) continue;
    if (!/^\d+$/.test(cells[0])) continue;
    const id = padTopicId(cells[0]);
    if (id === '00') continue;
    topics.set(id, {
      id,
      title: cells[1],
      type: cells[2],
      service: cells[3],
      priority: cells[4],
      status: normalizeStatus(cells[5]),
      detail: ''
    });
  }

  const detailRe = /^###\s+(\d+)\s+[—–-]\s+(.+)$/gm;
  const headings = [];
  let detailMatch;
  while ((detailMatch = detailRe.exec(queueText)) !== null) {
    headings.push({
      id: padTopicId(detailMatch[1]),
      title: detailMatch[2].trim(),
      index: detailMatch.index
    });
  }
  for (let i = 0; i < headings.length; i += 1) {
    const start = headings[i].index;
    const end = i + 1 < headings.length ? headings[i + 1].index : queueText.length;
    const block = String(queueText).slice(start, end).trim();
    const existing = topics.get(headings[i].id) || {
      id: headings[i].id,
      title: headings[i].title,
      type: '',
      service: '',
      priority: '',
      status: 'queued',
      detail: ''
    };
    existing.detail = block;
    if (!existing.title) existing.title = headings[i].title;
    if (!existing.status) existing.status = 'queued';
    topics.set(headings[i].id, existing);
  }

  return [...topics.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

function findTopic(topics, rawId) {
  const id = padTopicId(rawId);
  return topics.find((item) => item.id === id) || null;
}

module.exports = {
  padTopicId,
  normalizeStatus,
  parseQueueTopics,
  findTopic
};
