# MemoryBank — Multi-Agent Coordination MCP

> 项目定位：基于 Cloudflare Workers + Durable Objects 的轻量级 Multi-Agent Coordination MCP。
> 目标：在单个 Project 内，让多个独立运行的 Agent 通过一个 Orchestrator 实现低冲突、即时、一致、可追踪的协作。
> 本文保存长期背景和架构原则；具体 MVP 验收规则以 `specs/SPEC.md` 及 `specs/DECISIONS.md` 为准。
> 当前可运行 MVP 按 ADR-009 收敛为 11 个 MCP 工具；本文后续完整模型和工具列表是演进方向，不是本版交付清单。

---

## 1. 项目背景

本项目面向多个独立运行在普通电脑上的 Agent。

这些 Agent 可能运行在不同 Harness 中，例如 Hermes、OpenClaw 或其他 Agent Runtime。它们需要在同一个项目空间内协作，但不希望采用复杂的多主写入、分布式锁、复杂工作流引擎或重型消息系统。

项目当前规模预期：

- 单 Project 内 Agent 数量：10 个以内
- 每个 Agent 独立运行
- 每个 Agent 具有明确角色
- 一个 Project 仅设置一个 Orchestrator
- Orchestrator 是唯一任务编排者、任务状态流转者
- 普通 Agent 只负责执行、汇报、提交结果、申请检查
- 任务完成与否由 Orchestrator 最终确认

因此，本项目采用：

> Single-Orchestrator / Multi-Worker Agent

作为核心协作模型。

---

## 2. 核心架构原则

### 2.1 单一编排者

每个 Project 仅允许一个 Orchestrator。

Orchestrator 负责：

- 创建任务
- 拆分任务
- 分配任务
- 修改任务生命周期状态
- 建立和解除任务依赖
- 检查 Agent 提交结果
- 通过或驳回 Submission
- 决定后续任务流转
- 决定任务完成
- 决定任务重新打开
- 管理项目级协作节奏

普通 Worker Agent 不允许直接改变任务权威状态。

---

### 2.2 普通 Agent 的职责

普通 Agent 只能执行：

- 注册自身
- 读取自己的任务
- 读取任务上下文
- 更新自身运行状态
- 汇报工作进度
- 汇报阻塞
- 提交工作结果
- 请求检查
- 等待 Orchestrator 决策

普通 Agent 不允许直接：

- 将任务设置为 completed
- 修改任务 owner
- 修改 assigned_agent
- 创建或解除任务依赖
- 改变任务主流程
- 重新分配其他 Agent
- 批准自己的 Submission

---

### 2.3 业务一致性优先于计算一致性

系统不通过复杂的分布式锁机制解决任务状态冲突。

系统通过概念模型约束：

> Only Orchestrator can mutate authoritative task lifecycle state.

因此：

- 业务状态只有一个写入者
- Worker Agent 只提交事实、进度、结果和请求
- Orchestrator 决定任务正式状态

Durable Object 主要承担技术层一致性；
Orchestrator 模型承担业务层一致性。

---

## 3. 技术选型

### 3.1 Cloudflare Worker

Worker 定位为：

> 无状态边缘入口 + MCP 协议适配层

Worker 负责：

- HTTP / MCP 请求入口
- 鉴权
- Project ID 解析
- Agent ID 解析
- 权限检查入口
- 请求参数校验
- 调用 Project Durable Object
- 统一响应与错误格式
- 日志和请求追踪

Worker 不保存业务状态。

---

### 3.2 Durable Object

一个 Project 对应一个 Project Durable Object。

映射关系：

```text
Project ID
   ↓
ProjectDurableObject
```

ProjectDurableObject 是该 Project 的权威运行态容器。

它负责：

- Project 状态
- Agent 状态
- Task 状态
- Submission
- Task dependency
- Agent / Task relationship
- Event history
- Orchestrator 权限
- 事务处理
- 项目内顺序一致性

设计原则：

> One Project = One Durable Object

不要设计：

> One Agent = One Durable Object

---

### 3.3 Durable Object Storage

第一阶段使用：

> SQLite-backed Durable Object Storage

不引入：

- Redis
- D1
- Kafka
- NATS
- Temporal
- 外部 Workflow Engine

除非未来明确出现跨 Project、大规模异步任务或分析需求。

---

## 4. 核心领域对象

第一版领域对象控制在以下范围：

```text
Project
Agent
Task
Submission
Event
```

必要时增加：

```text
TaskAgentRelation
TaskDependency
```

---

## 5. Agent 模型

Agent 表达当前 Agent 自身运行态。

建议字段：

```text
agent_id
project_id
role
status
current_task_id
progress
message
last_seen
version
created_at
updated_at
```

Agent 状态建议：

```text
idle
working
waiting
blocked
offline
error
```

语义：

### idle
Agent 在线，但当前没有任务。

### working
Agent 正在处理 current_task_id。

### waiting
Agent 正在等待正常条件，例如等待 Orchestrator 检查。

### blocked
Agent 因依赖失败、外部资源不可用等原因无法继续。

### offline
Agent 长时间未 heartbeat。

### error
Agent 自身出现执行错误。

---

## 6. Task 模型

Task 是项目协作的核心工作单元。

建议字段：

```text
task_id
project_id
title
description
status
owner_agent_id
assigned_agent_id
priority
parent_task_id
progress
version
created_at
updated_at
```

Task 状态第一版保持简单：

```text
pending
assigned
working
submitted
completed
blocked
failed
cancelled
```

状态解释：

### pending
任务已创建，但尚未分配。

### assigned
Orchestrator 已分配 Agent。

### working
Agent 已开始执行。

### submitted
Agent 已提交结果，等待 Orchestrator 检查。

### completed
Orchestrator 确认任务完成。

### blocked
任务因依赖或外部条件阻塞。

### failed
Orchestrator 判定任务失败。

### cancelled
Orchestrator 取消任务。

---

## 7. Submission 模型

Submission 用于区分：

> Agent 认为自己完成

与：

> 系统正式确认任务完成

普通 Agent 完成工作时不能直接设置 Task.completed。

Agent 只能：

```text
submission_create
```

Submission 建议字段：

```text
submission_id
project_id
task_id
agent_id
status
summary
result_ref
message
created_at
reviewed_at
reviewed_by
review_message
```

Submission 状态：

```text
pending
approved
rejected
```

流程：

```text
Agent
  ↓
submission_create
  ↓
Task → submitted
  ↓
Orchestrator review
  ├── approve
  │      ↓
  │   Task → completed
  │
  └── reject
         ↓
      Task → assigned / working
```

---

## 8. Task 与 Agent 关系

除 owner / assigned_agent 外，可以使用 TaskAgentRelation 表达扩展关系。

relation 类型：

```text
owner
assignee
participant
reviewer
watcher
```

普通 Agent 不允许任意修改关系。

任务关系由 Orchestrator 管理。

---

## 9. Task Dependency

任务之间允许建立依赖。

建议表：

```text
task_dependencies
-----------------
task_id
depends_on_task_id
created_at
```

语义：

```text
T1024 depends_on T1021
```

表示：

> T1021 未满足条件前，T1024 不应进入可执行状态。

反向依赖不强制持久化，可通过 SQL 反查。

第一版不要构建复杂 DAG Engine。

依赖是否满足，由 Orchestrator 判断。

---

## 10. Event 模型

Event 从第一版开始保留。

Event 不作为当前状态源。

当前状态查询：

```text
agents
tasks
submissions
```

历史行为查询：

```text
events
```

建议字段：

```text
event_id
project_id
event_type
entity_type
entity_id
actor_agent_id
payload
created_at
```

典型事件：

```text
agent.registered
agent.status_changed
agent.heartbeat

task.created
task.assigned
task.started
task.progress_reported
task.blocked
task.submitted
task.completed
task.failed
task.cancelled

submission.created
submission.approved
submission.rejected
```

Event 用于：

- 审计
- 回放
- 故障排查
- Agent 行为分析
- 项目过程重建

---

## 11. Version 机制

即使使用 Durable Object，Task 和 Agent 仍保留 version。

原因：

> Durable Object 解决服务端并发一致性；
> version 解决 Agent 长时间推理导致的上下文陈旧问题。

例如 Agent 读取：

```text
task.version = 18
```

40 秒后提交：

```text
expected_version = 18
```

但 Task 已变更为：

```text
version = 21
```

系统应返回：

```text
VERSION_CONFLICT
```

Agent 应重新读取最新上下文，再决定后续动作。

---

## 12. Heartbeat

普通 Agent 定期发送 heartbeat。

建议：

```text
10~15 秒一次
```

记录：

```text
last_seen
status
current_task_id
progress
message
```

第一版不需要 Alarm 定期扫描。

读取状态时动态计算：

```text
now - last_seen
```

建议：

```text
< 30s       online
30~90s      suspect
> 90s       offline
```

此阈值属于配置项，不写死在领域模型。

---

## 13. MCP 定位

MCP 不暴露底层：

```text
SQL
DO Storage
KV
RPC internals
```

MCP 暴露：

> Agent 协作语义

MCP 是 Agent 的协作 API。

---

## 14. 普通 Agent MCP Tools

第一版建议：

```text
agent_register
agent_heartbeat
agent_get_context

task_get_assignment
task_get_context
task_report_progress
task_report_blocked

submission_create
submission_get
```

### agent_register

用途：

注册当前 Agent。

输入：

```text
project_id
agent_id
role
capabilities?
```

---

### agent_heartbeat

用途：

更新 Agent 当前运行状态。

输入：

```text
project_id
agent_id
status
current_task_id?
progress?
message?
```

---

### agent_get_context

返回：

- Agent 自身状态
- 当前任务
- 任务相关方
- 任务依赖
- 当前阻塞
- 最新 version

---

### task_get_assignment

返回当前 Agent 被 Orchestrator 分配的有效任务。

---

### task_get_context

返回指定 Task 的完整协作上下文。

---

### task_report_progress

Agent 汇报进度。

注意：

它是 report，不是直接修改权威任务生命周期。

---

### task_report_blocked

Agent 汇报当前 blocker。

Orchestrator 决定是否正式将 Task 置为 blocked。

---

### submission_create

Agent 提交工作成果并请求检查。

创建成功后，可以使 Task 进入 submitted 状态，但最终完成状态仍由 Orchestrator 决定。

---

## 15. Orchestrator MCP Tools

Orchestrator 拥有独立权限。

建议：

```text
project_get_state

agent_list
agent_get

task_create
task_assign
task_update
task_add_dependency
task_remove_dependency
task_reopen
task_complete
task_cancel

submission_list
submission_review
```

---

## 16. 权限模型

角色：

```text
orchestrator
worker
```

后续可以扩展：

```text
reviewer
observer
admin
```

第一阶段不要设计复杂 RBAC。

核心规则：

```text
worker:
    can read assigned task
    can report status
    can submit result

orchestrator:
    can create task
    can assign task
    can change lifecycle state
    can manage dependencies
    can approve/reject submission
```

ProjectDO 是最终权限校验点。

不要仅依赖 MCP Client 或 Agent Prompt 自觉遵守权限。

---

## 17. Worker → Durable Object 调用

内部优先使用 Typed RPC 风格。

建议：

```text
projectDO.getProjectState()
projectDO.registerAgent()
projectDO.heartbeat()
projectDO.getAgentContext()

projectDO.createTask()
projectDO.assignTask()
projectDO.getTaskContext()

projectDO.createSubmission()
projectDO.reviewSubmission()
```

不要在 Worker 与 DO 之间重复构造大量内部 HTTP API。

外部：

```text
MCP / HTTP
```

内部：

```text
Typed RPC
```

---

## 18. Skill 定位

Skill 不承担存储。

Skill 负责：

> Agent 应该如何协作。

MCP 负责：

> Agent 可以调用哪些可靠的协作能力。

---

## 19. Worker Agent Collaboration Skill

Worker Agent 工作规则：

```text
1. register
2. heartbeat
3. get_my_assignment
4. get_task_context
5. execute task
6. report_progress
7. report_blocked if necessary
8. create_submission
9. wait for review
10. if rejected, read feedback and continue
```

Worker Agent 禁止：

```text
自行认定 completed
自行改变 dependency
自行重新分配 Agent
自行批准 Submission
```

---

## 20. Orchestrator Skill

Orchestrator 的主要行为：

```text
1. project_get_state
2. 分析当前 Project
3. 创建或拆分 Task
4. 判断 Dependency
5. 选择 Agent
6. task_assign
7. 监控 Agent 状态
8. 检查 Submission
9. approve / reject
10. 更新 Task 状态
11. 解除依赖
12. 安排下一任务
```

Orchestrator 是项目工作流语义的拥有者。

---

## 21. 第一阶段不做的功能

为了保持 MVP 简单，以下明确不在第一阶段：

- 多 Orchestrator
- Leader Election
- Redis
- Kafka
- NATS
- Temporal
- D1
- 跨 Project Workflow
- 复杂 DAG 调度
- 自动 capability matching
- 自动任务抢占
- 分布式锁
- 高级 RBAC
- 向量数据库
- Agent 长期 Memory
- Git Artifact 管理
- WebSocket 强实时推送

这些功能只能在明确需求出现后引入。

---

## 22. WebSocket 规划

第一版采用：

```text
HTTP / MCP + heartbeat
```

后续如明确需要：

- 任务分配后立即通知 Agent
- Submission 后立即通知 Orchestrator
- 项目状态实时 UI
- Agent 状态实时广播

再增加：

> Durable Object Hibernation WebSocket

不要在 MVP 提前增加连接管理复杂度。

---

## 23. Alarm 规划

第一版不使用高频 Alarm 做 Agent 在线扫描。

Alarm 后续只用于：

- Task timeout
- Review timeout
- Retry delay
- Scheduled wakeup
- Project lifecycle
- 延迟任务

---

## 24. 推荐工程结构

```text
agent-coordination-mcp/
│
├── src/
│   ├── worker.ts
│   │
│   ├── durable-objects/
│   │   └── ProjectDO.ts
│   │
│   ├── domain/
│   │   ├── project.ts
│   │   ├── agent.ts
│   │   ├── task.ts
│   │   ├── submission.ts
│   │   ├── event.ts
│   │   └── errors.ts
│   │
│   ├── mcp/
│   │   ├── agent-tools.ts
│   │   ├── task-tools.ts
│   │   ├── submission-tools.ts
│   │   └── orchestrator-tools.ts
│   │
│   ├── auth/
│   │   └── permissions.ts
│   │
│   ├── services/
│   │   └── coordination-service.ts
│   │
│   └── types/
│
├── migrations/
│
├── tests/
│   ├── project-do.test.ts
│   ├── permissions.test.ts
│   ├── task-state.test.ts
│   └── submission.test.ts
│
├── specs/
│   ├── SPEC.md
│   ├── TASKS.md
│   └── DECISIONS.md
│
├── MEMORYBANK.md
├── AGENTS.md
├── wrangler.jsonc
├── package.json
└── README.md
```

---

## 25. 领域层与 Cloudflare 解耦

`src/domain/` 不应直接依赖 Cloudflare API。

例如：

```text
Task
TaskStatus
Submission
Permission
StateTransition
DomainError
```

全部应是纯 TypeScript 领域模型。

Cloudflare-specific 代码放在：

```text
worker.ts
durable-objects/
```

这样：

- 单元测试简单
- 状态机容易测试
- 后续迁移成本低
- Agent 可以更稳定地修改业务代码

---

## 26. 关键不变量

以下不变量必须写入测试。

### INV-001
一个 Project 同一时间只有一个 Orchestrator。

### INV-002
普通 Agent 不能直接将 Task 修改为 completed。

### INV-003
只有 Orchestrator 可以分配和重新分配任务。

### INV-004
Orchestrator 批准 Submission 时，ProjectDO 在同一事务中将 Task 设置为 completed；有 Worker Submission 的 Task 不得绕过审核完成。

### INV-005
普通 Agent 不能批准自己的 Submission。

### INV-006
Task 状态更新必须增加 version。

### INV-007
expected_version 不匹配时必须拒绝修改。

### INV-008
Agent 只能更新自己的运行状态。

### INV-009
ProjectDO 是 Project 内协作状态的唯一权威源。

### INV-010
Event 不作为当前状态源。

---

## 27. 非功能要求

### 简单
优先减少组件数量。

### 一致
项目状态必须有唯一权威源。

### 即时
Agent 状态和任务状态应能够快速读取。

### 可追踪
重要状态变化必须产生 Event。

### 可恢复
任务状态和 Submission 必须持久化。

### 可测试
所有关键状态机和权限规则必须可以离线单元测试。

### 可扩展
未来可以增加 WebSocket、Queue、D1，但不应破坏现有领域模型。

---

## 28. MVP 验收标准

MVP 至少完成以下完整链路：

```text
1. 创建 Project
2. 注册 Orchestrator
3. 注册 Worker Agent
4. Orchestrator 创建 Task
5. Orchestrator 分配 Task
6. Worker 获取 Assignment
7. Worker 汇报 working
8. Worker 汇报 progress
9. Worker 创建 Submission
10. Orchestrator 获取 Submission
11. Orchestrator approve
12. Task 进入 completed
13. Event 可查询完整过程
```

同时验证：

```text
Worker 尝试直接 complete Task
→ PERMISSION_DENIED

Worker 使用旧 version 更新
→ VERSION_CONFLICT

Worker 修改其他 Agent 状态
→ PERMISSION_DENIED
```

---

## 29. 开发优先级

### P0 — Domain

先完成：

```text
Agent
Task
Submission
Event
State Transition
Permission
Domain Error
```

不要先写 MCP。

---

### P1 — Tests

先验证领域权限、状态机、Submission、依赖、版本和身份边界。

---

### P2 — ProjectDO

完成：

```text
SQLite schema
CRUD
事务
权限
version
event append
```

---

### P3 — Worker / MCP

将领域能力映射成 MCP tools。

---

### P4 — Skill

最后定义：

```text
Worker Collaboration Skill
Orchestrator Skill
```

Skill 建立在稳定 MCP 上。

---

## 30. Codex 工作规则

Codex 在实现本项目时必须遵守：

1. 先阅读 `MEMORYBANK.md`
2. 再阅读 `specs/SPEC.md`
3. 读取 `specs/DECISIONS.md`
4. 读取 `specs/TASKS.md`
5. 每次只实现明确 Task
6. 不擅自增加基础设施
7. 不擅自增加 Redis / D1 / Queue / WebSocket
8. 不擅自改变 Single-Orchestrator 模型
9. 涉及架构变更必须先记录 Decision
10. 任何状态模型变化必须同步更新 Spec 和测试
11. 优先写领域测试，再写基础设施代码
12. 保持简单，避免提前抽象

---

## 31. 当前架构决策摘要

```text
Architecture:
    Single-Orchestrator / Multi-Worker

Project State:
    One Project = One Durable Object

Persistence:
    Durable Object SQLite Storage

External Interface:
    MCP over Worker

Internal Interface:
    Worker → ProjectDO Typed RPC

Realtime:
    V1 不使用 WebSocket

Agent Presence:
    heartbeat + last_seen

Task Authority:
    Orchestrator only

Worker Completion:
    Submission, not direct complete

Consistency:
    DO technical consistency
    +
    Orchestrator business consistency

Optimistic Context Check:
    version / expected_version

Audit:
    Event table

MVP Philosophy:
    Minimum components
    Explicit semantics
    No premature distributed infrastructure
```

---

## 32. 一句话定义

> 本项目是一个基于 Cloudflare Workers 与 Durable Objects 的轻量级 Multi-Agent Coordination MCP；每个 Project 对应一个 Durable Object，Orchestrator 是任务生命周期唯一权威写入者，Worker Agents 仅负责执行、汇报和提交，系统通过明确的协作语义而不是复杂分布式锁实现即时、一致、可追踪的 Agent 协作。
