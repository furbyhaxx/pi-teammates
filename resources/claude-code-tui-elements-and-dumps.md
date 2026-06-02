# Claude Code TUI patterns


Finished multiple agents

```
● 3 Explore agents finished
   ├ Map pi tool factory & operations API · 30 tool uses · 73.3k tokens
   │ ⎿  Done
   ├ Map event bus & permission UI APIs · 30 tool uses · 65.1k tokens
   │ ⎿  Done
   └ Map config loading & multi-edit patterns · 27 tool uses · 55.6k tokens
     ⎿  Done
```

# Sub Agents

```
● Task tracking set up. Marking T0 in-progress and dispatching the first implementer
  subagent (scaffolding — mechanical, so sonnet):

  Agent(Implement Cycle1 Task 0: Scaffold) Sonnet 4.6
  ⎿  Update(package.json)
     Bash(npm run typecheck 2>&1)
     Running…
     Bash(git add package.json tsconfig.json .gitignore package-lock.json && git status)
     Running…
     … +13 tool uses
     (ctrl+b to run in background)
```

finished
```
● Agent(Implement Cycle1 Task 0: Scaffold) Sonnet 4.6
  ⎿  Done (17 tool uses · 15.6k tokens · 1m 39s)
```

## Explore

Running single agent
```
● Exploration gave me a strong map. One critical capability gap remains before I can design
  the LLM judge and command-splitter: how an extension makes its own model call. Let me
  close that quickly, then move to clarifying questions.

  Explore(Find how extensions make LLM calls)
  ⎿  Bash(grep -B 30 "interface ExtensionCommandContext" /home/arnold/.asdf/installs/nodejs
         /24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/…)
     Running…
     Bash(grep -A 30 "^export interface ExtensionContext[^A-Z]" /home/arnold/.asdf/installs
         /nodejs/24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/exte…)
     Running…
     Read(~/.asdf/installs/nodejs/24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/
         node_modules/@earendil-works/pi-ai/dist/stream.d.ts)
     … +32 tool uses
     (ctrl+b to run in background)
```
Finished single agent
```
● Exploration gave me a strong map. One critical capability gap remains before I can design
  the LLM judge and command-splitter: how an extension makes its own model call. Let me
  close that quickly, then move to clarifying questions.

● Explore(Find how extensions make LLM calls)
  ⎿  Done (35 tool uses · 73.3k tokens · 1m 8s)
```


```
```
```

# Task/Todo status display
```
✶ Exploring project context… (5m 12s · ↓ 26.7k tokens · thinking with medium effort)
  ⎿  ◼ Explore project context
     ◻ Ask clarifying questions
     ◻ Propose approaches with trade-offs
     ◻ Present design sections for approval
     ◻ Write and commit design doc
      … +1 pending

───────────────────────────────────────────────────────────────────────────────────────────
❯ 
───────────────────────────────────────────────────────────────────────────────────────────
  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt · ctrl+t to hide tasks
```

```
  6 tasks (3 done, 1 in progress, 2 open)
  ◼ Present design sections for approval
  ◻ Write and commit design doc
  ◻ Transition to writing-plans
  ✔ Explore project context
  ✔ Ask clarifying questions
   … +1 completed
```




# Questions

## Asking

Inital Question selected (includes the status display below that is not from the question display itself)
```
───────────────────────────────────────────────────────────────────────────────────────────
 ☐ Config file

Where does pi-wookiee's config live, and how does it relate to pi's native settings.json?

 1. Separate settings.yaml,       ┌─────────────────────────────────────────────────────┐
   two scopes                     │ GLOBAL  $PI_CODING_AGENT_DIR/settings.yaml          │
  2. Namespaced wookiee.yaml      │ PROJECT ./.pi/settings.yaml      (project wins)     │
  3. Embed under pi's settings    │                                                     │
                                  │ pi's own settings.json is untouched & separate.     │
                                  │ Both files coexist in .pi/.                         │
                                  └─────────────────────────────────────────────────────┘

                                  Notes: press n to add notes

───────────────────────────────────────────────────────────────────────────────────────────
  Chat about this

Enter to select · ↑/↓ to navigate · n to add notes · Esc to cancel

  6 tasks (1 done, 1 in progress, 4 open)
  ◼ Ask clarifying questions
  ◻ Propose approaches with trade-offs
  ◻ Present design sections for approval
  ◻ Write and commit design doc
  ◻ Transition to writing-plans
   … +1 completed
```
Selected answer two
```
───────────────────────────────────────────────────────────────────────────────────────────
 ☐ Config file

Where does pi-wookiee's config live, and how does it relate to pi's native settings.json?

 1. Separate settings.yaml,       ┌─────────────────────────────────────────────────────┐
   two scopes                     │ GLOBAL  $PI_CODING_AGENT_DIR/wookiee.yaml           │
❯ 2. Namespaced wookiee.yaml      │ PROJECT ./.pi/wookiee.yaml        (project wins)    │
  3. Embed under pi's settings    │                                                     │
                                  │ Unambiguous: 'settings.json'=pi, 'wookiee.yaml'=us. │
                                  └─────────────────────────────────────────────────────┘

                                  Notes: press n to add notes

───────────────────────────────────────────────────────────────────────────────────────────
  Chat about this

Enter to select · ↑/↓ to navigate · n to add notes · Esc to cancel
```

Selected answer three
```
───────────────────────────────────────────────────────────────────────────────────────────
 ☐ Config file

Where does pi-wookiee's config live, and how does it relate to pi's native settings.json?

 1. Separate settings.yaml,       ┌─────────────────────────────────────────────────────┐
   two scopes                     │ .pi/settings.json                                   │
  2. Namespaced wookiee.yaml      │ {                                                   │
❯ 3. Embed under pi's settings    │   "defaultModel": "...",   ← pi                     │
                                  │   "wookiee": { permissions, tools }  ← us           │
                                  │ }                                                   │
                                  │                                                     │
                                  │ No YAML; one file.                                  │
                                  └─────────────────────────────────────────────────────┘

                                  Notes: press n to add notes

───────────────────────────────────────────────────────────────────────────────────────────
  Chat about this

Enter to select · ↑/↓ to navigate · n to add notes · Esc to cancel
```

Question with multiple questions
```
───────────────────────────────────────────────────────────────────────────────────────────
←  ☐ Perm merge  ☐ Write-back  ✔ Submit  →

The permissions block is order-sensitive ("evaluated top to bottom, last match wins"). How
should global + project permission rules combine across the two scopes?

 1. Global first, then project    ┌───────────────────────────────────────────────────────┐
   appended                       │ Evaluation order (paths):                             │
  2. Merge by pattern key         │   [global]  ~/: allow                                 │
  3. Project replaces block       │   [global]  ~/.env: deny                              │
                                  │   [project] ./secrets/: deny   ← appended last        │
                                  │   [project] ./build/**: allow                         │
                                  │                                                       │
                                  │ last match wins → project overrides global            │
                                  └───────────────────────────────────────────────────────┘

                                  Notes: press n to add notes

───────────────────────────────────────────────────────────────────────────────────────────
  Chat about this

Enter to select · ↑/↓ to navigate · n to add notes · Tab to switch questions · Esc to
cancel
```



## Answered

```
● User answered Claude's questions:
  ⎿  · Where does pi-wookiee's config live, and how does it relate to pi's native
     settings.json? → Separate settings.yaml, two scopes
```



# Skills

```
● Skill(superpowers:subagent-driven-development)
  ⎿  Successfully loaded skill
```


