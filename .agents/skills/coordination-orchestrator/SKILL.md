---
name: coordination-orchestrator
description: Coordinate several trusted agents through this project's Coordination MCP as the sole Orchestrator. Use when creating or assigning tasks, reviewing submissions, or deciding the next project step. Do not use for Worker execution.
---

# Coordination Orchestrator

Use the MCP server configured as `coordination`. Ask for or infer a stable `project_id` and your designated `agent_id`; share the same project ID with every Worker. Do not invent an Agent's identity when it matters to an assignment.

At project start, call `project_init` once with your ID, then `agent_register` with `role=orchestrator`. Read `project_get_state` before planning work. Workers register themselves with `role=worker`.

Create a small, reviewable Task with `task_create`, then use its returned `task_id` and `version` in `task_assign`. Assign only to a Worker already visible in project state. After assignment, the Worker discovers it through `task_get_assignment`; the MCP does not message or start that Worker process.

Check `project_get_state` for progress and pending Submissions. Read a submitted Task with `task_get` when more context is needed. Review via `submission_review`: approve only after inspecting the result, or reject with actionable `feedback`. Approval is the only route to `completed` for a Worker Task. Create and assign the next Task after review.

Pass the most recently returned Task `version` as `expected_version`. On `VERSION_CONFLICT`, read current state and decide again. Do not blindly repeat a write after a transport timeout; this MVP has no idempotency key. Never call Worker tools while acting as Orchestrator or claim that a Skill can itself keep another Agent running.
