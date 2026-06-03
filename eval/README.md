# Delegation routing evaluation

A reproducible A/B harness that measures whether the delegation **prompt wording**
(injected `<delegation_policy>` block + `delegate` tool description/guidelines) actually
improves an agent's **routing decisions** — not just whether `delegate` gets used, but
whether it routes work to the right mode:

- independent subtasks → one **parallel** `tasks` call
- a dependent pipeline → one **chain** call (with `{previous}`)
- one isolated subtask → **single**
- trivial / pure-judgment work → **no delegation**

## Why this exists

Teammates worked, but agents tended to delegate **sequentially**, one subtask per call,
serializing work that could run concurrently. The June 2026 prompt changes lead with
*decompose-then-batch / parallel-first*, add a per-member `context` attribute, and add an
explicit "collapse multiple calls into one `tasks` call" instruction. This harness checks
that those changes are **valuable and effective**, by comparing them head-to-head against
the previous wording on identical scenarios.

## How it works

`delegation-routing-eval.ts` presents a model the **real** `delegate` tool schema and the
injected system-prompt block, then captures the tool calls it emits on turn 1 and scores the
routing against each scenario's known-correct decomposition. The **only** variable between the
two arms is the prompt wording — the tool schema, base prompt, scenarios, model, and reasoning
level are identical. Scenarios are deliberately **investigation-free** (named targets, explicit
independence/dependency) so the decision under test is *how to route*, not *should I scout first*.

```bash
# default: deepseek/deepseek-v4-flash:high, 5 samples per cell
tsx eval/delegation-routing-eval.ts
# custom model / sample count, with DUMP=1 to print raw tool-call arguments
DUMP=1 tsx eval/delegation-routing-eval.ts deepseek/deepseek-v4-flash:high 5
```

Scoring is per-response (see `scoreResponse`): a parallel scenario scores 1.0 only for a single
`tasks` call with ≥ the expected item count, and the multi-separate-single-calls anti-pattern is
explicitly penalized (0.3). Chain requires one `chain` call with `{previous}`; "none" requires
zero delegate calls.

## Results (deepseek/deepseek-v4-flash:high, N=5/cell, clean scenario set)

```
class        OLD    NEW    Δ
parallel     0.27   0.59   +0.33
chain        1.00   0.97   -0.03   (noise; OLD already optimal on genuine pipelines)
single       1.00   1.00   +0.00
none         1.00   1.00   +0.00
OVERALL      0.68   0.81   +0.14   (~20% relative)
```

Per-scenario highlights:

- **P4 audit 3 named modules:** 0.28 → **1.00** (+0.72). OLD routinely emitted 3 separate
  single calls (the exact anti-pattern); NEW reliably batches into one `tasks` call.
- **P3 generate 3 independent artifacts:** 0.30 → **0.80** (+0.50).
- **P1/P2 read/summarize 2–3 named files:** ~flat. Here the model rationally **lumps** cheap
  reads into one scout call rather than spinning up N sessions — a defensible efficiency choice,
  not a failure. The parallel wording pays off on *substantive* independent work, not trivial reads.

## Takeaways that shaped the wording

1. **Parallel is the real win.** The largest, most consistent gains are on substantive
   independent work — exactly the "agents serialize and are slow" problem.
2. **No collateral damage.** Aggressively pushing parallel did **not** cause over-delegation of
   trivial tasks (`none` stayed 1.00) or break single/chain routing.
3. **Chain is rarely the first move.** On realistic "investigate then fix / plan then implement"
   prompts (earlier scenario set), agents correctly **scout first** instead of committing to a
   pipeline blind — so `chain` matters mainly for *pre-decided* pipelines, where both arms already
   route well. This is reflected in the teammate-recruiting guidance: prefer `new`/parallel; reach
   for `chain` only when the steps and their dependency are known up front.
4. **The residual anti-pattern** (multiple single calls in one turn for independent work) drove the
   explicit "collapse them into a single `tasks` call" guideline added to the policy block and tool
   guidelines.

Raw run logs are git-ignored (regenerable); re-run the harness to reproduce.

## Real multi-turn validation (`pi -p --mode json`)

The harness above is single-turn (it captures the model's first response). To confirm the routing
gains survive the **real agent loop** — where the orchestrator actually executes delegations across
turns — five live runs were done against this repo with the teammates extension loaded.
`scan-real-run.py` extracts the delegate calls (and their mode) from the JSON event stream.

| run | scenario | orchestrator | result |
|---|---|---|---|
| 1 | summarize 3 named files (natural phrasing) | deepseek-v4-flash:high | **no delegation** — read the 3 files itself (correct restraint; trivial work) |
| 2a | audit 3 modules (natural phrasing) | deepseek-v4-flash:high | self-handled / single — never the sequential anti-pattern |
| 2b | audit 3 modules (delegation forced) | deepseek-v4-flash:high | **one `tasks[3]` parallel call → reviewer ×3** ✓ |
| 2c | audit 3 modules (delegation forced) | github-copilot/gpt-5.5 | **one `tasks[…]` parallel call → reviewer per file** ✓ (holds on a stronger orchestrator) |
| 3 | 2-step dependent pipeline (forced) | deepseek-v4-flash:high | **one `chain[2]` call → scout → reviewer, step 2 uses `{previous}`** ✓ |

Takeaways:

- The single-turn prediction holds in production: when delegating genuinely independent work, the
  orchestrator emits **one batched `tasks` call** rather than several sequential single calls — on
  both a mid-tier and a stronger orchestrator.
- Restraint also holds: on trivial/natural-phrasing work the orchestrator does it inline rather than
  over-delegating.
- `chain` + `{previous}` routes correctly for genuinely dependent pipelines.

### ⚠️ Operational finding: `--mode json` output blowup with parallel children

One uncapped parallel run produced an **11 GB** JSON stream and OOM-crashed Node. Cause: the extension
streams the full accumulated child message array via `onUpdate` on every child event, and pi's `json`
mode re-serializes that growing payload on each `message_update` — roughly O(updates × transcript
size), which explodes when several verbose children stream concurrently. The TUI hides this (it
truncates on render), but the underlying per-update payload still grows.

This is a real efficiency issue worth a follow-up: throttle/coalesce `onUpdate`, or stream a truncated
preview / delta instead of the full child transcript. Until then, capture live `--mode json` runs
through a byte cap (`… | head -c 6000000`) so the turn-1 routing decision is recorded before the
stream balloons — which is how the runs above were captured safely.
