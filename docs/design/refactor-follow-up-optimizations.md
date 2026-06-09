# Refactor Follow-up Optimizations

This backlog captures optimization opportunities discovered while performing the behavior-preserving domain-first modularization. Do not implement these items during the modularization pass unless required to preserve existing behavior.

## Entry Format

Each entry should use this format:

```text
### [Short title]

- Affected module/file:
- Observed issue:
- Potential improvement:
- Risk/impact:
- Suggested validation:
```

## Backlog

### Shared child-session setup helper

- Affected module/file: `src/delegate/single-runner.ts`, `src/delegate/resume-runner.ts`
- Observed issue: Fresh teammate runs and resumed teammate runs both set up settings managers, resource loaders, injected skills, session binding, effective model tracking, abort handling, and snapshot synchronization.
- Potential improvement: Extract a shared child-session runtime helper that accepts creation/opening differences as parameters.
- Risk/impact: Medium. It could reduce duplication, but mistakes could affect resume reliability.
- Suggested validation: Unit tests for shared setup plus a real persisted delegate/resume flow in an interactive or JSON-mode Pi session.
