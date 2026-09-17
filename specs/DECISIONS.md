# DECISIONS

## ADR-001 — One Project = One Durable Object

**Status:** Accepted

每个 Project 使用一个 ProjectDurableObject 管理项目内即时协作状态。

原因：

- Agent 数量小
- 状态天然属于同一协作空间
- 需要单一权威状态源
- Durable Object 与 project-level coordination atom 高度匹配

---

## ADR-002 — Single Orchestrator

**Status:** Accepted

每个 Project 仅允许一个 Orchestrator 修改任务权威生命周期状态。

Worker Agent 只执行、汇报、提交。

---

## ADR-003 — Submission Before Completion

**Status:** Accepted

Worker 完成任务后创建 Submission。

只有 Orchestrator approve 后才能正式完成 Task。

---

## ADR-004 — SQLite-backed Durable Object Storage

**Status:** Accepted

MVP 使用 DO SQLite 存储。

暂不引入 Redis、D1、Kafka、NATS、Temporal。

---

## ADR-005 — No WebSocket in MVP

**Status:** Accepted

第一版使用 HTTP/MCP + heartbeat。

只有明确出现实时 Push 需求后再加入 Hibernation WebSocket。

---

## ADR-006 — Event Log Is Audit, Not State

**Status:** Accepted

当前状态来源是领域表。

Event 仅用于审计、追踪和回放。
