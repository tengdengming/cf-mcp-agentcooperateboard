# SPEC — Multi-Agent Coordination MCP

## Status

Draft / MVP

## Goal

构建一个基于 Cloudflare Workers + Durable Objects 的 MCP 服务，使单个 Project 中少量独立 Agent 能在唯一 Orchestrator 的组织下协作。

## Actors

### Orchestrator

唯一任务编排者。

### Worker Agent

任务执行者。

## Functional Requirements

### FR-001 Agent Registration
系统必须允许 Agent 注册到指定 Project。

### FR-002 Heartbeat
Agent 必须能够更新自身 last_seen 和运行状态。

### FR-003 Task Creation
只有 Orchestrator 可以创建 Task。

### FR-004 Task Assignment
只有 Orchestrator 可以分配 Task。

### FR-005 Assignment Query
Worker Agent 可以获取自己的当前 Assignment。

### FR-006 Task Context
Agent 可以读取其有权限访问的 Task 上下文。

### FR-007 Progress Reporting
Worker Agent 可以汇报 progress 和 message。

### FR-008 Blocker Reporting
Worker Agent 可以报告 blocker。

### FR-009 Submission
Worker Agent 可以提交工作成果，但不能直接完成 Task。

### FR-010 Submission Review
只有 Orchestrator 可以 approve / reject Submission。

### FR-011 Task Completion
只有 Orchestrator 可以将 Task 设置为 completed。

### FR-012 Dependency
Orchestrator 可以建立和移除 Task dependency。

### FR-013 Event Trace
关键业务动作必须生成 Event。

### FR-014 Version Check
关键更新必须支持 expected_version。

## Non-Functional Requirements

### NFR-001
单 Project 支持少于 10 个 Agent。

### NFR-002
ProjectDO 是 Project 状态唯一权威源。

### NFR-003
第一版不得依赖 Redis、Kafka、Temporal、D1。

### NFR-004
领域层必须与 Cloudflare API 解耦。

### NFR-005
所有权限与状态转换必须具备自动化测试。

## Out of Scope

- Multi-Orchestrator
- 跨 Project Workflow
- 自动调度优化
- 高级 DAG Scheduler
- WebSocket Push
- 长期 Agent Memory
- Artifact Repository
