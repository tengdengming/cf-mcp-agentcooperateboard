import assert from 'node:assert/strict';

const url = process.env.MCP_URL ?? 'http://127.0.0.1:8787/mcp';
let sequence = 0;
async function rpc(method, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++sequence, method, params })
  });
  const body = await response.text();
  const data = body.startsWith('event:') ? JSON.parse(body.match(/^data: (.+)$/m)?.[1] ?? '{}') : JSON.parse(body);
  assert.equal(response.status, 200, body);
  assert.ok(!data.error, body);
  return data.result;
}
async function tool(name, args) {
  const result = await rpc('tools/call', { name, arguments: args });
  const value = JSON.parse(result.content[0].text);
  if (result.isError) throw new Error(`${name}: ${JSON.stringify(value)}`);
  return value;
}
async function toolError(name, args, code) {
  const result = await rpc('tools/call', { name, arguments: args });
  assert.equal(result.isError, true, `${name} unexpectedly succeeded`);
  assert.equal(JSON.parse(result.content[0].text).code, code);
}

const project_id = `smoke-${crypto.randomUUID()}`;
const orchestrator = { project_id, agent_id: 'orchestrator' };
const worker = { project_id, agent_id: 'worker' };
const tools = await rpc('tools/list', {});
assert.equal(tools.tools.length, 11);
await tool('project_init', orchestrator);
await tool('agent_register', { ...orchestrator, role: 'orchestrator' });
await tool('agent_register', { ...worker, role: 'worker' });
const created = await tool('task_create', { ...orchestrator, title: 'Smoke task' });
await toolError('task_create', { ...worker, title: 'Forbidden' }, 'PERMISSION_DENIED');
const task_id = created.task_id;
let task = await tool('task_assign', { ...orchestrator, task_id, assignee_agent_id: 'worker', expected_version: created.version });
const assignments = await tool('task_get_assignment', worker);
assert.equal(assignments[0].task_id, task_id);
await toolError('task_report', { ...worker, task_id, kind: 'working', expected_version: created.version }, 'VERSION_CONFLICT');
task = await tool('task_report', { ...worker, task_id, kind: 'working', expected_version: task.version });
task = await tool('task_report', { ...worker, task_id, kind: 'progress', progress: 50, expected_version: task.version });
const submitted = await tool('submission_create', { ...worker, task_id, summary: 'Done', expected_version: task.version });
assert.equal(submitted.task.status, 'submitted');
const reviewed = await tool('submission_review', { ...orchestrator, submission_id: submitted.submission.submission_id, decision: 'approve', expected_version: submitted.task.version });
assert.equal(reviewed.task.status, 'completed');
await toolError('submission_create', { ...worker, task_id, summary: 'Again', expected_version: reviewed.task.version }, 'INVALID_TRANSITION');
const second = await tool('task_create', { ...orchestrator, title: 'Reject task' });
let secondTask = await tool('task_assign', { ...orchestrator, task_id: second.task_id, assignee_agent_id: 'worker', expected_version: second.version });
secondTask = await tool('task_report', { ...worker, task_id: second.task_id, kind: 'working', expected_version: secondTask.version });
const firstTry = await tool('submission_create', { ...worker, task_id: second.task_id, summary: 'First try', expected_version: secondTask.version });
const rejected = await tool('submission_review', { ...orchestrator, submission_id: firstTry.submission.submission_id, decision: 'reject', feedback: 'Revise', expected_version: firstTry.task.version });
assert.equal(rejected.task.status, 'working');
const retry = await tool('submission_create', { ...worker, task_id: second.task_id, summary: 'Revised', expected_version: rejected.task.version });
assert.equal(retry.task.status, 'submitted');
const state = await tool('project_get_state', orchestrator);
assert.ok(state.events.length >= 7);
console.log('MCP smoke passed:', project_id, 'events:', state.events.length);
