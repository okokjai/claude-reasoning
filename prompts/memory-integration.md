# Memory Integration

## Write Structure

```
# Pattern Assets (success patterns)
${CLAUDE_MEMORY_DIR:-$HOME/.claude/memory}/reasoning-patterns/{type}/{pattern-name}.md

# Reasoning Logs
${CLAUDE_MEMORY_DIR:-$HOME/.claude/memory}/reasoning-logs/YYYY-MM-DD_task-name.md

# Anti-Patterns (failure experiences)
${CLAUDE_MEMORY_DIR:-$HOME/.claude/memory}/reasoning-anti-patterns/{category}.md

# Experience Cache (cross-topic transfer learning)
${CLAUDE_MEMORY_DIR:-$HOME/.claude/memory}/reasoning-patterns/cache/{topic-category}.md
```

## Cross-Topic Experience Cache

| New Topic Category | Cache File |
|--------------------|------------|
| Macroeconomics | cache/macro-economy.md |
| Budget accommodation | cache/budget-accommodation.md |
| Precious metals/jewelry | cache/precious-metals.md |
| Tech industry | cache/tech-industry.md |
| Policy/regulation | cache/policy-regulation.md |
| Career transition | cache/career-switch.md |
| Interpersonal conflict | cache/conflict-resolution.md |
| Financial planning | cache/financial-planning.md |