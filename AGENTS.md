# AGENTS.md

## Codex / Agent Development Instructions

开始工作前必须阅读：

1. `MEMORYBANK.md`
2. `specs/SPEC.md`
3. `specs/DECISIONS.md`
4. `specs/TASKS.md`

## Hard Constraints

- 不改变 Single-Orchestrator 模型
- Worker Agent 不可直接完成 Task
- ProjectDO 是项目权威状态源
- 不引入未批准基础设施
- 不提前加入 Redis / D1 / Queue / WebSocket
- 状态变化必须遵守领域状态机
- 身份与角色必须来自凭据绑定，不能信任 Agent 自报
- Submission 的创建与审核必须遵守 `specs/DECISIONS.md` 中的 ADR-008
- 修改架构前先新增 ADR
- 修改领域规则必须同步修改测试
- 优先小步实现
- 优先明确语义而不是过度抽象
- `specs/SPEC.md` 是 MVP 验收规则；`MEMORYBANK.md` 保存背景和原则，冲突时先核对已接受 ADR
- 当前实现范围以 ADR-009 为准；ADR-007 的凭据方案暂缓，MVP 不得被当作已具备公网身份验证

## Development Style

实现顺序：

```text
Spec
→ Domain
→ Test
→ ProjectDO
→ Worker
→ MCP
→ Skill
```

不要反过来。
