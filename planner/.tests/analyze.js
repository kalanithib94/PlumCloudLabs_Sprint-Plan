// Compute expected feasibility for both scenarios.
// Cross-checked against the live planner via Puppeteer in the next step.

const fs = require("fs");
const path = require("path");
global.window = {};
eval(fs.readFileSync(path.join(__dirname, "..", "generator.js"), "utf8"));
const { PHASES_SCENARIO, PER_PERSON_SCENARIO } = require("./scenarios");

function wdBetween(a, b) {
  if (!a || !b) return 0;
  const A = new Date(a + "T00:00:00"), B = new Date(b + "T00:00:00");
  if (B < A) return 0;
  let n = 0;
  for (const d = new Date(A); d <= B; d.setDate(d.getDate() + 1)) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}
function sprintWD(s) {
  const ov = s.sprint.workingDaysOverride;
  if (ov !== "" && ov !== null && ov !== undefined && Number(ov) > 0) return Number(ov);
  const w = wdBetween(s.sprint.startDate, s.sprint.endDate);
  return w > 0 ? w : 10;
}
function avail(m, wd) { return Math.max(0, (wd - (Number(m.leaveDays) || 0)) * 8 * (Number(m.allocationPct) || 0) / 100); }
function phaseHours(p, row) { return Math.round(wdBetween(p.startDate, p.endDate) * 8 * (Number(row.allocationPct) || 0) / 100 * 2) / 2; }

function plannedFor(state, name) {
  if (state.style === "phases") {
    let s = 0;
    (state.phases || []).forEach((p) => (p.assignments || []).forEach((a) => {
      if (a.personName === name) s += phaseHours(p, a);
    }));
    return s;
  }
  // per-person: explicit assignments + shared JIRA splits (the planner derives the latter
  // into state.assignments via syncShared on import; we add them here for parity).
  let s = ((state.assignments || {})[name] || []).reduce((acc, r) => acc + (Number(r.hours) || 0), 0);
  (state.sharedJiras || []).forEach((sj) => {
    if (sj.splits && name in sj.splits) s += Number(sj.splits[name]) || 0;
  });
  return s;
}

function feasClass(p, a) {
  if (a <= 0) return p > 0 ? "rose" : "green";
  const r = p / a;
  if (r > 1) return "rose";
  if (r > 0.8) return "amber";
  return "green";
}

function report(label, state) {
  const wd = sprintWD(state);
  console.log("\n=== " + label + " === (" + wd + " working days)");
  console.log("Name        Avail   Planned   Util%   Status");
  console.log("----------  ------  --------  ------  ------");
  let totAvail = 0, totPlanned = 0;
  state.team.forEach((m) => {
    const a = avail(m, wd);
    const p = plannedFor(state, m.name);
    const util = a > 0 ? Math.round((p / a) * 100) : (p > 0 ? 999 : 0);
    const cls = feasClass(p, a);
    totAvail += a; totPlanned += p;
    console.log(
      m.name.padEnd(10) + "  " +
      String(a).padEnd(6) + "  " +
      String(p).padEnd(8) + "  " +
      (util + "%").padEnd(6) + "  " +
      cls
    );
  });
  console.log("----------  ------  --------  ------  ------");
  console.log(
    "TOTAL     ".padEnd(10) + "  " +
    String(totAvail).padEnd(6) + "  " +
    String(totPlanned).padEnd(8) + "  " +
    Math.round((totPlanned/totAvail)*100) + "%   " +
    "buffer=" + Math.max(0, totAvail - totPlanned) + "h"
  );
}

report("PHASES sprint 04", PHASES_SCENARIO);
report("PER-PERSON sprint 05", PER_PERSON_SCENARIO);
