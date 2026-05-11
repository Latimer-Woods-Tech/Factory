const isHonoApp = (node) =>
  node?.init?.type === 'NewExpression' && node.init.callee?.name === 'Hono';

const meta = (description) => ({ type: 'problem', docs: { description }, schema: [] });

const rules = {
  'no-console': {
    meta: meta('Disallow console.* — use @latimer-woods-tech/logger.'),
    create(ctx) {
      return {
        MemberExpression(node) {
          if (node.object.type === 'Identifier' && node.object.name === 'console') {
            ctx.report({ node, message: 'Use @latimer-woods-tech/logger instead of console.*.' });
          }
        },
      };
    },
  },

  'no-raw-error-throw': {
    meta: meta('Disallow throw new Error(...) — use @latimer-woods-tech/errors.'),
    create(ctx) {
      return {
        ThrowStatement(node) {
          const arg = node.argument;
          if (
            arg?.type === 'NewExpression' &&
            arg.callee?.type === 'Identifier' &&
            arg.callee.name === 'Error'
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
          const src = ctx.sourceCode.getText(node);
          if (!/withIdempotency\s*\(/.test(src)) {
            ctx.report({ node, message: 'Webhook handler missing withIdempotency() wrapper.' });
          }
        },
      };
    },
  },

  'require-request-id': {
    meta: meta('Hono apps must register request-id middleware.'),
    create(ctx) {
      let foundHono = false;
      let foundRequestId = false;
      let honoNode = null;
      return {
        VariableDeclarator(node) {
          if (isHonoApp(node)) {
            foundHono = true;
            honoNode = node;
          }
        },
        CallExpression(node) {
          const c = node.callee;
          if (
            c?.type === 'MemberExpression' &&
            c.property?.name === 'use' &&
            /requestId|request-id/i.test(ctx.sourceCode.getText(node))
          ) {
            foundRequestId = true;
          }
        },
        'Program:exit'() {
          if (foundHono && !foundRequestId && honoNode) {
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
          if (typeof node.value === 'string' && /^price_[A-Za-z0-9]{6,}/.test(node.value)) {
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
