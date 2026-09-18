export type TaskStatus = 'pending' | 'assigned' | 'working' | 'blocked' | 'submitted' | 'completed';
export type AgentRole = 'orchestrator' | 'worker';
export type ReportKind = 'working' | 'progress' | 'blocked';

export class DomainError extends Error {
  constructor(public code: string, message: string, public currentVersion?: number) {
    super(message);
    this.name = 'DomainError';
  }
}

export function requireVersion(actual: number, expected: number): void {
  if (actual !== expected) throw new DomainError('VERSION_CONFLICT', 'Task version is stale', actual);
}

export function nextStatus(status: TaskStatus, action: 'assign' | ReportKind | 'submit' | 'approve' | 'reject'): TaskStatus {
  const table: Record<string, Partial<Record<string, TaskStatus>>> = {
    pending: { assign: 'assigned' },
    assigned: { working: 'working', blocked: 'blocked', progress: 'assigned' },
    working: { working: 'working', progress: 'working', blocked: 'blocked', submit: 'submitted' },
    blocked: { working: 'working', progress: 'blocked' },
    submitted: { approve: 'completed', reject: 'working' }
  };
  const next = table[status]?.[action];
  if (!next) throw new DomainError('INVALID_TRANSITION', `${action} is not allowed from ${status}`);
  return next;
}

export function requireRole(role: AgentRole, expected: AgentRole): void {
  if (role !== expected) throw new DomainError('PERMISSION_DENIED', `${expected} role required`);
}

export function requireAssignee(assigned: string | null, caller: string): void {
  if (assigned !== caller) throw new DomainError('PERMISSION_DENIED', 'Current task assignee required');
}
