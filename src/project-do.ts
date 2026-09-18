import { DurableObject } from 'cloudflare:workers';
import { DomainError, nextStatus, requireAssignee, requireRole, requireVersion, type AgentRole, type ReportKind, type TaskStatus } from './domain';

type Db = DurableObjectStorage['sql'];
type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const one = <T extends Row>(db: Db, query: string, ...args: (string | number)[]): T | undefined => db.exec(query, ...args).toArray()[0] as T | undefined;
const all = <T extends Row>(db: Db, query: string, ...args: (string | number)[]): T[] => db.exec(query, ...args).toArray() as T[];

interface Task extends Row { task_id: string; status: TaskStatus; assigned_agent_id: string | null; version: number; }
interface Agent extends Row { agent_id: string; role: AgentRole; }
interface Submission extends Row { submission_id: string; task_id: string; status: string; }
export interface Env { PROJECTS: DurableObjectNamespace<ProjectDO>; }

export class ProjectDO extends DurableObject<Env> {
  private db: Db;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = ctx.storage.sql;
    this.db.exec(`CREATE TABLE IF NOT EXISTS project (project_id TEXT PRIMARY KEY, orchestrator_agent_id TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS agents (agent_id TEXT PRIMARY KEY, role TEXT NOT NULL, status TEXT NOT NULL, current_task_id TEXT, last_seen TEXT NOT NULL, version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (task_id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, assigned_agent_id TEXT, progress INTEGER NOT NULL DEFAULT 0, message TEXT, version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS submissions (submission_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT NOT NULL, status TEXT NOT NULL, summary TEXT NOT NULL, result_ref TEXT, feedback TEXT, created_at TEXT NOT NULL, reviewed_at TEXT);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, entity_id TEXT NOT NULL, actor_agent_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);`);
  }

  private project(projectId: string) {
    const project = one<{ project_id: string; orchestrator_agent_id: string }>(this.db, 'SELECT * FROM project LIMIT 1');
    if (!project || project.project_id !== projectId) throw new DomainError('NOT_FOUND', 'Project not found');
    return project;
  }
  private agent(id: string): Agent {
    const agent = one<Agent>(this.db, 'SELECT * FROM agents WHERE agent_id=?', id);
    if (!agent) throw new DomainError('NOT_FOUND', 'Agent not registered');
    return agent;
  }
  private orchestrator(id: string) { requireRole(this.agent(id).role, 'orchestrator'); }
  private task(id: string): Task {
    const task = one<Task>(this.db, 'SELECT * FROM tasks WHERE task_id=?', id);
    if (!task) throw new DomainError('NOT_FOUND', 'Task not found');
    return task;
  }
  private event(type: string, entityId: string, actor: string, payload: unknown) {
    this.db.exec('INSERT INTO events (type,entity_id,actor_agent_id,payload,created_at) VALUES (?,?,?,?,?)', type, entityId, actor, JSON.stringify(payload), now());
  }

  async init(projectId: string, orchestratorId: string) {
    return this.ctx.storage.transaction(async () => {
      const current = one<{ project_id: string; orchestrator_agent_id: string }>(this.db, 'SELECT * FROM project LIMIT 1');
      if (current) {
        if (current.project_id !== projectId || current.orchestrator_agent_id !== orchestratorId) throw new DomainError('ALREADY_EXISTS', 'Project already initialized');
        return current;
      }
      this.db.exec('INSERT INTO project VALUES (?,?,?)', projectId, orchestratorId, now());
      this.event('project.initialized', projectId, orchestratorId, {});
      return this.project(projectId);
    });
  }

  async register(projectId: string, agentId: string, role: AgentRole) {
    return this.ctx.storage.transaction(async () => {
      const project = this.project(projectId);
      if ((role === 'orchestrator') !== (project.orchestrator_agent_id === agentId)) throw new DomainError('PERMISSION_DENIED', 'Project has one designated orchestrator');
      const existing = one<Agent>(this.db, 'SELECT * FROM agents WHERE agent_id=?', agentId);
      if (existing) {
        if (existing.role !== role) throw new DomainError('ALREADY_EXISTS', 'Agent role differs');
        return existing;
      }
      this.db.exec('INSERT INTO agents VALUES (?,?,?,?,?,?)', agentId, role, 'idle', null, now(), 1);
      this.event('agent.registered', agentId, agentId, { role });
      return this.agent(agentId);
    });
  }

  async heartbeat(projectId: string, agentId: string, status: string, currentTaskId?: string) {
    return this.ctx.storage.transaction(async () => {
      this.project(projectId); this.agent(agentId);
      if (!['idle', 'working', 'waiting', 'blocked', 'error'].includes(status)) throw new DomainError('VALIDATION_ERROR', 'Invalid agent status');
      if (currentTaskId) requireAssignee(this.task(currentTaskId).assigned_agent_id, agentId);
      this.db.exec('UPDATE agents SET status=?,current_task_id=?,last_seen=?,version=version+1 WHERE agent_id=?', status, currentTaskId ?? null, now(), agentId);
      this.event('agent.heartbeat', agentId, agentId, { status, currentTaskId });
      return this.agent(agentId);
    });
  }

  async state(projectId: string, agentId: string) {
    this.project(projectId); this.orchestrator(agentId);
    return {
      agents: all(this.db, 'SELECT * FROM agents ORDER BY agent_id'),
      tasks: all(this.db, 'SELECT * FROM tasks ORDER BY created_at'),
      submissions: all(this.db, 'SELECT * FROM submissions ORDER BY created_at'),
      events: all(this.db, 'SELECT * FROM events ORDER BY seq DESC LIMIT 100').reverse()
    };
  }

  async createTask(projectId: string, agentId: string, title: string, description = '') {
    return this.ctx.storage.transaction(async () => {
      this.project(projectId); this.orchestrator(agentId);
      const id = crypto.randomUUID(), time = now();
      this.db.exec('INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?)', id, title, description, 'pending', null, 0, null, 1, time, time);
      this.event('task.created', id, agentId, { title });
      return this.task(id);
    });
  }

  async assign(projectId: string, agentId: string, taskId: string, assigneeId: string, expectedVersion: number) {
    return this.ctx.storage.transaction(async () => {
      this.project(projectId); this.orchestrator(agentId);
      requireRole(this.agent(assigneeId).role, 'worker');
      const task = this.task(taskId); requireVersion(task.version, expectedVersion);
      nextStatus(task.status, 'assign');
      this.db.exec('UPDATE tasks SET status=?,assigned_agent_id=?,version=version+1,updated_at=? WHERE task_id=?', 'assigned', assigneeId, now(), taskId);
      this.event('task.assigned', taskId, agentId, { assigneeId });
      return this.task(taskId);
    });
  }

  async getTask(projectId: string, agentId: string, taskId: string) {
    this.project(projectId);
    const agent = this.agent(agentId), task = this.task(taskId);
    if (agent.role !== 'orchestrator') requireAssignee(task.assigned_agent_id, agentId);
    return { task, submissions: all(this.db, 'SELECT * FROM submissions WHERE task_id=? ORDER BY created_at', taskId) };
  }

  async getAssignments(projectId: string, agentId: string) {
    this.project(projectId); requireRole(this.agent(agentId).role, 'worker');
    return all<Task>(this.db, "SELECT * FROM tasks WHERE assigned_agent_id=? AND status IN ('assigned','working','blocked','submitted') ORDER BY created_at", agentId);
  }

  async report(projectId: string, agentId: string, taskId: string, kind: ReportKind, expectedVersion: number, progress?: number, message?: string) {
    return this.ctx.storage.transaction(async () => {
      this.project(projectId); requireRole(this.agent(agentId).role, 'worker');
      const task = this.task(taskId); requireAssignee(task.assigned_agent_id, agentId); requireVersion(task.version, expectedVersion);
      const status = nextStatus(task.status, kind);
      if (progress !== undefined && (!Number.isInteger(progress) || progress < 0 || progress > 100)) throw new DomainError('VALIDATION_ERROR', 'Progress must be 0-100');
      this.db.exec('UPDATE tasks SET status=?,progress=?,message=?,version=version+1,updated_at=? WHERE task_id=?', status, progress ?? task.progress, message ?? task.message ?? null, now(), taskId);
      this.event('task.reported', taskId, agentId, { kind, progress, message });
      return this.task(taskId);
    });
  }

  async submit(projectId: string, agentId: string, taskId: string, summary: string, expectedVersion: number, resultRef?: string) {
    return this.ctx.storage.transaction(async () => {
      this.project(projectId); requireRole(this.agent(agentId).role, 'worker');
      const task = this.task(taskId); requireAssignee(task.assigned_agent_id, agentId); requireVersion(task.version, expectedVersion);
      nextStatus(task.status, 'submit');
      if (one(this.db, "SELECT submission_id FROM submissions WHERE task_id=? AND status='pending'", taskId)) throw new DomainError('INVALID_TRANSITION', 'Submission pending review');
      const id = crypto.randomUUID();
      this.db.exec('INSERT INTO submissions VALUES (?,?,?,?,?,?,?,?,?)', id, taskId, agentId, 'pending', summary, resultRef ?? null, null, now(), null);
      this.db.exec('UPDATE tasks SET status=?,version=version+1,updated_at=? WHERE task_id=?', 'submitted', now(), taskId);
      this.event('submission.created', id, agentId, { taskId });
      return { submission: one(this.db, 'SELECT * FROM submissions WHERE submission_id=?', id), task: this.task(taskId) };
    });
  }

  async review(projectId: string, agentId: string, submissionId: string, decision: 'approve' | 'reject', expectedVersion: number, feedback?: string) {
    return this.ctx.storage.transaction(async () => {
      this.project(projectId); this.orchestrator(agentId);
      const submission = one<Submission>(this.db, 'SELECT * FROM submissions WHERE submission_id=?', submissionId);
      if (!submission) throw new DomainError('NOT_FOUND', 'Submission not found');
      if (submission.status !== 'pending') throw new DomainError('INVALID_TRANSITION', 'Submission already reviewed');
      const task = this.task(submission.task_id); requireVersion(task.version, expectedVersion);
      const status = nextStatus(task.status, decision);
      if (decision === 'reject' && !feedback?.trim()) throw new DomainError('VALIDATION_ERROR', 'Rejection feedback required');
      this.db.exec('UPDATE submissions SET status=?,feedback=?,reviewed_at=? WHERE submission_id=?', decision === 'approve' ? 'approved' : 'rejected', feedback ?? null, now(), submissionId);
      this.db.exec('UPDATE tasks SET status=?,version=version+1,updated_at=? WHERE task_id=?', status, now(), task.task_id);
      this.event(`submission.${decision === 'approve' ? 'approved' : 'rejected'}`, submissionId, agentId, { taskId: task.task_id, feedback });
      return { submission: one(this.db, 'SELECT * FROM submissions WHERE submission_id=?', submissionId), task: this.task(task.task_id) };
    });
  }
}
