#!/usr/bin/env node

const url = "placeholder" || 'https://supervisor.latwoodtech.work/tools/read-only-smoke';
const token = "placeholder";
const allowedHosts = new Set(['supervisor.latwoodtech.work', 'factory-supervisor.adrper79.workers.dev']);
const greenPlanDescription = "placeholder" || '';
const expectedGreenTemplate = "placeholder" || '';
const required = [
  'supervisor.health.snapshot',
  'registry.capabilities.list',
  'template.list',
  'state.lastRun.read',
];

function fail(message, context = {}) {
  console.error(`[supervisor-readonly-smoke] ${message}`);
  if (Object.keys(context).length > 0) console.error(JSON.stringify(context, null, 2));
  process.exit(1);
}

async function fetchJson(targetUrl, options, label) {
  const response = await fetch(targetUrl, options);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    fail(`${label} response was not JSON`, { status: response.status, body: text.slice(0, 500) });
  }
  return { response, body };
}

if (!token) fail('SUPERVISOR_API_KEY is required');

const parsedUrl = new URL(url);
if (!allowedHosts.has(parsedUrl.hostname)) {
  fail('refusing to send supervisor API key to unapproved host', { host: parsedUrl.hostname });
}

const authHeaders = {
  accept: 'application/json',
  authorization: `Bearer ${token}`,
};

const { response, body } = await fetchJson(parsedUrl, { headers: authHeaders }, 'readonly smoke');
if (!response.ok || body.ok !== true) fail('readonly smoke endpoint failed', { status: response.status, body });
if (body.kind !== 'supervisor-readonly-smoke') fail('unexpected smoke kind', { kind: body.kind });
if (body.tools_invoked !== required.length) fail('unexpected invoked tool count', { tools_invoked: body.tools_invoked });

const invoked = new Map((body.invoked || []).map((tool) => [tool.name, tool]));
for (const name of required) {
  const tool = invoked.get(name);
  if (!tool) fail('required tool was not invoked', { name, invoked: [...invoked.keys()] });
  if (tool.side_effects !== 'none' || tool.ok !== true) fail('tool was not a successful readonly invocation', { tool });
}

const registeredNames = body.registered?.tool_names || [];
if (!registeredNames.includes('github.issue.searchApproved')) fail('read-external GitHub search tool is not registered', { registeredNames });
if ((body.write_capable_tools || []).length !== 0) fail('write-capable tools leaked into initial runtime surface', { write_capable_tools: body.write_capable_tools });
if ((body.registered?.tools_registered || 0) < 5) fail('too few tools registered', { registered: body.registered });

let greenPlan = null;
if (greenPlanDescription) {
  const planUrl = new URL('/plan', parsedUrl.origin);
  const plan = await fetchJson(planUrl, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      description: greenPlanDescription,
      source: 'smoke:green-template-dry-run',
    }),
  }, 'green plan dry-run');

  if (!plan.response.ok || plan.body.matched !== true) fail('green plan dry-run did not match a template', { status: plan.response.status, body: plan.body });
  if (expectedGreenTemplate && plan.body.template !== expectedGreenTemplate) fail('green plan matched the wrong template', { expectedGreenTemplate, actual: plan.body.template });
  if (plan.body.plan?.tier !== 'green') fail('green plan matched a non-green tier', { tier: plan.body.plan?.tier, template: plan.body.template });
  const sideEffectfulSteps = (plan.body.plan?.steps || []).filter((step) => step.side_effects !== 'none');
  if (sideEffectfulSteps.length > 0) fail('green plan dry-run produced side-effectful steps', { sideEffectfulSteps });
  greenPlan = {
    matched: true,
    template: plan.body.template,
    tier: plan.body.plan.tier,
    steps: plan.body.plan.steps.length,
  };
}

console.log(JSON.stringify({
  ok: true,
  url,
  tools_registered: body.registered.tools_registered,
  tools_invoked: body.tools_invoked,
  tool_side_effects: body.tool_side_effects,
  green_plan: greenPlan,
}, null, 2));
