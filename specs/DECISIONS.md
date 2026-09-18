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

---

## ADR-007 — 凭据绑定身份与项目引导

**Status:** Accepted

MVP 的 `orchestrator` 和 `worker` 是项目内 Agent 角色，不是请求方可自行声明的权限。部署者通过受部署密钥保护的引导操作创建 Project、指定唯一 Orchestrator，并为各 Agent 配发绑定 `project_id`、`agent_id`、`role` 的独立不透明凭据。引导操作不作为普通 Agent MCP Tool，也不引入第三种 Agent 角色。

Cloudflare Worker 接收凭据并路由到 ProjectDO；ProjectDO 根据持久化的凭据摘要再次验证身份和角色。请求体中的 `agent_id` 或 `role` 不能覆盖认证结果。`agent_register` 只激活已授权的身份，不赋予新角色。凭据原文仅在配发时返回，存储和日志均不得包含原文。MVP 不实现自助注册、凭据轮换或外部身份服务。

原因：单 Orchestrator 和 Worker 权限不能依赖客户端自报，且引导过程必须能从空项目开始。

---

## ADR-008 — 受控提交转换与原子审核

**Status:** Accepted

Worker 不能调用通用 Task 状态修改接口。已分配 Worker 创建有效 Submission 时，ProjectDO 在同一事务中创建 `pending` Submission，并按照预先定义的领域规则将 Task 从 `working` 转为 `submitted`；这是提交命令的固定效果，不授予 Worker 任意修改生命周期的权限。

Orchestrator 的 `submission_review(approve)` 在同一事务中将 Submission 置为 `approved`、Task 置为 `completed`，并写入对应 Event。`submission_review(reject)` 在同一事务中记录反馈、将 Submission 置为 `rejected`、Task 恢复为 `working`。独立 `task_complete` 仅供没有 Worker Submission 的 Orchestrator 自有任务使用；有 Submission 的任务必须走审核，不能绕过审核直接完成。

原因：消除“批准之后是否还要另调完成接口”的歧义，并避免审核与 Task 状态分离。

---

## ADR-009 — MVP 最小工具与身份范围

**Status:** Accepted

第一版先验证可信 Agent 间的协作闭环。MCP 提供 `project_init`、`agent_register`、`agent_heartbeat`、`project_get_state`、`task_create`、`task_assign`、`task_get_assignment`、`task_get`、`task_report`、`submission_create`、`submission_review` 十一个工具。调用者在参数中传 `agent_id`，ProjectDO 按项目内登记的角色和任务分配执行业务权限。暂不实现 ADR-007 的独立凭据配发、摘要存储、自助管理、身份防伪；ADR-007 延后到对外部署阶段。

Task 状态简化为 `pending`、`assigned`、`working`、`submitted`、`completed`、`blocked`。Worker 的 `task_report(working|progress|blocked)` 是事实汇报：`working` 和 `blocked` 分别使已分配任务进入对应状态，`progress` 只更新报告数据；这是 ProjectDO 固定的领域转换，不提供通用 Task 状态写入接口。提交与审核继续遵守 ADR-008 的原子性。依赖管理、幂等键、重开、取消、失败、事件分页和 Agent presence 阈值留待后续迭代。

此版本只用于可信环境下验证协作语义；接入不可信客户端或公网部署前，必须补上请求身份验证。其他 ADR 中与本条 MVP 范围冲突的详细功能，以本条为准。
