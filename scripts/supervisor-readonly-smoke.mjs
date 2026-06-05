#!/usr/bin/env node

const url = process.env.SUPERVISOR_READONLY_SMOKE_URL || 'https://supervisor.latwoodtech.work/tools/read-only-smoke';
const token = process.env.SUPERVISOR_API_KEY;
const allowedHosts = new Set(['supervisor.latwoodtech.work', 'factory-supervisor.adrper79.workers.dev']);
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

if (!token) fail('SUPERVISOR_API_KEY is required');

const parsedUrl = new URL(url);
if (!allowedHosts.has(parsedUrl.hostname)) {
  fail('refusing to send supervisor API key to unapproved host', { host: parsedUrl.hostname });
}

const response = await fetch(parsedUrl, {
  headers: {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
  },
});
const text = await response.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  fail('response was not JSON', { status: response.status, body: text.slice(0, 500) });
}

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

console.log(JSON.stringify({
  ok: true,
  url,
  tools_registered: body.registered.tools_registered,
  tools_invoked: body.tools_invoked,
  tool_side_effects: body.tool_side_effects,
}, null, 2));
