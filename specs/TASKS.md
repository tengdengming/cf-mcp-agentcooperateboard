# TASKS — Coordination MCP MVP

当前 MVP 基线见 `SPEC.md` 与 ADR-009。已完成项表示本地实现及最小验证通过；不代表已部署。

## MVP

- [x] 固定 11 个 MCP 工具、简化 Task 状态机及权限边界
- [x] 实现纯 TypeScript 领域状态规则和单元测试
- [x] 初始化 Cloudflare Worker、DO SQLite 与 Wrangler 配置
- [x] 在 ProjectDO 实现 Project、Agent、Task、Submission、Event 及版本检查
- [x] 使用 SQLite 事务完成提交、审核和事件追加
- [x] 暴露无会话 Streamable HTTP MCP 入口
- [x] 本地验证工具发现、完整协作链、拒绝后再次提交、权限及版本冲突
- [ ] 部署前补齐请求身份验证，并决定是否开放给不可信客户端

## 后续候选

- [ ] 依赖、重开、取消和失败状态
- [ ] Event 分页、Agent presence 推断和幂等键
- [ ] Worker 与 Orchestrator 的协作 Skill
