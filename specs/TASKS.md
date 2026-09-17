# TASKS

## Phase 0 — Bootstrap

- [ ] 初始化 Cloudflare Workers TypeScript 项目
- [ ] 配置 Durable Object binding
- [ ] 创建基础目录结构
- [ ] 建立测试框架

## Phase 1 — Domain

- [ ] 定义 Agent
- [ ] 定义 Task
- [ ] 定义 Submission
- [ ] 定义 Event
- [ ] 定义 TaskStatus
- [ ] 定义 AgentStatus
- [ ] 定义 DomainError
- [ ] 实现权限规则
- [ ] 实现状态转换规则
- [ ] 编写领域测试

## Phase 2 — ProjectDO

- [ ] 创建 SQLite schema
- [ ] 实现 registerAgent
- [ ] 实现 heartbeat
- [ ] 实现 createTask
- [ ] 实现 assignTask
- [ ] 实现 getTaskContext
- [ ] 实现 reportProgress
- [ ] 实现 createSubmission
- [ ] 实现 reviewSubmission
- [ ] 实现 event append
- [ ] 实现 version check

## Phase 3 — MCP

- [ ] MCP 初始化
- [ ] Agent tools
- [ ] Task tools
- [ ] Submission tools
- [ ] Orchestrator tools
- [ ] 错误映射

## Phase 4 — End-to-End

- [ ] Orchestrator 创建 Task
- [ ] Worker 获取任务
- [ ] Worker 汇报进度
- [ ] Worker 提交 Submission
- [ ] Orchestrator approve
- [ ] Task completed
- [ ] 查询完整事件链
