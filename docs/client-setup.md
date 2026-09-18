# Hermes / Codex 接入 Coordination MCP

Hermes 和 Codex 自带 MCP 客户端。把部署后的 Worker `/mcp` URL 注册为远程 Streamable HTTP 服务器即可；不需要另写一个本地 MCP 客户端。Skill 是 Agent 使用这些工具的工作流程，不能代替 MCP 连接。

以下用 `https://agent-coordination-mcp.<subdomain>.workers.dev/mcp` 作示例，替换为 Cloudflare 实际地址。不要填写 `/health`。

## Codex CLI / IDE

在运行 Codex 的每台机器上执行：

```bash
codex mcp add coordination --url https://agent-coordination-mcp.<subdomain>.workers.dev/mcp
codex mcp list
```

或者在 `~/.codex/config.toml` 中配置：

```toml
[mcp_servers.coordination]
url = "https://agent-coordination-mcp.<subdomain>.workers.dev/mcp"
```

Codex IDE 扩展也可以通过“设置 → MCP 服务器 → 添加服务器”选择 Streamable HTTP 并填写同一 URL；保存后重启扩展。在 Codex 会话中用 `/mcp` 确认 11 个工具可见。Codex 会读取当前仓库的 `.agents/skills/`；如果 Agent 在其他仓库运行，把本仓库的 `coordination-orchestrator` 或 `coordination-worker` Skill 文件夹放到那个仓库的 `.agents/skills/`，或放到用户级 `~/.agents/skills/`。

## Hermes Agent

在运行 Hermes 的每台机器上执行：

```bash
hermes mcp add coordination --url https://agent-coordination-mcp.<subdomain>.workers.dev/mcp
hermes mcp test coordination
```

也可以在 `~/.hermes/config.yaml` 中配置：

```yaml
mcp_servers:
  coordination:
    url: "https://agent-coordination-mcp.<subdomain>.workers.dev/mcp"
```

从本仓库启动 Hermes 时，它会发现 `.agents/skills/`。首次使用，在仓库根目录运行 `hermes skills trust`；新会话中分别使用 `coordination-orchestrator` 或 `coordination-worker`。如果 Hermes 在其他仓库运行，复制相应 Skill 文件夹到该仓库 `.agents/skills/`，或安装到 Hermes 的 `~/.hermes/skills/`。

## 启动一个项目的协作

1. 在 Orchestrator 会话中确定一个固定 `project_id`（如 `demo-project`）和自己的 `agent_id`（如 `lead`），运行 `project_init`，再用 `role=orchestrator` 调用 `agent_register`。
2. 每个 Worker 会话使用同一个 `project_id`、各自不同的 `agent_id`（如 `coder-1`），用 `role=worker` 调用 `agent_register`。
3. Orchestrator 用 `task_create` 和 `task_assign` 分配任务。Worker 调 `task_get_assignment` 发现任务，再按 Worker Skill 执行、汇报和提交。
4. Orchestrator 调 `project_get_state` 查看提交，用 `submission_review` 批准或拒绝。Worker 可用 `task_get` 读取反馈。

两个会话都须实际运行。当前服务负责共享状态，不负责启动远端 Agent、发送推送或后台轮询；没有任务时 Worker 的 `task_get_assignment` 返回空列表。让 Worker 在自己的会话中定期检查分配，或由外部已有的运行机制唤醒它。

此 MVP 的 `agent_id` 是可信环境中的约定值，没有请求身份验证；服务端角色检查不能证明调用者是谁。
