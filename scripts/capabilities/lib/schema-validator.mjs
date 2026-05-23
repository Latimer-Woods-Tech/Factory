// @node-runtime — Pure-Node dependency-free JSON Schema validator
// Supports the subset used by capabilities/schema/*.schema.json:
// type, required, properties, additionalProperties: false, items, enum,
// pattern, minLength, minItems, minimum, maximum, uniqueItems, const, oneOf,
// $ref (sibling schemas only), and definitions.
//
// Returns an array of error strings. Empty array = valid.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';

const schemaCache = new Map();

export function loadSchema(schemaPath) {
  if (schemaCache.has(schemaPath)) return schemaCache.get(schemaPath);
  const data = JSON.parse(readFileSync(schemaPath, 'utf8'));
  data.__path = schemaPath;
  schemaCache.set(schemaPath, data);
  return data;
}

export function validate(value, schema, options = {}) {
  const ctx = {
    errors: [],
    root: schema,
    schemaDir: schema.__path ? dirname(schema.__path) : options.schemaDir,
  };
  walk(value, schema, '$', ctx);
  return ctx.errors;
}

function walk(value, schema, path, ctx) {
  if (schema.$ref) {
    schema = resolveRef(schema.$ref, ctx);
    if (!schema) {
      ctx.errors.push(`${path}: cannot resolve $ref`);
      return;
    }
  }

  if (schema.oneOf) {
    const branchErrors = [];
    let matched = 0;
    for (const branch of schema.oneOf) {
      const sub = { errors: [], root: ctx.root, schemaDir: ctx.schemaDir };
      walk(value, branch, path, sub);
      if (sub.errors.length === 0) matched += 1;
      else branchErrors.push(sub.errors);
    }
    if (matched !== 1) {
      ctx.errors.push(`${path}: oneOf matched ${matched} branches; expected 1`);
    }
    return;
  }

  if (schema.const !== undefined) {
    if (value !== schema.const) {
      ctx.errors.push(`${path}: expected const ${JSON.stringify(schema.const)} but got ${JSON.stringify(value)}`);
    }
    return;
  }

  if (schema.enum) {
    const ok = schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value));
    if (!ok) ctx.errors.push(`${path}: value not in enum (${schema.enum.join(', ')})`);
  }

  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length > 0) {
    const actual = typeOf(value);
    if (!types.includes(actual)) {
      ctx.errors.push(`${path}: expected type ${types.join('|')} but got ${actual}`);
      return;
    }
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      ctx.errors.push(`${path}: string length ${value.length} below minLength ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      ctx.errors.push(`${path}: value "${value}" does not match pattern ${schema.pattern}`);
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      ctx.errors.push(`${path}: ${value} below minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      ctx.errors.push(`${path}: ${value} above maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      ctx.errors.push(`${path}: array length ${value.length} below minItems ${schema.minItems}`);
    }
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) {
          ctx.errors.push(`${path}: duplicate item ${key}`);
          break;
        }
        seen.add(key);
      }
    }
    if (schema.items) {
      for (let i = 0; i < value.length; i += 1) {
        walk(value[i], schema.items, `${path}[${i}]`, ctx);
      }
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value)) {
          ctx.errors.push(`${path}: missing required property "${key}"`);
        }
      }
    }
    if (schema.properties) {
      for (const [key, subschema] of Object.entries(schema.properties)) {
        if (key in value) {
          walk(value[key], subschema, `${path}.${key}`, ctx);
        }
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          ctx.errors.push(`${path}: unexpected property "${key}"`);
        }
      }
    }
  }
}

function resolveRef(ref, ctx) {
  if (ref.startsWith('#/')) {
    let cursor = ctx.root;
    for (const seg of ref.slice(2).split('/')) {
      cursor = cursor?.[seg];
    }
    return cursor;
  }
  if (ctx.schemaDir) {
    const path = join(ctx.schemaDir, ref);
    return loadSchema(path);
  }
  return null;
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'number' && Number.isInteger(value)) return 'integer';
  return t;
}
