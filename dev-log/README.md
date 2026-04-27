# Dev Log — Coastal Telemetry Interface

This folder contains the development history for the Coastal Telemetry Interface (CTI) project. Each entry is a timestamped markdown file recording one AI-assisted work session. The purpose is to build an accurate, detailed, gapless history that can later be mined for portfolio notes.

---

## Rules

1. One new file per session. Never append to an existing file.
2. Timestamps are always GMT/UTC. Never estimate, guess, or reuse a prior timestamp.
3. The timestamp is always obtained from the terminal at the start of each log — before reading any prior log or writing anything.
4. Filenames use the format `YYYY-MM-DD-HHMM.md` exactly, derived from the terminal output.
5. Every entry must reference the previous log file by name to enforce continuity.
6. Chat history is the primary source of truth for what happened in the session. The prior log is read only to find the last recorded boundary.
7. Entries must be detailed enough to reconstruct the session without the chat.
8. Vague bullets are not acceptable. Every point must include what was done, why, and what the outcome was.

---

## Step-by-Step Procedure for "make a dev log"

Follow these steps in order. Do not skip or reorder them.

### Step 1 — Get GMT/UTC timestamp from terminal (do this first, before anything else)

Run this command in the terminal and record the output:

```powershell
powershell -Command "(Get-Date).ToUniversalTime().ToString('yyyy-MM-dd-HHmm')"
```

The output is the filename for this log entry, e.g. `2026-04-21-1430.md`. Use it exactly. A wrong timestamp corrupts the chronological record and makes continuity checks unreliable.

### Step 2 — Find the most recent prior log

List all `.md` files in `dev-log/` excluding `README.md`. The file with the lexicographically latest name is the most recent log. Record its filename for use in Step 4.

If no prior log exists, record `None`.

### Step 3 — Read the prior log

Read the most recent log file in full. The goal is only to identify the last recorded boundary: what was the last thing completed, and where did the session end? Do not copy or summarise the prior log into the new entry — only use it to avoid gaps and avoid duplication.

Skip this step if no prior log exists.

### Step 4 — Write the new log file

Create a new file named `<timestamp-from-step-1>.md` in `dev-log/`. Populate it using the template below. Draw content from the current chat history. Use the prior log boundary from Step 3 to frame the "Since Last Log" section.

---

## Entry Template

Copy this structure exactly for every new log file. All headings are required. Do not remove or rename any heading.

```markdown
# Dev Log — YYYY-MM-DD-HHMM (GMT/UTC)

**Project:** Coastal Telemetry Interface  
**Previous log:** `YYYY-MM-DD-HHMM.md` (or `None` if first entry)  
**Session scope:** One-line description of what this session covered.

---

## Since Last Log

Narrative bridge from the previous entry boundary to this session start. Keep this short (3-6 sentences).  
**Use this for:** continuity only (what changed since prior log closed).  
**Do not use this for:** detailed task lists (put those in Work Completed).  
If this is the first log, describe the project state at the point of first recording.

---

## Work Completed

Group completed work under sub-headings by feature, fix, or task area. For each item include:
- What was done
- Why it was done (decision rationale)
- The outcome or result
If the session changed measurable behavior (for example API call volume, latency, coverage, or test pass counts), include the relevant before/after numbers inline with the outcome.
**Use this for:** detailed execution record.

---

## Technical Decisions and Trade-offs

Record any choices made during the session that have non-obvious rationale or long-term consequences. For each decision include:
- What was decided
- What alternatives were considered
- Why this option was chosen
**Use this for:** intentional choices between options.  
**Do not use this for:** incident/debug narratives (put those in Problems Encountered).

---

## Commands and Tests Run

List any commands executed, tests run, or tools used, with their results. Include failures and partial outputs where relevant.

---

## Problems Encountered

Describe any blockers, unexpected behaviour, or unresolved issues encountered. Include:
- What the problem was
- How it was diagnosed
- How it was resolved (or current status if unresolved)
**Use this for:** obstacles and troubleshooting outcomes.

---

## Portfolio Value Notes

Explain why the work done in this session is relevant to a professional portfolio. Consider:
- How does this session advance the overall project story?
- What concrete project outcomes now exist because of this session?
- Why those outcomes matter for a reviewer evaluating impact?
Where available, support impact claims with concise quantitative evidence.
**Use this for:** short narrative impact summary (2-4 bullets).  
**Do not repeat here:** skill/approach/character tags from Highlight Flags.

---

## Highlight Flags

Flag this session for standout signals that are useful in interviews, resumes, and case-study writeups. Include:
- **Skill signal:** Specific technical ability demonstrated (for example API integration, data modelling, debugging depth).
- **Approach signal:** Useful working method shown (for example decomposition, test-first thinking, evidence-based decisions).
- **Character signal:** Professional trait demonstrated (for example ownership, persistence, communication quality, judgement under uncertainty).
- **Employer relevance:** One sentence on why these signals matter in a real team setting.

---

## Next Actions

List the concrete next steps to be taken in the following session. These should be specific enough to resume work without re-reading the full log.
```

---

## Quality Bar

Before finalising an entry, verify:

- [ ] Terminal GMT/UTC timestamp was obtained first and used as the filename
- [ ] Previous log filename is correctly referenced (or `None`)
- [ ] "Since Last Log" closes the gap from the prior entry without overlap or duplication
- [ ] Every completed item includes what, why, and outcome
- [ ] Decisions include rationale and alternatives considered
- [ ] Any unresolved problems are noted with current status
- [ ] Quantitative outcomes are included when the session produced measurable changes
- [ ] Portfolio Value Notes focus on project impact, not repeated trait tags
- [ ] Highlight Flags are present and tied to concrete evidence from the session
- [ ] Next Actions are specific enough to act on immediately

---

## File Naming Reference (GMT/UTC)

| Component | Format | Example |
|---|---|---|
| Year | `YYYY` | `2026` |
| Month | `MM` | `04` |
| Day | `DD` | `21` |
| Hour (24h) | `HH` | `14` |
| Minute | `MM` | `30` |
| Full filename | `YYYY-MM-DD-HHMM.md` | `2026-04-21-1430.md` |

Files sort chronologically by filename. Never pad, abbreviate, or alter the format.
