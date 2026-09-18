import { describe, expect, it } from 'vitest';
import { nextStatus, requireAssignee, requireRole, requireVersion } from '../src/domain';

describe('single orchestrator task rules', () => {
  it('permits the submission and review path', () => {
    expect(nextStatus('pending', 'assign')).toBe('assigned');
    expect(nextStatus('assigned', 'working')).toBe('working');
    expect(nextStatus('working', 'submit')).toBe('submitted');
    expect(nextStatus('submitted', 'approve')).toBe('completed');
    expect(nextStatus('submitted', 'reject')).toBe('working');
  });
  it('rejects worker authority and stale context', () => {
    expect(() => requireRole('worker', 'orchestrator')).toThrow();
    expect(() => requireAssignee('agent-a', 'agent-b')).toThrow();
    expect(() => requireVersion(3, 2)).toThrow();
    expect(() => nextStatus('completed', 'working')).toThrow();
  });
});
