import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { DomainError } from './domain';
import { ProjectDO, type Env } from './project-do';

const id = z.string().trim().min(1);
const project = { project_id: id };
const caller = { ...project, agent_id: id };
const version = z.number().int().positive();

function result(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}
function failure(error: unknown) {
  const remote = error as { code?: unknown; message?: unknown; currentVersion?: unknown } | null;
  const domain = error instanceof DomainError || (typeof remote?.code === 'string' && typeof remote.message === 'string')
    ? remote as { code: string; message: string; currentVersion?: number }
    : new DomainError('INTERNAL_ERROR', 'Operation failed');
  return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ code: domain.code, message: domain.message, current_version: domain.currentVersion }) }] };
}
async function call<T>(run: () => Promise<T>) {
  try { return result(await run()); } catch (error) { return failure(error); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/health') return new Response('ok');
    if (path !== '/mcp') return new Response('Not found', { status: 404 });

    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: 'agent-coordination', version: '0.1.0' });
      const stub = (projectId: string) => env.PROJECTS.get(env.PROJECTS.idFromName(projectId));

      server.registerTool('project_init', { description: 'Initialize one project and designate its orchestrator', inputSchema: z.object(caller) },
        ({ project_id, agent_id }) => call(() => stub(project_id).init(project_id, agent_id)));
      server.registerTool('agent_register', { description: 'Register an orchestrator or worker in a project', inputSchema: z.object({ ...caller, role: z.enum(['orchestrator', 'worker']) }) },
        ({ project_id, agent_id, role }) => call(() => stub(project_id).register(project_id, agent_id, role)));
      server.registerTool('agent_heartbeat', { description: 'Report this agent runtime state', inputSchema: z.object({ ...caller, status: z.enum(['idle', 'working', 'waiting', 'blocked', 'error']), current_task_id: id.optional() }) },
        ({ project_id, agent_id, status, current_task_id }) => call(() => stub(project_id).heartbeat(project_id, agent_id, status, current_task_id)));
      server.registerTool('project_get_state', { description: 'Read current project coordination state', inputSchema: z.object(caller) },
        ({ project_id, agent_id }) => call(() => stub(project_id).state(project_id, agent_id)));
      server.registerTool('task_create', { description: 'Create a pending task', inputSchema: z.object({ ...caller, title: id, description: z.string().optional() }) },
        ({ project_id, agent_id, title, description }) => call(() => stub(project_id).createTask(project_id, agent_id, title, description)));
      server.registerTool('task_assign', { description: 'Assign a pending task to a worker', inputSchema: z.object({ ...caller, task_id: id, assignee_agent_id: id, expected_version: version }) },
        ({ project_id, agent_id, task_id, assignee_agent_id, expected_version }) => call(() => stub(project_id).assign(project_id, agent_id, task_id, assignee_agent_id, expected_version)));
      server.registerTool('task_get_assignment', { description: 'List this worker’s current unfinished assignments', inputSchema: z.object(caller) },
        ({ project_id, agent_id }) => call(() => stub(project_id).getAssignments(project_id, agent_id)));
      server.registerTool('task_get', { description: 'Read an assigned task and its submissions', inputSchema: z.object({ ...caller, task_id: id }) },
        ({ project_id, agent_id, task_id }) => call(() => stub(project_id).getTask(project_id, agent_id, task_id)));
      server.registerTool('task_report', { description: 'Report working, progress, or a blocker', inputSchema: z.object({ ...caller, task_id: id, kind: z.enum(['working', 'progress', 'blocked']), expected_version: version, progress: z.number().int().min(0).max(100).optional(), message: z.string().optional() }) },
        ({ project_id, agent_id, task_id, kind, expected_version, progress, message }) => call(() => stub(project_id).report(project_id, agent_id, task_id, kind, expected_version, progress, message)));
      server.registerTool('submission_create', { description: 'Submit work for orchestrator review', inputSchema: z.object({ ...caller, task_id: id, summary: id, result_ref: z.string().optional(), expected_version: version }) },
        ({ project_id, agent_id, task_id, summary, result_ref, expected_version }) => call(() => stub(project_id).submit(project_id, agent_id, task_id, summary, expected_version, result_ref)));
      server.registerTool('submission_review', { description: 'Approve or reject a submitted result', inputSchema: z.object({ ...caller, submission_id: id, decision: z.enum(['approve', 'reject']), feedback: z.string().optional(), expected_version: version }) },
        ({ project_id, agent_id, submission_id, decision, feedback, expected_version }) => call(() => stub(project_id).review(project_id, agent_id, submission_id, decision, expected_version, feedback)));
      return server;
    });
    return handler.fetch(request);
  }
};

export { ProjectDO };
