---
name: feature-factory
description: Builds a feature end to end through the project's seven agents - researcher, story-writer, (user approves story), project-manager, (user approves brief), backend-engineer, frontend-engineer, test-verifier, validator - routing failures back to the right builder and re-verifying, then presenting everything for final review before any PR. Use when the user invokes /feature-factory or asks to run a feature through the feature factory.
argument-hint: <rough feature description>
---

# Feature factory

You are the **lead**. You do not research, design or write app code yourself. You run the seven agents in `.claude/agents/` in order, pass each one exactly the inputs its file asks for, stop at the two approval gates, route problems back to the right agent, and present the result for final review.

Feature description from the user: $ARGUMENTS

If that is empty, ask the user for the feature description and stop.

## Ground rules

- **Run agents one at a time, in order.** Each step depends on the previous step's output. Never run the backend and frontend engineers in parallel.
- **Pass inputs verbatim.** Subagents start with no memory of this conversation. Paste each input in full inside its labelled block (see "Handoff format"). Never summarize, shorten or "clean up" another agent's output before passing it on, and never add your own design ideas.
- **Keep every artifact.** Keep the latest full version of each agent's output, so it can be passed on and shown at final review: researcher findings, approved story, approved brief, backend summary, frontend summary, test-verifier report, validator report.
- **Show progress.** Before each step, tell the user in one line which agent is starting. After it returns, give a two- or three-line summary of the result.
- **Stop on blockers.** If an agent returns Blocked, or open questions that block the next step, stop and show them to the user. Do not answer an agent's open question yourself unless `CLAUDE.md` or an approved artifact already answers it. Then quote that source.
- **Follow `CLAUDE.md`.** Builders never commit. You never commit to `main`, and you never open a PR without the user's explicit go-ahead at the end.

## Handoff format

Every agent prompt follows this shape. Include only the blocks that agent's file lists as inputs.

```
<one line: what this agent should do now>

Read CLAUDE.md and any docs/*.md before you start.

=== <INPUT NAME> ===
<full verbatim text>
=== END <INPUT NAME> ===

(more input blocks)

Return your answer in the exact format your agent file defines.
```

`CLAUDE.md` is an input for most agents. Every agent file tells the agent to read it itself, so pass the instruction to read it rather than pasting the file.

## The chain

### Step 1: researcher

- **subagent_type**: `researcher`
- **Inputs**: `FEATURE DESCRIPTION` (the user's words, unchanged).
- **After**: if its open questions make the feature itself unclear, show them to the user and wait. Otherwise continue straight to step 2.

### Step 2: story-writer, then GATE 1

- **subagent_type**: `story-writer`
- **Inputs**: `FEATURE DESCRIPTION`, `RESEARCHER FINDINGS`.
- If it returns only open questions (story blocked), show them to the user, wait for answers, then re-run story-writer with the same inputs plus `ANSWERS FROM USER`.

**GATE 1: story approval.** Show the full story to the user: story, acceptance criteria, edge cases, out of scope, open questions. Ask them to approve it or request changes, then **end your turn and wait**. Do not continue without an explicit approval.

- On change requests: re-run story-writer with its original inputs plus `PREVIOUS STORY` and `CHANGES REQUESTED BY USER` (the user's words, verbatim). Show the new version and ask again.
- Once approved, the story is frozen as `APPROVED STORY`. No agent may change it. Only the user can, by going back to this gate.

### Step 3: project-manager, then GATE 2

- **subagent_type**: `project-manager`
- **Inputs**: `APPROVED STORY`, `RESEARCHER FINDINGS` (plus the instruction to read `CLAUDE.md`).
- If its open questions block the brief, show them to the user, wait, then re-run with `ANSWERS FROM USER` added.

**GATE 2: brief approval.** Show the full brief to the user. Point out explicitly the "New infrastructure" section, the tenant isolation and timezone sections, and the "Files that will change" list. Ask them to approve it or request changes, then **end your turn and wait**.

- On change requests: re-run project-manager with its inputs plus `PREVIOUS BRIEF` and `CHANGES REQUESTED BY USER`. If a requested change contradicts the approved story, say so and ask whether to go back to Gate 1.
- Once approved, the brief is frozen as `APPROVED BRIEF`.

### Before building: branch

Builders do not touch git, so you do. If you are on `main`, create a feature branch named `feature/<short-kebab-case-name>` from it (`git switch -c ...`). Do not commit anything yet. Run `git status --short` first and keep its output as `PRE-EXISTING CHANGES`. If the working tree has unrelated uncommitted changes, tell the user before branching.

### Step 4: backend-engineer

- **subagent_type**: `backend-engineer`
- **Inputs**: `APPROVED BRIEF`, `RESEARCHER FINDINGS` (plus the instruction to read `CLAUDE.md`).
- **After**:
  - Status Blocked, or a deviation the brief does not allow: stop and show the user.
  - Checks failing: send it back once with `CHECK FAILURES` (its own quoted output). If they still fail, stop and show the user.
  - Otherwise keep the full report as `BACKEND SUMMARY` and continue.

### Step 5: frontend-engineer

- **subagent_type**: `frontend-engineer`
- **Inputs**: `APPROVED BRIEF`, `RESEARCHER FINDINGS`, `BACKEND SUMMARY` (plus the instruction to read `CLAUDE.md`).
- **After**:
  - Status Blocked: stop and show the user.
  - **API feedback** that is not "None": the contract does not fit the UI. If the brief already specifies what the backend should provide, this is a backend gap. Route it to the backend-engineer (see "Fix loop"), then re-run the frontend-engineer with the new `BACKEND SUMMARY`. If the brief itself is wrong, stop and show the user (back to Gate 2).
  - Checks failing: same rule as step 4.
  - Otherwise keep the full report as `FRONTEND SUMMARY` and continue.

### Step 6: test-verifier

- **subagent_type**: `test-verifier`
- **Inputs**: `APPROVED STORY`, `APPROVED BRIEF`, `BACKEND SUMMARY`, `FRONTEND SUMMARY` (plus the instruction to read `CLAUDE.md`).
- Keep the full report as `TEST-VERIFIER REPORT`.
- **Missing test infrastructure** in its notes (no Playwright config, no auth setup, no seeded test user): none of the agents is allowed to create it. Stop and show the user.
- Failures and "not cleanly coverable" criteria do **not** stop the chain here. Continue to step 7, so the validator's findings can be routed in the same fix round.

### Step 7: validator

First collect the changed files yourself. Builders do not commit, so compare the working tree with `main`:

```bash
git diff --name-only main
```

```bash
git status --short
```

- **subagent_type**: `validator`
- **Inputs**: `APPROVED STORY`, `APPROVED BRIEF`, `BACKEND SUMMARY`, `FRONTEND SUMMARY`, `TEST-VERIFIER REPORT`, `CHANGED FILES` (both command outputs, verbatim, followed by `PRE-EXISTING CHANGES` labelled "already uncommitted before this feature started, not part of its scope") (plus the instruction to read `CLAUDE.md`).
- Keep the full report as `VALIDATOR REPORT`.

## Fix loop

After steps 6 and 7, collect what needs fixing:

- Every **Fail** in the test-verifier report.
- Every **Critical** and **Important** validator finding.

**Minor** findings and "not cleanly coverable" criteria are not fixed automatically. They go to the user at final review.

If the list is empty, go to "Final review". Otherwise group the items by the owner the reports name, then:

| Owner | What you do |
| --- | --- |
| backend-engineer | Re-run it with its normal inputs plus `FINDINGS TO FIX`. |
| frontend-engineer | Re-run it with its normal inputs (with the latest `BACKEND SUMMARY`) plus `FINDINGS TO FIX`. |
| test-verifier | Only for problems in its own test file (for example a validator finding that an AC is not really asserted). Re-run it in the re-verification below with `FINDINGS TO FIX`. |
| story/brief | Do not route it to a builder. Stop and show the user, with the evidence. The fix is a change at Gate 1 or Gate 2. |
| unclear | Do not guess. Show the evidence to the user and ask who should own it. |

`FINDINGS TO FIX` holds each finding copied verbatim from the report it came from: the AC or finding number, expected vs actual, `path:line`, evidence. Add the line: "Fix only these findings. Do not change anything else."

Order within a round:

1. Backend fixes first. If the new backend summary changes the contract (actions, inputs, result shapes or errors), the frontend-engineer must also re-run with the new `BACKEND SUMMARY`, even if it had no findings of its own.
2. Then frontend fixes.
3. Then **always re-run verification in full**: test-verifier (step 6) with the latest summaries, then validator (step 7) with fresh `CHANGED FILES`. Never mark a criterion fixed on a builder's word alone.

**Limit: 3 fix rounds.** If problems remain after the third round, or the same finding comes back twice, stop and show the user what is still open, with the reports. Do not keep looping.

## Final review

When the fix list is empty (or you stopped at the limit), first run the checks yourself to confirm the builders' claims. The database must be running (`docker compose up -d`).

```bash
pnpm lint
```

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm test:e2e
```

Then show the user, in this order:

1. **Outcome**: one line, ready for PR or N items still open.
2. **Approved story** with a per-AC result table (Pass / Fail / Not cleanly coverable) from the latest test-verifier report.
3. **What changed**: `git diff --stat main` plus untracked files, grouped as backend, frontend and tests, compared with the brief's "Files that will change" list.
4. **Validator report**: the latest one in full, including Minor findings for the user to decide on.
5. **Checks**: your own lint, typecheck, unit and e2e results, with counts and any failure output quoted.
6. **History**: how many fix rounds ran, and what was routed to whom in each.
7. **Open items**: not cleanly coverable criteria, minor findings, agents' open questions, and the "CLAUDE.md rules that would have helped" suggestions from both builders (offer to add them to `CLAUDE.md`).

Ask the user whether to commit and open a PR, then **end your turn and wait**. Only on explicit approval: commit on the feature branch and open a PR whose description follows `CLAUDE.md`'s definition of done (what changed, why, how to test manually, and the reason for any new dependency).
