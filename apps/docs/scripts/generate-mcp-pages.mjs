/**
 * Generates one MDX reference page per MCP tool from the live registry in
 * `@rytask/contracts` (the same registry the server boots from), plus an index page.
 *
 * Sources of truth:
 *   - tool names / descriptions / destructive flags: `mcpTools` (packages/contracts/src/mcp/registry.ts)
 *   - input schemas: `toolInput` zod map (packages/contracts/src/mcp/tool-io.ts)
 *   - required permission per tool: TOOL_PERMISSIONS in apps/api/src/mcp/tools/tool-dispatch.ts
 *
 * Run via `pnpm --filter @rytask/docs generate:mcp` (also part of the docs build).
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { mcpTools, toolInput } = require('@rytask/contracts');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '../..');
const OUT_DIR = path.join(APP_ROOT, 'content/docs/reference/mcp-tools');
const DISPATCH_FILE = path.join(REPO_ROOT, 'apps/api/src/mcp/tools/tool-dispatch.ts');

/** Parse the TOOL_PERMISSIONS map out of the dispatcher source. */
async function readToolPermissions() {
  const text = await readFile(DISPATCH_FILE, 'utf8');
  const start = text.indexOf('TOOL_PERMISSIONS');
  if (start === -1) {
    throw new Error(`TOOL_PERMISSIONS not found in ${DISPATCH_FILE}`);
  }
  const block = text.slice(start, text.indexOf('};', start));
  const permissions = new Map();
  for (const match of block.matchAll(/^\s*([a-z_]+):\s*'([a-z:_]+)'/gm)) {
    permissions.set(match[1], match[2]);
  }
  return permissions;
}

function mdEscape(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('<', '&lt;').replaceAll('{', '&#123;');
}

/**
 * Convert a zod v3 schema (from @rytask/contracts) to a plain JSON-Schema-ish object
 * by walking `_def`. Deliberately minimal: it supports exactly the shapes the tool
 * contracts use, and THROWS on anything it does not recognize, so a new schema shape
 * fails this build instead of producing wrong docs.
 */
const lazyInProgress = new WeakSet();

function zodToJson(schema) {
  const def = schema?._def;
  if (!def) throw new Error('Not a zod schema');
  const type = def.typeName;
  switch (type) {
    case 'ZodLazy': {
      if (lazyInProgress.has(schema)) {
        return { description: 'recursive — same shape as the parent node' };
      }
      lazyInProgress.add(schema);
      try {
        return zodToJson(def.getter());
      } finally {
        lazyInProgress.delete(schema);
      }
    }
    case 'ZodDiscriminatedUnion':
      return { anyOf: [...def.options.values()].map((option) => zodToJson(option)) };
    case 'ZodIntersection':
      return { allOf: [zodToJson(def.left), zodToJson(def.right)] };
    case 'ZodTuple':
      return { type: 'array', prefixItems: def.items.map((item) => zodToJson(item)) };
    case 'ZodNativeEnum':
      return { type: 'string', enum: Object.values(def.values) };
    case 'ZodNull':
      return { type: 'null' };
    case 'ZodObject': {
      const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
      const properties = {};
      const required = [];
      for (const [key, value] of Object.entries(shape)) {
        const { json, optional } = unwrap(value);
        properties[key] = json;
        if (!optional) required.push(key);
      }
      const out = { type: 'object', properties };
      if (required.length > 0) out.required = required;
      if (def.unknownKeys === 'strict') out.additionalProperties = false;
      return out;
    }
    case 'ZodString': {
      const out = { type: 'string' };
      for (const check of def.checks ?? []) {
        if (check.kind === 'uuid') out.format = 'uuid';
        if (check.kind === 'datetime') out.format = 'date-time';
        if (check.kind === 'regex') out.pattern = String(check.regex);
        if (check.kind === 'min') out.minLength = check.value;
        if (check.kind === 'max') out.maxLength = check.value;
      }
      return out;
    }
    case 'ZodNumber': {
      const out = { type: def.checks?.some((c) => c.kind === 'int') ? 'integer' : 'number' };
      for (const check of def.checks ?? []) {
        if (check.kind === 'min') out.minimum = check.value;
        if (check.kind === 'max') out.maximum = check.value;
      }
      return out;
    }
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum':
      return { type: 'string', enum: def.values };
    case 'ZodLiteral':
      return { const: def.value };
    case 'ZodArray':
      return { type: 'array', items: zodToJson(def.type) };
    case 'ZodUnion':
      return { anyOf: def.options.map((option) => zodToJson(option)) };
    case 'ZodNullable':
      return { anyOf: [zodToJson(def.innerType), { type: 'null' }] };
    case 'ZodOptional':
    case 'ZodDefault':
      return zodToJson(def.innerType);
    case 'ZodEffects':
      return zodToJson(def.schema);
    case 'ZodRecord':
      return { type: 'object', additionalProperties: zodToJson(def.valueType) };
    case 'ZodUnknown':
    case 'ZodAny':
      return {};
    default:
      throw new Error(`Unsupported zod type in tool input: ${type}`);
  }
}

/** Peel optional/default wrappers and surface the description, if any. */
function unwrap(schema) {
  let current = schema;
  let optional = false;
  let description = current?._def?.description;
  while (current?._def) {
    const type = current._def.typeName;
    if (type === 'ZodOptional' || type === 'ZodDefault') {
      optional = true;
      current = current._def.innerType;
    } else if (type === 'ZodEffects') {
      current = current._def.schema;
    } else {
      break;
    }
    description ??= current?._def?.description;
  }
  const json = zodToJson(current);
  if (description) json.description = description;
  if (schema?._def?.typeName === 'ZodDefault') {
    json.default = schema._def.defaultValue();
  }
  return { json, optional };
}

function describeType(schema) {
  if (!schema || typeof schema !== 'object') return 'unknown';
  if (schema.enum) return schema.enum.map((value) => `\`${value}\``).join(' \\| ');
  if (schema.const !== undefined) return `\`${JSON.stringify(schema.const)}\``;
  if (schema.anyOf) return schema.anyOf.map(describeType).join(' \\| ');
  if (schema.type === 'array') return `array of ${describeType(schema.items)}`;
  if (schema.type === 'object') return 'object';
  if (schema.format === 'uuid') return 'string (uuid)';
  if (schema.format === 'date-time') return 'string (ISO date-time)';
  return schema.type ?? 'unknown';
}

function paramsTable(jsonSchema) {
  const properties = jsonSchema?.properties ?? {};
  const names = Object.keys(properties);
  if (names.length === 0) {
    return 'This tool takes no parameters — call it with an empty object.';
  }
  const required = new Set(jsonSchema.required ?? []);
  const rows = names.map((name) => {
    const property = properties[name];
    const description = property.description ? mdEscape(property.description) : '';
    return `| \`${name}\` | ${describeType(property)} | ${required.has(name) ? 'yes' : 'no'} | ${description} |`;
  });
  return ['| Parameter | Type | Required | Notes |', '| --- | --- | --- | --- |', ...rows].join(
    '\n',
  );
}

function toolPage(tool, permissions) {
  const permission = permissions.get(tool.name);
  if (!permission) {
    throw new Error(
      `Tool "${tool.name}" has no entry in TOOL_PERMISSIONS (${DISPATCH_FILE}). The docs refuse to guess — update the dispatcher or the generator.`,
    );
  }
  const schema = toolInput[tool.name];
  const jsonSchema = schema ? zodToJson(schema) : undefined;

  const lines = [
    '---',
    `title: ${JSON.stringify(tool.name)}`,
    `description: ${JSON.stringify(tool.description)}`,
    '---',
    '',
    '{/* Generated by apps/docs/scripts/generate-mcp-pages.mjs — do not edit by hand. */}',
    '',
    `${mdEscape(tool.description)}`,
    '',
    '| | |',
    '| --- | --- |',
    `| Required permission | \`${permission}\` |`,
    `| Capability ID | \`${tool.capability}\` |`,
    `| Destructive | ${tool.destructive ? 'Yes — irreversible; agents should confirm before calling' : 'No'} |`,
    '',
    '## Parameters',
    '',
    paramsTable(jsonSchema),
  ];

  if (jsonSchema) {
    lines.push(
      '',
      '## Input schema (JSON Schema)',
      '',
      '```json',
      JSON.stringify(jsonSchema, null, 2),
      '```',
    );
  }

  lines.push(
    '',
    '## Access control',
    '',
    `A call succeeds only when the personal access token's scopes **and** the holder's role both allow \`${permission}\` (effective permission = scope ∩ role, default-deny). The tool runs inside the token owner's organization — tenancy is never a parameter.`,
    '',
  );

  return lines.join('\n');
}

function indexPage(tools, permissions) {
  const rows = tools.map((tool) => {
    const marker = tool.destructive ? ' ⚠' : '';
    return `| [\`${tool.name}\`](./${tool.name}) | \`${permissions.get(tool.name)}\` | ${mdEscape(tool.description)}${marker} |`;
  });
  return [
    '---',
    'title: MCP tools',
    `description: Every tool the RyTask MCP server exposes — all ${tools.length} of them, generated from the live registry.`,
    '---',
    '',
    '{/* Generated by apps/docs/scripts/generate-mcp-pages.mjs — do not edit by hand. */}',
    '',
    `RyTask ships an MCP server with **100% workspace control**: every service capability has a tool, enforced by an automated parity gate in CI. There are currently **${tools.length} tools**. Each page below is generated from the same registry the server boots from, so the docs cannot drift from the code.`,
    '',
    'Tools marked ⚠ are destructive — they do something irreversible, and well-behaved agents should ask before calling them.',
    '',
    '| Tool | Permission | What it does |',
    '| --- | --- | --- |',
    ...rows,
    '',
    'To connect an agent, see [Connect an AI agent over MCP](/docs/guides/mcp/connect).',
    '',
  ].join('\n');
}

async function main() {
  const permissions = await readToolPermissions();
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  for (const tool of mcpTools) {
    await writeFile(path.join(OUT_DIR, `${tool.name}.mdx`), toolPage(tool, permissions));
  }
  await writeFile(path.join(OUT_DIR, 'index.mdx'), indexPage(mcpTools, permissions));
  await writeFile(
    path.join(OUT_DIR, 'meta.json'),
    '{\n  "title": "MCP tools",\n  "pages": ["index", "..."]\n}\n',
  );

  console.log(`Generated ${mcpTools.length} MCP tool pages in ${path.relative(APP_ROOT, OUT_DIR)}`);
}

await main();
