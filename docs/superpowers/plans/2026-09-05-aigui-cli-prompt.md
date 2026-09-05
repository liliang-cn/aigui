# `@ai-gui/cli` (`aigui prompt`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npx @ai-gui/cli prompt` writes the exact `buildSystemPrompt` string from a JSON config or flags, so non-Node backends can read it from a file.

**Architecture:** A catalog maps plugin names to lazy factories; a config module validates JSON and merges flags; a build module turns the config into a `CardRegistry`, an action runtime, plugin instances and one `buildSystemPrompt` call; a thin `run(argv, io)` is the CLI with injectable IO so tests never spawn a process.

**Tech Stack:** TypeScript, Node `util.parseArgs`, `@ai-gui/core` + every `@ai-gui/plugin-*`, vitest, tsdown (two entries: `index`, `cli`).

Spec: `docs/superpowers/specs/2026-09-05-aigui-cli-prompt-design.md`.

### Task 1: Scaffold
- [ ] `packages/cli/{package.json (bin, files incl. bin/), tsconfig.json, tsdown.config.ts (entry index+cli), bin/aigui.js, LICENSE, README.md}`; deps: core + all 27 plugins.
- [ ] vitest alias/project `cli`; changeset fixed group + `.changeset/cli.md` (minor); `pnpm install`. Commit.

### Task 2: catalog (TDD)
- [ ] `catalog.test.ts`: names match `packages/plugin-*` dirs; each factory yields a plugin with `name`; `ui`/`form`/`flashcards`/`artifact` receive ctx.
- [ ] Implement `catalog.ts`. Commit.

### Task 3: config (TDD)
- [ ] `config.test.ts` per spec. Implement `config.ts`. Commit.

### Task 4: build (TDD)
- [ ] `build.test.ts` per spec. Implement `build.ts`. Commit.

### Task 5: cli (TDD)
- [ ] `cli.test.ts` per spec. Implement `cli.ts`, `index.ts`, `bin/aigui.js`. Build; run `node packages/cli/bin/aigui.js prompt --plugins graph` by hand. Commit.

### Task 6: docs
- [ ] README tables + section, AGENTS.md note, package README. `pnpm build && pnpm typecheck && pnpm test:unit && pnpm validate:packages`. Commit.
