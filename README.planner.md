# Sprint Planner — Local App

## Checkpoints

| CP | Status | Scope |
|----|--------|--------|
| **CP1** | Done | Multi-team tabs (Dev, Marketing, EE, Hynoyo), per-team storage |
| **CP2** | Done | Theme polish, HTML round-trip, sticky bar, auto-save, in-app ROVO guide |
| **CP3** | **Done** | Full user guide (preview in new tab), full-width layout, production deploy at [plum-cloud-labs-sprint-plan.vercel.app](https://plum-cloud-labs-sprint-plan.vercel.app/) |

A pastel, voice-friendly bi-weekly sprint planner. Two structural styles:

- **Phases**: phase cards, each with a sub-table of per-person assignments (different allocation %, start/end per person within the same phase).
- **Per-Person JIRAs**: one card per teammate with their own JIRA list, plus a Shared JIRAs section that auto-splits equally across selected members.

Pick the structure in the "Sprint structure" card near the top of the page. Each saved sprint remembers its structure.

## Open the app

**Production (team use):** [https://plum-cloud-labs-sprint-plan.vercel.app/](https://plum-cloud-labs-sprint-plan.vercel.app/)

Open in **Chrome** or **Edge** (needed for dictation and CSV import). No install, no build, no API keys. Plans save in your browser (`localStorage`) on that device.

**User guide:** expand **How it works** → **Preview user guide** (opens in a new tab; use **Print / Save as PDF** there if needed). Or open `/user-guide.html` on the same site.

### Local development only

1. From the project root:

   ```powershell
   python -m http.server 8080
   ```

2. Open:

   ```
   http://localhost:8080/planner/index.html
   ```

## How it works

- **Sprint header**: name, number, start date. End date auto-fills to start + 13 days (2-week sprint, including weekends). Working days excludes weekends.
- **Team**: name, leave days, allocation %. Available hours auto-compute at **8h × (working days − leave days) × alloc % / 100**.
- **Brain dump**: free notes with a mic button (Web Speech API).
- **Feasibility strip**: live per-person pills colored green (<80%), amber (80–100%), rose (>100%). Click **Run feasibility check** to scroll to the first over-booked teammate.
- **Phases structure**: `+ Add phase` creates a pastel card. Inside, `+ Add person` adds a row with `Alloc %`, `Start`, `End`, and an auto-computed `Hours`. Phase total updates live.
- **Per-Person structure**:
  - **Shared JIRAs** at the top: enter a JIRA, total hours, dates, and check the members it applies to. The planner auto-creates a locked row in each chosen person's card with `totalHours / memberCount` hours and a `shared` pill.
  - **Person cards**: one per teammate. `+ Add JIRA` adds a row (JIRA, hours, start, end). Shared rows are locked on hours and JIRA name but you can edit per-person start/end.
- **Vacations & new joiners**: leave days reduce available hours immediately. Adding a teammate mid-sprint adds them to the feasibility strip, person cards, Shared JIRA member chips, and Phase person dropdowns automatically.
- **Actions** (bottom of the page):
  - **New** → clears the form (prompts first).
  - **Save** → stores under the sprint name in `localStorage` (key `sprintPlanner.v2`).
  - **Download HTML** → saves `sprint-NN-release-plan.html` standalone (theme inlined).
  - **Preview** → opens the generated plan in a new tab.
- **Saved sprints strip** (appears below the action bar only when you have 2+ saved sprints): click a chip to switch, ✕ to delete. The most recently saved sprint auto-loads on page open.

## Project conventions

This repo has two cross-cutting conventions enforced by the Cursor agent:

1. **Project rules** in [`.cursor/rules/sprint-planner.mdc`](.cursor/rules/sprint-planner.mdc) — coding standards, pastel-only theme, two-styles invariant, 8h/day constant.
2. **Daily conversation log** in [`conversations/`](conversations/) — one MD file per local date. The post-turn Cursor hook in [`.cursor/hooks.json`](.cursor/hooks.json) appends each turn **verbatim** (no summaries). The rule mandates reading today's file before every response.

If the hook ever stops firing, manually append the relevant exchange to today's file (`conversations/YYYY-MM-DD.md`).

## Files

```
Sprint plan/
  planner/
    index.html         App shell + form UI
    styles.css         Pastel editor theme
    app.js             State, mic, save/load, preview/download
    generator.js       renderSprintHtml(state) -> standalone pastel HTML
    prompt-template.md Cursor-ready prompt: brain dump -> JSON for both styles
  conversations/
    YYYY-MM-DD.md      Daily exact conversation log (auto-appended by hook)
  .cursor/
    rules/sprint-planner.mdc   Project rules
    hooks.json                 Post-turn hook config
    hooks/append-conversation.ps1  PowerShell appender
  sprint-03-release-plan.html  Existing dark reference (untouched)
  Sprint Plan.txt              Original brain-dump notes (untouched)
  README.planner.md            This file
```

## Browser support

- **Chrome / Edge**: full features including speech-to-text.
- **Firefox**: works but no dictation.
- **Safari**: dictation flaky.

## Speech-to-text

Uses the browser's built-in [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API). Speech is processed by the browser/OS — nothing leaves your machine via this app.

## Deploy to Vercel (production)

Local work stays local until you validate and run the deploy script.

1. **One-time:** create GitHub repo [PlumCloudLabs_Sprint-Plan](https://github.com/kalanithib94/PlumCloudLabs_Sprint-Plan), connect it in [Vercel](https://vercel.com) (Import → Production branch = `main`, root `vercel.json` sets `outputDirectory: planner`).
2. **One-time:** from `Sprint plan/` folder:
   ```powershell
   git init
   git branch -M main
   git remote add origin https://github.com/kalanithib94/PlumCloudLabs_Sprint-Plan.git
   ```
3. **Each release** (after local validation):
   ```powershell
   cd "Sprint plan"
   powershell -ExecutionPolicy Bypass -File scripts/deploy-to-vercel.ps1
   ```
   Runs tests → asks for confirmation → commits deployable files only → `git push origin main` → Vercel builds production.

Production URL: **https://plum-cloud-labs-sprint-plan.vercel.app/** (`localStorage` is per browser/device — same as local).

Manual CLI deploy (without git push): `vercel --prod --yes` from `Sprint plan/` (requires `vercel link` once).
