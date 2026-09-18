# SPEC — Coordination MCP MVP

## 目标与范围

在 Cloudflare Worker 暴露一个 Streamable HTTP MCP 入口；每个 `project_id` 映射一个 SQLite-backed Project Durable Object。一个 Project 只有一个 Orchestrator，少于 10 个 Worker Agent。ProjectDO 保存 Agent、Task、Submission 和 Event 的当前状态；Worker 只负责协议适配和路由。领域规则使用纯 TypeScript，不能依赖 Cloudflare API。

本版面向可信 Agent 的协作验证。`agent_id` 由工具参数传入，ProjectDO 根据已登记角色检查操作，但暂不实现凭据、身份防伪或公网访问控制。部署到不可信网络前必须补齐这部分。ADR-007 的凭据设计暂缓，ADR-009 定义本版范围。

## 十一个 MCP 工具

所有工具包含 `project_id`。调用者相关工具还包含 `agent_id`。失败返回包含稳定 `code` 和 `message` 的 MCP Tool Error。所有 ID 为非空字符串，`progress` 为 0–100 的整数。

| 工具 | 调用方 | 核心输入 | 核心返回与效果 |
| --- | --- | --- | --- |
| `project_init` | Orchestrator | `project_id`, `agent_id` | 创建 Project，指定唯一 Orchestrator；相同 ID 重试返回现有项目，其他 ID 不得取代 |
| `agent_register` | Orchestrator 或 Worker | `project_id`, `agent_id`, `role` | 登记 Agent；Orchestrator 只能是项目指定 ID；已有同角色 Agent 重试返回现有记录 |
| `agent_heartbeat` | 已登记 Agent | `project_id`, `agent_id`, `status`, `current_task_id?` | 更新自身运行状态和 `last_seen`；不能改 Task 状态 |
| `project_get_state` | Orchestrator | `project_id`, `agent_id` | 返回本项目 Agent、Task、Submission 的当前列表及最近 Event |
| `task_create` | Orchestrator | `project_id`, `agent_id`, `title`, `description?` | 创建 `pending` Task，返回 `task_id` 与 `version=1` |
| `task_assign` | Orchestrator | `project_id`, `agent_id`, `task_id`, `assignee_agent_id`, `expected_version` | 把 `pending` Task 分配给已登记 Worker，进入 `assigned` |
| `task_get_assignment` | Worker | `project_id`, `agent_id` | 返回当前分配给自己的未完成 Task 列表，可轮询；无任务时返回空列表 |
| `task_get` | Orchestrator 或该 Task 的执行 Worker | `project_id`, `agent_id`, `task_id` | 返回 Task、版本、最近报告和 Submission |
| `task_report` | 当前执行 Worker | `project_id`, `agent_id`, `task_id`, `kind`, `progress?`, `message?`, `expected_version` | `kind` 为 `working`、`progress`、`blocked`；记录报告，按下述固定状态机更新 |
| `submission_create` | 当前执行 Worker | `project_id`, `agent_id`, `task_id`, `summary`, `result_ref?`, `expected_version` | 原子创建 `pending` Submission，Task 进入 `submitted` |
| `submission_review` | Orchestrator | `project_id`, `agent_id`, `submission_id`, `decision`, `feedback?`, `expected_version` | `approve` 原子完成 Task；`reject` 附反馈并使 Task 回到 `working` |

MVP 不提供通用 `task_update`、`task_complete`、依赖管理、任务重开、取消或失败接口。Worker 不能直接把 Task 标为 `completed`，也不能批准 Submission。

## 状态与权限

| 原状态 | 操作 | 新状态 |
| --- | --- | --- |
| 不存在 | Orchestrator `task_create` | `pending` |
| `pending` | Orchestrator `task_assign` | `assigned` |
| `assigned`、`blocked` | 当前 Worker `task_report(kind=working)` | `working` |
| `assigned`、`working` | 当前 Worker `task_report(kind=blocked)` | `blocked` |
| `assigned`、`working`、`blocked` | 当前 Worker `task_report(kind=progress)` | 不变 |
| `working` | 当前 Worker `submission_create` | `submitted` |
| `submitted` | Orchestrator `submission_review(approve)` | `completed` |
| `submitted` | Orchestrator `submission_review(reject)` | `working` |

其他转换均返回 `INVALID_TRANSITION`。`completed` 为终态。一个 Task 同时最多一个 `pending` Submission。拒绝后保留历史 Submission，Worker 可再次提交。只有当前 `assigned_agent_id` 能读该 Task、报告和提交；Orchestrator 可读本项目全部状态。ProjectDO 是这些规则的最终检查点。

## 数据与一致性

- Project: `project_id`, `orchestrator_agent_id`, `created_at`。
- Agent: `agent_id`, `role` (`orchestrator|worker`), `status` (`idle|working|waiting|blocked|error`), `current_task_id?`, `last_seen`, `version`。
- Task: `task_id`, `title`, `description`, `status`, `assigned_agent_id?`, `progress`, `message?`, `version`, `created_at`, `updated_at`。
- Submission: `submission_id`, `task_id`, `agent_id`, `status` (`pending|approved|rejected`), `summary`, `result_ref?`, `feedback?`, `created_at`, `reviewed_at?`。
- Event: 项目内递增 `seq`、`type`、`entity_id`、`actor_agent_id`、`payload`、`created_at`。Event 只用于审计；当前状态来自领域表。

Task 创建时 `version=1`，每次 Task 持久化修改后加 1。更新 Task 的工具必须提供 `expected_version`；不匹配返回 `VERSION_CONFLICT` 和当前版本，不执行写入。`submission_create` 与 `submission_review` 的实体修改、版本递增和 Event 追加必须在同一 SQLite 事务中完成。成功的状态变化及报告均追加 Event。MVP 不要求请求幂等键，客户端在网络错误后须重新读取状态再决定是否重试。

## 技术边界与验收

- 使用 Cloudflare Worker、一个 Project 对应一个 ProjectDO、DO SQLite；不引入 Redis、D1、Queue、WebSocket、Alarm 或外部数据库。
- MCP 采用无会话 Streamable HTTP。Worker 不保存业务状态；内部调用 ProjectDO 的方法。
- 领域规则可离线测试；DO 层测试事务、版本冲突和数据持久化；MCP 测试工具发现与完整调用链。
- 验收链路：初始化项目 → 注册 Orchestrator 和 Worker → 创建并分配 Task → Worker 查询自己的 Assignment、汇报 working 和 progress → 创建 Submission → Orchestrator 查询并 approve → Task completed → Event 能追踪全过程。
- 负例：第二个 Orchestrator、Worker 创建或分配 Task、非 assignee 提交、Worker 审核、过期版本、非法状态转换必须被拒绝；reject 后 Worker 可读取反馈并再次提交。

## 后续迭代

凭据与身份验证、依赖、更多 Task 状态、事件分页、Agent presence 阈值、幂等键和完整工具集按需求另行决定。新增架构能力先记录 ADR。
