# SPEC — Multi-Agent Coordination MCP

## Status

Draft / MVP

## Goal

构建一个基于 Cloudflare Workers + Durable Objects 的 MCP 服务，使单个 Project 中少量独立 Agent 能在唯一 Orchestrator 的组织下协作。

Agent 可以运行在不同机器和 Harness 中；协作通过 MCP 语义接口进行，不要求共享进程或底层存储。MVP 只管理项目内的即时协作状态，不管理长期知识或代码产物。

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

### FR-015 Project State
系统必须支持创建 Project，并让 Orchestrator 查询项目内的 Agent、Task、Submission 和依赖状态。一个 Project 对应一个 ProjectDO；该对象负责最终权限校验、状态更新、版本递增和 Event 记录。

### FR-016 Agent Context
Agent 必须能读取自身运行状态、当前任务及其进度和 version、任务相关 Agent、依赖任务及其状态、当前阻塞。Worker 仅能读取有权限访问的上下文，不暴露底层存储结构。

### FR-017 Task Lifecycle
MVP Task 状态为 pending、assigned、working、submitted、completed、blocked、failed、cancelled。状态变化必须符合领域状态机并增加 Task version。Worker 的进度和阻塞是事实汇报，不构成任意修改权威生命周期的权限；Orchestrator 决定正式状态和后续流转。

### FR-018 Submission Flow
被分配的 Worker 提交包含成果摘要（可附结果引用）的 Submission 后，ProjectDO 按领域规则使 Task 进入 submitted，等待 Orchestrator 审核。Submission 状态为 pending、approved、rejected；只有 Orchestrator 能审核。approve 后 Task 才能 completed；reject 后 Worker 应能读取审核反馈并继续执行。

### FR-019 Presence
Agent 的运行状态包括 idle、working、waiting、blocked、offline、error。heartbeat 更新自身 last_seen、运行状态及可选的当前任务、进度和消息；读取时另根据 last_seen 和可配置阈值计算在线、可疑、离线判定，不把推断结果当成 Agent 主动上报。MVP 不依赖定时 Alarm 扫描。建议发送间隔为 10~15 秒，判定阈值分别为 30 秒和 90 秒。

### FR-020 Task Relationships
Task 可以记录 owner、assignee、parent 及 dependency；Orchestrator 管理分配和依赖。未完成的前置任务不应被 Orchestrator 视为满足执行条件。MVP 不要求自动 DAG 调度或自动能力匹配。

### FR-021 Access Control
MVP 角色仅为 orchestrator 和 worker。Worker 只能读取授权任务、更新自身运行状态、汇报和提交；不能创建、分配、重开、取消或完成 Task，也不能管理依赖或审核 Submission。所有操作由 ProjectDO 根据调用身份再次校验，不能仅依赖 Prompt、Skill 或 MCP 入口。

### FR-022 Event History
关键状态变化必须写入可查询的 Event，记录动作类型、实体、操作者、时间和相关数据，使 MVP 协作链路可追踪。当前状态从领域数据读取，Event 不作为当前状态源。

### FR-023 Collaboration API
Worker 工具覆盖注册、heartbeat、上下文和分配查询、进度与阻塞汇报、Submission 创建与查询；Orchestrator 工具覆盖项目状态、Agent 查询、Task 创建/分配/更新/依赖/重开/完成/取消、Submission 列表与审核。MCP 仅暴露协作语义，不暴露 SQL、Storage 或内部 RPC。

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

### NFR-006
Worker 作为无状态 HTTP/MCP 入口，负责鉴权、身份与 Project 解析、参数校验、路由、统一错误映射和请求追踪；内部优先通过 Typed RPC 调用 ProjectDO。

### NFR-007
MVP 使用 SQLite-backed Durable Object Storage 和 HTTP/MCP + heartbeat；不引入外部协调服务、分布式锁或 WebSocket Push。

### NFR-008
Task 与 Agent 保留 version。携带过期 expected_version 的关键更新必须返回 VERSION_CONFLICT，调用方重新读取上下文后再决定动作。

## MVP Acceptance

完整链路：创建 Project，注册 Orchestrator 与 Worker，创建并分配 Task，Worker 获取 Assignment 和 Task Context、发送 heartbeat、汇报进度、创建 Submission，Task 进入 submitted，Orchestrator 查询并 approve，Task 进入 completed，Event 可还原关键过程。

必须验证：Worker 直接完成 Task 或修改其他 Agent 状态返回 PERMISSION_DENIED；Worker 无法审核自己的 Submission；过期 expected_version 返回 VERSION_CONFLICT；拒绝 Submission 后可读取反馈并继续执行。

## Out of Scope

- Multi-Orchestrator
- 跨 Project Workflow
- 自动调度优化
- 高级 DAG Scheduler
- WebSocket Push
- 长期 Agent Memory
- Artifact Repository
- Leader Election、Redis/Queue、分布式锁和自动任务抢占
- 自动 capability matching、高级 RBAC、BI 与全局搜索
- 高频 Alarm 在线扫描
