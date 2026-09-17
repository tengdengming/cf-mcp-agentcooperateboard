# TASKS

## Phase 0 — Bootstrap

- [ ] 初始化 Cloudflare Workers TypeScript 项目
- [ ] 配置 Durable Object binding
- [ ] 创建基础目录结构
- [ ] 建立测试框架

## Phase 1 — Domain

- [ ] 定义 Project 及单 Orchestrator 约束
- [ ] 定义 Agent
- [ ] 定义 Task
- [ ] 定义 Submission
- [ ] 定义 Event
- [ ] 定义 TaskDependency
- [ ] 定义 TaskStatus
- [ ] 定义 AgentStatus
- [ ] 定义 DomainError
- [ ] 实现权限规则
- [ ] 实现状态转换规则
- [ ] 定义 version / expected_version 规则

## Phase 2 — Tests

- [ ] 测试单 Orchestrator 与 Worker 权限边界
- [ ] 测试 Task 状态机、依赖和版本冲突
- [ ] 测试 Agent 自身状态与 heartbeat 在线判定
- [ ] 测试 Submission approve / reject 及反馈流程

## Phase 3 — ProjectDO

- [ ] 创建 SQLite schema
- [ ] 实现 Project 创建和项目状态查询
- [ ] 实现 registerAgent
- [ ] 实现 heartbeat
- [ ] 实现 getAgentContext 和 getAssignment
- [ ] 实现 createTask
- [ ] 实现 assignTask
- [ ] 实现 getTaskContext
- [ ] 实现 reportProgress
- [ ] 实现 reportBlocked 和依赖管理
- [ ] 实现 createSubmission
- [ ] 实现 reviewSubmission
- [ ] 实现 Submission 查询、Task 重开/完成/取消
- [ ] 实现 event append
- [ ] 实现 version check
- [ ] 在 ProjectDO 校验调用身份和权限

## Phase 4 — Worker / MCP

- [ ] Worker 入口鉴权、Project/Agent 身份解析和 ProjectDO 路由
- [ ] MCP 初始化
- [ ] Agent tools
- [ ] Task tools
- [ ] Submission tools
- [ ] Orchestrator tools
- [ ] 统一错误映射与请求追踪

## Phase 5 — End-to-End

- [ ] 创建 Project 并注册 Orchestrator 与 Worker
- [ ] Orchestrator 创建 Task
- [ ] Worker 获取 Assignment 和 Task Context 并发送 heartbeat
- [ ] Worker 汇报进度
- [ ] Worker 提交 Submission
- [ ] Task 进入 submitted，Orchestrator 查询 Submission
- [ ] Orchestrator approve
- [ ] Task completed
- [ ] 查询完整事件链
- [ ] 验证 PERMISSION_DENIED、VERSION_CONFLICT 与 reject 后继续执行

## Phase 6 — Skill

- [ ] 在稳定 MCP 语义上定义 Worker Collaboration Skill
- [ ] 在稳定 MCP 语义上定义 Orchestrator Skill
