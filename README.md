# Coordination MCP MVP

Cloudflare Worker 提供 `/mcp` 无会话 Streamable HTTP 接口；每个 Project 使用一个 SQLite-backed Durable Object 保存协作状态。当前提供 11 个工具，详见 [Spec](specs/SPEC.md)。Hermes / Codex 的远程 MCP 与 Skill 配置见 [客户端接入指南](docs/client-setup.md)。

## 本地运行

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run dev
```

服务默认在 `http://127.0.0.1:8787/mcp`。另开终端执行 `npm.cmd run smoke`，检查 MCP 工具发现和完整协作链。`GET /health` 返回 `ok`。

MCP 客户端按顺序调用 `project_init`、`agent_register`、`task_create`、`task_assign`、`task_get_assignment`、`task_get`、`task_report`、`submission_create`、`submission_review`；`agent_heartbeat` 和 `project_get_state` 用于状态更新与查询。Task 更新需传入最近读取的 `expected_version`，收到 `VERSION_CONFLICT` 后重新 `task_get`。

## 范围

本版使用参数中的 `agent_id` 表示可信调用者，尚无请求身份验证。仅用于本地或可信环境验证；部署到不可信网络前需完成 [TASKS](specs/TASKS.md) 中的身份验证任务。没有 Redis、D1、Queue 或 WebSocket。
