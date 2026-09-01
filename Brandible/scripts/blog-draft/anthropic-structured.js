'use strict';

const GENERATION_TOOL_NAME = 'submit_blog_draft';
const REVISION_TOOL_NAME = 'submit_blog_revision';

const CMS_CATEGORIES = [
  'Marketing',
  'Web Design',
  'SEO',
  'Social Media',
  'Business Tips',
  'Case Studies'
];

const CLAIM_KIND_ENUM = ['first_party', 'hypothetical', 'opinion'];

const RESOLUTION_ACTION_ENUM = [
  'deleted',
  'replaced_with_token',
  'removed_token',
  'attributed',
  'self_qualified',
  'rewritten_to_evidence'
];

const articleProperties = {
  title: { type: 'string' },
  slug: { type: 'string' },
  meta_title: { type: 'string' },
  meta_description: { type: 'string' },
  excerpt: { type: 'string' },
  category: { type: 'string', enum: CMS_CATEGORIES },
  body: { type: 'string' },
  claims: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['claim', 'kind'],
      properties: {
        claim: { type: 'string' },
        kind: { type: 'string', enum: CLAIM_KIND_ENUM },
        source_id: { type: 'string' }
      }
    }
  },
  cta: {
    type: 'object',
    additionalProperties: false,
    required: ['names_brandible', 'fit_case', 'walk_away_case'],
    properties: {
      names_brandible: { type: 'boolean' },
      fit_case: { type: 'string' },
      walk_away_case: { type: 'string' }
    }
  }
};

const GENERATION_REQUIRED = [
  'title',
  'slug',
  'meta_title',
  'meta_description',
  'excerpt',
  'category',
  'body',
  'claims',
  'cta'
];

const GENERATION_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: GENERATION_REQUIRED,
  properties: articleProperties
};

const REVISION_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...GENERATION_REQUIRED, 'resolutions'],
  properties: {
    ...articleProperties,
    resolutions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['failure_id', 'action', 'resulting_sentence'],
        properties: {
          failure_id: { type: 'string' },
          action: { type: 'string', enum: RESOLUTION_ACTION_ENUM },
          resulting_sentence: { type: 'string' }
        }
      }
    }
  }
};

function validateToolInput(input, schema) {
  const errors = [];
  walkSchema(input, schema, '', errors);
  return errors;
}

function walkSchema(value, schema, path, errors) {
  if (!schema) return;
  const label = path || 'root';
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${label} must be an object`);
      return;
    }
    for (const key of schema.required || []) {
      if (value[key] === undefined) errors.push(`${path ? `${path}.` : ''}${key} is required`);
    }
    const allowed = new Set(Object.keys(schema.properties || {}));
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) errors.push(`unexpected property ${path ? `${path}.` : ''}${key}`);
      }
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (value[key] !== undefined) walkSchema(value[key], child, path ? `${path}.${key}` : key, errors);
    }
    return;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${label} must be an array`);
      return;
    }
    (value || []).forEach((item, index) => {
      walkSchema(item, schema.items, `${label}[${index}]`, errors);
    });
    return;
  }
  if (schema.type === 'string' && typeof value !== 'string') {
    errors.push(`${label} must be a string`);
  }
  if (schema.type === 'boolean' && typeof value !== 'boolean') {
    errors.push(`${label} must be a boolean`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${label} must be one of ${schema.enum.join(', ')}`);
  }
}

function extractAnthropicToolInput(payload, toolName) {
  const toolUse = (payload && payload.content ? payload.content : []).find(
    (part) => part && part.type === 'tool_use' && part.name === toolName
  );
  if (!toolUse || !toolUse.input || typeof toolUse.input !== 'object' || Array.isArray(toolUse.input)) {
    return {
      ok: false,
      error: `Anthropic did not return required structured tool output: ${toolName}`
    };
  }
  return { ok: true, input: toolUse.input };
}

async function completeAnthropicStructured({ model, apiKey, prompt, toolName, inputSchema }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      tools: [
        {
          name: toolName,
          description: 'Return the complete structured Brandible blog payload for this step.',
          strict: true,
          input_schema: inputSchema
        }
      ],
      tool_choice: {
        type: 'tool',
        name: toolName
      },
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      `Anthropic request failed (${response.status}): ${JSON.stringify(payload).slice(0, 500)}`
    );
    throw error;
  }
  const extracted = extractAnthropicToolInput(payload, toolName);
  if (!extracted.ok) {
    throw new Error(extracted.error);
  }
  return extracted.input;
}

module.exports = {
  GENERATION_TOOL_NAME,
  REVISION_TOOL_NAME,
  CMS_CATEGORIES,
  CLAIM_KIND_ENUM,
  RESOLUTION_ACTION_ENUM,
  GENERATION_INPUT_SCHEMA,
  REVISION_INPUT_SCHEMA,
  extractAnthropicToolInput,
  validateToolInput,
  completeAnthropicStructured
};
