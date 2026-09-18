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

## 远程 MCP API

部署到 Cloudflare 后，MCP 地址为 `https://<Worker 域名>/mcp`。这是 **Streamable HTTP MCP** 接口，不是按工具名划分的 REST API：客户端通过该地址发送 JSON-RPC 请求，先完成 `initialize`，再使用 `tools/list` 发现工具、`tools/call` 调用工具。`GET /health` 仅用于健康检查；其他路径返回 404。Hermes 和 Codex 的 URL 配置见[客户端接入指南](docs/client-setup.md)。

调用 `tools/call` 时，请求体形式如下。HTTP 请求需设置 `Content-Type: application/json`，并接受 `application/json, text/event-stream`；按 MCP 协议处理 JSON 或 SSE 响应。

首次连接时的 `initialize` 请求示例：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": { "name": "my-agent", "version": "1.0.0" }
  }
}
```

随后发送 `{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}` 获取工具列表。MCP 客户端通常自动完成初始化和工具发现。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "project_init",
    "arguments": { "project_id": "demo-project", "agent_id": "lead" }
  }
}
```

所有工具都要求非空字符串 `project_id` 和 `agent_id`。`project_id` 决定使用哪个 ProjectDO；同一项目的 Agent 必须传相同值。`agent_id` 是本版可信客户端约定的调用者 ID，不由服务端鉴别身份。MCP 工具返回的业务数据位于 `result.content[0].text`，其内容是 JSON 字符串。

| 工具 | 额外参数（`?` 表示可选） | 返回与用途 |
| --- | --- | --- |
| `project_init` | 无 | Project 对象；首次调用的 `agent_id` 成为指定 Orchestrator |
| `agent_register` | `role: "orchestrator" \| "worker"` | Agent 对象；Orchestrator ID 必须与 `project_init` 一致 |
| `agent_heartbeat` | `status: "idle" \| "working" \| "waiting" \| "blocked" \| "error"`, `current_task_id?` | 更新自身 `last_seen` 和运行状态，返回 Agent 对象 |
| `project_get_state` | 无 | 仅 Orchestrator 可读；返回 `agents`、`tasks`、`submissions`、最近 100 条 `events` |
| `task_create` | `title`, `description?` | 仅 Orchestrator；返回 `pending` Task，包括 `task_id`、`version: 1` |
| `task_assign` | `task_id`, `assignee_agent_id`, `expected_version` | 仅 Orchestrator；分配给已注册 Worker，返回更新后的 Task |
| `task_get_assignment` | 无 | 仅 Worker；返回分配给自己的未完成 Task 数组，无任务时返回 `[]` |
| `task_get` | `task_id` | Orchestrator 或当前执行 Worker；返回 `{ "task": ..., "submissions": [...] }` |
| `task_report` | `task_id`, `kind: "working" \| "progress" \| "blocked"`, `expected_version`, `progress?`, `message?` | 当前执行 Worker；`progress` 若提供须为 0–100 的整数；返回更新后的 Task |
| `submission_create` | `task_id`, `summary`, `expected_version`, `result_ref?` | 当前执行 Worker；返回 `{ "submission": ..., "task": ... }`，Task 进入 `submitted` |
| `submission_review` | `submission_id`, `decision: "approve" \| "reject"`, `expected_version`, `feedback?` | 仅 Orchestrator；`reject` 必须提供非空反馈；返回更新后的 Submission 和 Task |

典型调用顺序：`project_init` → 双方 `agent_register` → `task_create` → `task_assign` → Worker `task_get_assignment` / `task_get` → `task_report(kind=working)` → `task_report(kind=progress)` → `submission_create` → Orchestrator `project_get_state` / `submission_review`。每次 Task 写入后读取返回的新版 `version`，下一次写入时作为 `expected_version`。批准后 Task 为 `completed`；拒绝后 Task 回到 `working`，Worker 可从 `task_get` 读取反馈并重新提交。

领域错误以 MCP Tool Error 返回：`result.isError` 为 `true`，`content[0].text` 为包含 `code`、`message` 的 JSON 字符串；版本冲突还包含 `current_version`。常见代码有 `NOT_FOUND`、`PERMISSION_DENIED`、`INVALID_TRANSITION`、`VERSION_CONFLICT`、`ALREADY_EXISTS`、`VALIDATION_ERROR`。网络请求失败时先读取当前 Task 再决定是否重试；本版没有请求幂等键。

## 范围

本版使用参数中的 `agent_id` 表示可信调用者，尚无请求身份验证。仅用于本地或可信环境验证；部署到不可信网络前需完成 [TASKS](specs/TASKS.md) 中的身份验证任务。没有 Redis、D1、Queue 或 WebSocket。
