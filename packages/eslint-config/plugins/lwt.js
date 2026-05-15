const isHonoApp = (node) =>
  node?.init?.type === 'NewExpression' && node.init.callee?.name === 'Hono';

const isRequestIdArg = (arg) => {
  if (arg.type === 'CallExpression') {
    const name =
      arg.callee?.type === 'Identifier'
        ? arg.callee.name
        : arg.callee?.type === 'MemberExpression'
          ? arg.callee.property?.name
          : '';
    return /requestId|request-id/i.test(name ?? '');
  }
  if (arg.type === 'Identifier') {
    return /requestId|request-id/i.test(arg.name ?? '');
  }
  return false;
};

const BUILTIN_ERRORS = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
]);

const meta = (description) => ({ type: 'problem', docs: { description }, schema: [] });

const STRIPE_PRICE_RE = /price_[A-Za-z0-9]{6,}/;

const rules = {
  'no-console': {
    meta: meta('Disallow console.* — use @latimer-woods-tech/logger.'),
    create(ctx) {
      return {
        MemberExpression(node) {
          // console.log, console.warn, etc.
          if (node.object.type === 'Identifier' && node.object.name === 'console') {
            ctx.report({ node, message: 'Use @latimer-woods-tech/logger instead of console.*.' });
            return;
          }
          // globalThis.console.log, etc.
          if (
            node.object.type === 'MemberExpression' &&
            node.object.object.type === 'Identifier' &&
            node.object.object.name === 'globalThis' &&
            node.object.property.type === 'Identifier' &&
            node.object.property.name === 'console'
          ) {
            ctx.report({ node, message: 'Use @latimer-woods-tech/logger instead of console.*.' });
          }
        },
      };
    },
  },

  'no-raw-error-throw': {
    meta: meta('Disallow throwing built-in errors — use @latimer-woods-tech/errors.'),
    create(ctx) {
      return {
        ThrowStatement(node) {
          const arg = node.argument;
          const isNew = arg?.type === 'NewExpression';
          const isCall = arg?.type === 'CallExpression';
          if (
            (isNew || isCall) &&
            arg.callee?.type === 'Identifier' &&
            BUILTIN_ERRORS.has(arg.callee.name)
          ) {
            ctx.report({
              node,
              message: 'Throw typed errors from @latimer-woods-tech/errors, not raw Error.',
            });
          }
        },
      };
    },
  },

  'idempotent-webhooks': {
    meta: meta('Webhook routes must wrap handlers with withIdempotency().'),
    create(ctx) {
      return {
        CallExpression(node) {
          const callee = node.callee;
          if (
            callee?.type !== 'MemberExpression' ||
            !['post', 'put'].includes(callee.property?.name)
          ) return;
          const firstArg = node.arguments[0];
          const path = firstArg?.type === 'Literal' ? String(firstArg.value) : '';
          if (!/webhook|hook/i.test(path)) return;
          const hasIdempotency = node.arguments.slice(1).some(
            (a) =>
              a.type === 'CallExpression' &&
              a.callee?.type === 'Identifier' &&
              a.callee.name === 'withIdempotency',
          );
          if (!hasIdempotency) {
            ctx.report({ node, message: 'Webhook handler missing withIdempotency() wrapper.' });
          }
        },
      };
    },
  },

  'require-request-id': {
    meta: meta('Hono apps must register request-id middleware.'),
    create(ctx) {
      let honoVarName = null;
      let foundRequestId = false;
      let honoNode = null;
      return {
        VariableDeclarator(node) {
          if (isHonoApp(node)) {
            honoVarName = node.id?.name ?? null;
            honoNode = node;
          }
        },
        CallExpression(node) {
          const c = node.callee;
          if (
            c?.type === 'MemberExpression' &&
            c.property?.name === 'use' &&
            c.object?.type === 'Identifier' &&
            c.object.name === honoVarName &&
            node.arguments.some(isRequestIdArg)
          ) {
            foundRequestId = true;
          }
        },
        'Program:exit'() {
          if (honoNode && !foundRequestId) {
            ctx.report({
              node: honoNode,
              message: 'Hono app is missing request-id middleware (app.use(requestId())).',
            });
          }
        },
      };
    },
  },

  'no-hardcoded-stripe-price': {
    meta: meta('Disallow hardcoded Stripe price_* identifiers — read from config/env binding.'),
    create(ctx) {
      return {
        Literal(node) {
          if (typeof node.value === 'string' && STRIPE_PRICE_RE.test(node.value)) {
            ctx.report({
              node,
              message: 'Hardcoded Stripe price ID. Inject via env / config instead.',
            });
          }
        },
        TemplateLiteral(node) {
          if (node.quasis.some((q) => STRIPE_PRICE_RE.test(q.value.raw))) {
            ctx.report({
              node,
              message: 'Hardcoded Stripe price ID. Inject via env / config instead.',
            });
          }
        },
      };
    },
  },
};

export default { rules };
