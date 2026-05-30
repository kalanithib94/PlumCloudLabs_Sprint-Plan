# Cursor prompt: Brain dump → Sprint Planner JSON

Use the **"Copy Cursor prompt"** button next to the brain dump in the planner —
it copies this template with **your current plan already filled in** plus any
notes you typed. Paste it into Cursor chat, hit Send, then take the JSON Cursor
replies with and click **Paste JSON from Cursor** in the sticky action bar (above Brain dump).

**Jira data:** In ROVO, ask (change the epic name per sprint):

`List all child items of the epic "EE Sprint 04" as a table with these columns: Key, Summary, Type, Status, Priority, Assignee, Reporter, Due Date, Created, Updated, Assignee-V2, Co-Assignee-V2, Story Point Estimate`

Export as CSV → **Import CSV** in the planner. Map **Assignee-V2** for matching.

**Brain dump format** (plain English, one change at a time):

```
V2-8748 Review Test Scripts is shared, not personal.
Split 64h between Piyush Pandey (24h) and Ramesh Mandava (40h).

V2-8749 — Vusion Hypercare
Split 30h equally between Jeevan and kalanithi
Remove V2-8748 from Piyush's personal list.
```

---

You are a sprint planning assistant. You receive the planner's **current state**
(JSON below) and **instructions** from the manager. Return an updated plan as JSON.

**When current state is present (usual case after CSV import):**
- Treat the current state as the starting plan — do not discard imported JIRAs.
- Apply only the changes described in the instructions (brain dump).
- Common rearrangements:
  - Move a personal JIRA to `sharedJiras` with `splits` — **remove it** from that
    person's `assignments` (shared rows are auto-derived by the planner).
  - Adjust hours, dates, leave days, or who works on what.
  - Split overloaded people by moving hours to teammates with capacity.
- Return the **complete** updated JSON (all team, assignments, sharedJiras).
- Keep `style` as `"perPerson"` unless instructions explicitly ask for phases.

**When starting from scratch** (empty assignments): build the plan from the
instructions using the schemas below.

Return **only valid JSON** — no prose, no markdown fences, no explanation.
If a field isn't mentioned in the instructions, keep it from the current state.
Never invent JIRAs that aren't in the current state or instructions.

## Common fields (used by both structures)

```json
{
  "companyTeamId": "ee",
  "companyTeamLabel": "EE",
  "sprint": {
    "name":      "Sprint N — Release Plan",
    "number":    "N",
    "startDate": "YYYY-MM-DD",
    "endDate":   "YYYY-MM-DD",
    "workingDaysOverride": ""
  },
  "team": [
    { "name": "Piyush P", "leaveDays": 0, "allocationPct": 100, "notes": "" }
  ],
  "brainDump": "free text or empty"
}
```

Notes:
- 1 working day = 8 hours.
- `workingDaysOverride` is only set when the dump mentions a public holiday or
  reduced working days (e.g. `"9"` for one holiday in a fortnight). Leave empty
  to let the planner auto-compute from `startDate`/`endDate` (weekends excluded).
- `availableHours = (workingDays - leaveDays) * 8 * allocationPct / 100` is
  computed by the planner — never include it in JSON.

## Structure A — Phases

Use when the sprint runs as the same set of phases (e.g. QA → Beta → Regression)
with the team participating in each, varying only by allocation %. Phase dates
live on the **phase**, not per person.

```json
{
  "... common fields ...": "...",
  "style": "phases",
  "phases": [
    {
      "phaseName": "QA Testing",
      "startDate": "2026-06-15",
      "endDate":   "2026-06-18",
      "assignments": [
        { "personName": "Piyush Pandey", "allocationPct": 100 },
        { "personName": "Manupriya", "allocationPct": 100 },
        { "personName": "Jeevan Saravanan", "allocationPct": 70 }
      ]
    }
  ]
}
```

- Per-row hours = `workingDays(phase.start, phase.end) * 8 * allocationPct / 100`,
  rounded to the nearest 0.5 by the planner.
- Don't put `startDate`/`endDate` on individual `assignments` — only on the phase.

## Structure B — Per-Person JIRAs

Use when each teammate has their own list of JIRAs, plus optional shared JIRAs
where hours are split **per person** (not necessarily equally).

```json
{
  "... common fields ...": "...",
  "style": "perPerson",
  "sharedJiras": [
    {
      "jira": "SFDC-123 — Beta regression",
      "totalHours": 40,
      "startDate":  "2026-06-22",
      "endDate":    "2026-06-25",
      "splits": { "Piyush Pandey": 16, "Manupriya": 4, "Kesavanmurthy K": 20 }
    }
  ],
  "assignments": {
    "Piyush Pandey": [
      { "jira": "PERF-123", "hours": 16, "startDate": "2026-06-15", "endDate": "2026-06-16" }
    ],
    "Manupriya": [
      { "jira": "DOC-9",    "hours": 8,  "startDate": "2026-06-17", "endDate": "2026-06-17" }
    ]
  }
}
```

Rules:
- `splits` is a map `{ memberName: hours }`. Only include members who are
  actually working on that JIRA. The sum of `splits` *should* equal
  `totalHours`, but doesn't have to — the planner flags the gap visually.
- For shared JIRAs, the planner auto-creates locked derived rows inside each
  person's card with `hours = splits[personName]`. Do **not** duplicate the
  shared JIRA into `assignments` — list only their *individual* JIRAs there.
- `phases` is not used in this style.

## Rearranging after CSV import (example)

If V2-8748 landed under one person but should be shared:

```json
"sharedJiras": [
  {
    "jira": "V2-8748 — Review Test Scripts",
    "totalHours": 64,
    "startDate": "",
    "endDate": "",
    "splits": { "Piyush Pandey": 32, "Manupriya": 32 }
  }
],
"assignments": {
  "Piyush Pandey": [ /* other JIRAs only — NOT V2-8748 */ ],
  "Manupriya": [ /* other JIRAs only */ ]
}
```

The sum of `splits` should equal `totalHours`. Use exact team names from the
current state.

## Current planner state

```json
<CURRENT PLANNER STATE>
```

## Instructions (brain dump)

---
<PASTE YOUR DICTATION HERE>
