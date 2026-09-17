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
- 修改架构前先新增 ADR
- 修改领域规则必须同步修改测试
- 优先小步实现
- 优先明确语义而不是过度抽象

## Development Style

实现顺序：

```text
Spec
→ Domain
→ Test
→ ProjectDO
→ MCP
→ Skill
```

不要反过来。
