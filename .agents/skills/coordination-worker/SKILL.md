---
name: coordination-worker
description: Execute an assigned task through this project's Coordination MCP as a Worker Agent. Use when checking assignments, reporting progress or blockers, and submitting a result for Orchestrator review. Do not use for task creation, assignment, or approval.
---

# Coordination Worker

Use the MCP server configured as `coordination`. Use the `project_id` supplied by the Orchestrator and your own stable `agent_id`. Call `agent_register` with `role=worker` once; send `agent_heartbeat` when active.

Call `task_get_assignment` to discover unfinished tasks assigned to your ID. If it returns `[]`, report that no assignment is available; this MVP does not push notifications or run an autonomous polling process. For a task, call `task_get` and use its current `version`.

When starting, call `task_report(kind=working, expected_version=...)`. During execution, use `task_report(kind=progress, progress=0..100, message=...)` with the latest returned version. Report a blocker with `kind=blocked`; when unblocked, report `kind=working` again. For substantial work, send a heartbeat while active.

When ready for review, call `submission_create` with a concise `summary`, optional external `result_ref`, and current Task version. This moves the Task to `submitted`, not `completed`. Wait for Orchestrator review; use `task_get` to read Submission status and feedback. If rejected, continue from the returned `working` Task and submit a revised result.

On `VERSION_CONFLICT`, call `task_get` and reassess before writing. After a network timeout, read the Task before retrying a write because the MVP has no idempotency key. Never create, assign, approve, or mark a Task complete yourself.
