# pi-teammates

This repository ships a Pi extension for teammate delegation, context transfer, internal teammate sessions, and teammate resume flows.

## Mandatory skills
- Load `extending-pi-agent` for any work in this repository.
- Load `llm-tool-design` when changing the `delegate` tool name, schema, result details, session/job metadata, or routing behavior.
- Load `llm-prompt-engineering` when changing teammate prompts, context-transfer prompts, delegate guidance, or other agent-facing instructions.
- Load `online-research` when validating upstream Pi APIs, examples, or other current external facts.

## Repo rules
- Do not create monstrosities of typescript files with 800+ SLoC, split them into more granular submodules.
- Whenever you edit code, docs, tests, examples, prompts, or package metadata, update `CHANGELOG.md` in the same change.
- Keep `README.md`, `examples/settings.jsonc`, `examples/teammates/*.md`, and the relevant tests in sync with any change to frontmatter keys, config keys/defaults, context modes, or `delegate` behavior.
- Keep the package entrypoint at `src/index.ts` unless the user explicitly asks for a structural change; if that changes, update `package.json`, `README.md`, and this file too.
- Teammate frontmatter parsing rules live in `src/teammates.ts`; context-transfer logic lives in `src/context-transfer.ts`; internal session/resume behavior lives in `src/index.ts` and `src/job-registry.ts`. If you change one of those surfaces, update the others that describe or test it.
- Persist teammate invocation state through Pi custom session entries. Do not introduce a separate out-of-band registry file unless the user explicitly asks for that breaking design change.
- Internal teammate sessions are intentionally internal-only and parent-owned. Do not expose them as normal top-level Pi sessions without explicit approval.
- `delegate` must continue to surface child session ids/details needed for resume flows. If the return shape changes, update docs and tests in the same change.
- Use the npm CLI for dependency or package metadata changes.
- Do not commit `node_modules/`, tarballs, logs, temporary session files, or `IDEAS.md` unless explicitly requested.

## Validation
- Run `npm test` after changing tool behavior, config loading, context-transfer logic, job persistence, session layout, or resume flows.
- Run `npm pack --dry-run` after changing package metadata or published file lists.
- Do not claim delegate resume/recovery works unless you validated a real delegate/resume flow against live persisted teammate sessions.
