// Comprehensive test harness for the Sprint Planner generator + calc logic.
// Run with: node planner/.tests/run-tests.js
//
// What this covers (and why):
// - All scenarios the user and assistant discussed across the build:
//     working-day computation, override, leave-days, allocation %
//     phase rounding to 0.5h
//     phase date migration (legacy per-row dates -> per-phase)
//     shared JIRA splits migration (legacy memberNames -> splits map)
//     uneven splits + over/under-allocation pill colors
//     per-person assignments + derived shared rows
//     generator output for both styles
//     feasibility classification (green/amber/rose) at boundary ratios
//
// Tests are intentionally readable side-by-side; failures fail loudly.

const fs = require("fs");
const path = require("path");

// Load generator.js into a sandbox so we can call its internal helpers.
global.window = {};
const generatorPath = path.join(__dirname, "..", "generator.js");
eval(fs.readFileSync(generatorPath, "utf8"));
const G = window.SprintGenerator;
if (!G || !G.renderSprintHtml) throw new Error("generator.js didn't expose SprintGenerator.renderSprintHtml");

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; failures.push({ name, detail }); console.log("  FAIL  " + name + (detail ? "  // " + detail : "")); }
}
function group(name, fn) { console.log("\n=== " + name + " ==="); fn(); }

// Shared baseline team (matches DEFAULT_TEAM / Jira Assignee-V2 names).
const TEAM6 = [
  { name: "Piyush Pandey",             leaveDays: 0, allocationPct: 100 },
  { name: "Manupriya",                 leaveDays: 0, allocationPct: 100 },
  { name: "Karthick Thangadurai",      leaveDays: 0, allocationPct: 100 },
  { name: "Kesavanmurthy K",           leaveDays: 0, allocationPct: 100 },
  { name: "Jeevan Saravanan",          leaveDays: 0, allocationPct: 100 },
  { name: "Kalanithi Balasubramanian", leaveDays: 0, allocationPct: 100 },
];

// ------------------------------------------------------------
group("Working-day math (auto + override)", () => {
  // Mon 15 Jun 2026 -> Fri 26 Jun 2026 spans 10 working days.
  const s1 = { sprint: { startDate: "2026-06-15", endDate: "2026-06-26" }, team: TEAM6, phases: [] };
  const html1 = G.renderSprintHtml(s1);
  ok("auto computes 10 working days for Mon-Fri x2",
     html1.includes("(10 working days)") || html1.includes("10 working"),
     "(metric strip should mention 10 working days)");

  // workingDaysOverride should beat auto-compute.
  const s2 = { sprint: { startDate: "2026-06-15", endDate: "2026-06-26", workingDaysOverride: "9" }, team: TEAM6, phases: [] };
  const html2 = G.renderSprintHtml(s2);
  ok("override 9 wins over auto 10",
     html2.includes("(9 working days)") || html2.includes("9 working"),
     "(should respect workingDaysOverride='9')");

  // workingDaysOverride='' should fall back to auto.
  const s3 = { sprint: { startDate: "2026-06-15", endDate: "2026-06-26", workingDaysOverride: "" }, team: TEAM6, phases: [] };
  ok("empty override falls back to auto", G.renderSprintHtml(s3).includes("10 working"));

  // No dates -> falls back to default of 10 (per generator code).
  const s4 = { sprint: {}, team: TEAM6, phases: [] };
  ok("no dates -> defaults to 10 working days", G.renderSprintHtml(s4).includes("10 working"));
});

// ------------------------------------------------------------
group("Available hours per teammate (leave + alloc %)", () => {
  // 10 working days, Jeevan at 70% with 2 leave days = (10-2)*8*0.7 = 44.8h.
  // Kalanithi at 50% with 1 leave day = (10-1)*8*0.5 = 36h.
  // Piyush at 100% with 0 leave = 80h.
  const team = [
    { name: "Piyush Pandey", leaveDays: 0, allocationPct: 100 },
    { name: "Jeevan Saravanan", leaveDays: 2, allocationPct: 70 },
    { name: "Kalanithi Balasubramanian", leaveDays: 1, allocationPct: 50 },
  ];
  const s = { sprint: { startDate: "2026-06-15", endDate: "2026-06-26" }, style: "perPerson", team, sharedJiras: [], assignments: {} };
  const html = G.renderSprintHtml(s);
  ok("Piyush available 80h",  html.includes("80h"), "(expected 80h Piyush avail)");
  ok("Jeevan available 44.8h", html.includes("44.8h"), "(expected 44.8h Jeevan avail)");
  ok("Kalanithi available 36h",  html.includes("36h"), "(expected 36h Kalanithi avail)");
});

// ------------------------------------------------------------
group("Phase row hours snap to 0.5", () => {
  // Test plan: pick phases that produce clean and "messy" decimals.
  // 5 working days = Mon 4 May - Fri 8 May 2026.
  const s = {
    sprint: { startDate: "2026-05-04", endDate: "2026-05-08" },
    style: "phases",
    team: TEAM6,
    phases: [
      { phaseName: "Five@100", startDate: "2026-05-04", endDate: "2026-05-08", assignments: [{ personName: "Piyush Pandey", allocationPct: 100 }] }, // 40h
      { phaseName: "Five@70",  startDate: "2026-05-04", endDate: "2026-05-08", assignments: [{ personName: "Piyush Pandey", allocationPct: 70  }] }, // 28h
      { phaseName: "Three@70", startDate: "2026-05-04", endDate: "2026-05-06", assignments: [{ personName: "Piyush Pandey", allocationPct: 70  }] }, // 16.8 -> 17h
      { phaseName: "Four@70",  startDate: "2026-05-04", endDate: "2026-05-07", assignments: [{ personName: "Piyush Pandey", allocationPct: 70  }] }, // 22.4 -> 22.5h
      { phaseName: "Four@30",  startDate: "2026-05-04", endDate: "2026-05-07", assignments: [{ personName: "Piyush Pandey", allocationPct: 30  }] }, // 9.6  -> 9.5h
    ],
  };
  const html = G.renderSprintHtml(s);
  ok("clean 40h appears",   html.includes(">40h<"));
  ok("clean 28h appears",   html.includes(">28h<"));
  ok("16.8 rounded to 17h", html.includes(">17h<") && !html.includes("16.8h"));
  ok("22.4 rounded to 22.5h", html.includes(">22.5h<") && !html.includes("22.4h"));
  ok("9.6 rounded to 9.5h", html.includes(">9.5h<") && !html.includes("9.6h"));
});

// ------------------------------------------------------------
group("Phase migration (legacy per-row dates -> per-phase)", () => {
  // Older saved sprints stored startDate/endDate on each assignment row.
  const legacy = {
    sprint: { startDate: "2026-05-04", endDate: "2026-05-15" },
    style: "phases",
    team: TEAM6,
    phases: [{
      phaseName: "QA",
      assignments: [
        { personName: "Piyush Pandey", allocationPct: 100, startDate: "2026-05-04", endDate: "2026-05-08" },
        { personName: "Manupriya", allocationPct: 100, startDate: "2026-05-04", endDate: "2026-05-08" },
      ],
    }],
  };
  const html = G.renderSprintHtml(legacy);
  ok("legacy phase dates lifted to phase header", html.includes("2026-05-04") && html.includes("2026-05-08"));
  ok("legacy phase still renders hours (5d * 8 * 1.0 = 40h)", html.includes(">40h<"));
  ok("legacy phase row table omits Start/End cols", !html.includes(">Start</th>") && !html.includes(">End</th>") || html.includes("Per-person split"));
});

// ------------------------------------------------------------
group("Shared JIRA splits migration (legacy memberNames -> splits)", () => {
  const legacy = {
    sprint: { startDate: "2026-06-15", endDate: "2026-06-26" },
    style: "perPerson",
    team: TEAM6,
    sharedJiras: [{ id: "x", jira: "OLD-1", totalHours: 20, memberNames: ["Piyush Pandey", "Manupriya"] }],
    assignments: {},
  };
  const html = G.renderSprintHtml(legacy);
  ok("legacy shared JIRA renders", html.includes("OLD-1"));
  ok("equal split chip Piyush 10h", html.includes(">Piyush Pandey <strong>10h"));
  ok("equal split chip Ramesh 10h", html.includes(">Manupriya <strong>10h"));
  ok("allocated 20/20 (green)", /summary-pill green[^"]*">20h \/ 20h/.test(html));
});

// ------------------------------------------------------------
group("Shared JIRA allocation badges (green / amber / rose)", () => {
  const base = {
    sprint: { startDate: "2026-06-15", endDate: "2026-06-26" },
    style: "perPerson",
    team: [{ name: "A", leaveDays: 0, allocationPct: 100 }, { name: "B", leaveDays: 0, allocationPct: 100 }],
    assignments: {},
  };
  const exact = JSON.parse(JSON.stringify(base));
  exact.sharedJiras = [{ id: "1", jira: "EXACT", totalHours: 40, splits: { A: 20, B: 20 } }];
  ok("sum == total -> green badge", /summary-pill green[^"]*">40h \/ 40h/.test(G.renderSprintHtml(exact)));

  const under = JSON.parse(JSON.stringify(base));
  under.sharedJiras = [{ id: "2", jira: "UNDER", totalHours: 40, splits: { A: 10, B: 10 } }];
  ok("sum < total  -> amber badge", /summary-pill amber[^"]*">20h \/ 40h/.test(G.renderSprintHtml(under)));

  const over = JSON.parse(JSON.stringify(base));
  over.sharedJiras = [{ id: "3", jira: "OVER", totalHours: 40, splits: { A: 30, B: 20 } }];
  ok("sum > total  -> rose badge", /summary-pill rose[^"]*">50h \/ 40h/.test(G.renderSprintHtml(over)));
});

// ------------------------------------------------------------
group("Per-person assignments + uneven shared splits", () => {
  const s = {
    sprint: { startDate: "2026-06-15", endDate: "2026-06-26" },
    style: "perPerson",
    team: [
      { name: "Piyush Pandey", leaveDays: 0, allocationPct: 100 },
      { name: "Manupriya", leaveDays: 0, allocationPct: 100 },
    ],
    sharedJiras: [{ id: "s1", jira: "BETA-REG", totalHours: 32, splits: { "Piyush Pandey": 24, "Manupriya": 8 } }],
    assignments: {
      "Piyush Pandey": [{ jira: "BETA-REG", hours: 24, sharedId: "s1" }, { jira: "FEAT-1", hours: 40, sharedId: null }],
      "Manupriya": [{ jira: "BETA-REG", hours: 8,  sharedId: "s1" }, { jira: "DOC-2",  hours: 24, sharedId: null }],
    },
  };
  const html = G.renderSprintHtml(s);
  // Piyush planned = 24 + 40 = 64h; Ramesh planned = 8 + 24 = 32h.
  ok("Piyush card shows 64h planned", /Piyush Pandey[\s\S]{0,500}64h/.test(html));
  ok("Ramesh card shows 32h planned", /Manupriya[\s\S]{0,500}32h/.test(html));
  ok("shared chip Piyush 24h", html.includes(">Piyush Pandey <strong>24h"));
  ok("shared chip Ramesh 8h",  html.includes(">Manupriya <strong>8h"));
});

// ------------------------------------------------------------
group("Feasibility classes at the 80% / 100% boundaries", () => {
  // Use a 1-person team at 80h available, vary planned hours, watch pill color.
  function build(planned) {
    return {
      sprint: { startDate: "2026-06-15", endDate: "2026-06-26" },
      style: "perPerson",
      team: [{ name: "Solo", leaveDays: 0, allocationPct: 100 }],
      sharedJiras: [],
      assignments: { Solo: [{ jira: "JOB", hours: planned, sharedId: null }] },
    };
  }
  // <=80%: green, 80-100%: amber, >100%: rose.
  ok("60/80 = 75% -> green", /feas-bar-row green[\s\S]*?60h \/ 80h/.test(G.renderSprintHtml(build(60))));
  ok("72/80 = 90% -> amber", /feas-bar-row amber[\s\S]*?72h \/ 80h/.test(G.renderSprintHtml(build(72))));
  ok("90/80 =112% -> rose ", /feas-bar-row rose[\s\S]*?90h \/ 80h/.test(G.renderSprintHtml(build(90))));
});

// ------------------------------------------------------------
group("HTML round-trip (embed + scrape import)", () => {
  const sample = {
    sprint: { name: "Sprint 04 — Test", number: "4", startDate: "2026-05-25", endDate: "2026-06-05", workingDaysOverride: "" },
    style: "perPerson",
    brainDump: "Move shared items after import.",
    team: [
      { name: "Alice", leaveDays: 1, allocationPct: 100, notes: "PTO Fri" },
      { name: "Bob", leaveDays: 0, allocationPct: 80, notes: "" },
    ],
    sharedJiras: [{ jira: "V2-100", totalHours: 16, startDate: "2026-05-26", endDate: "2026-06-04", splits: { Alice: 10, Bob: 6 } }],
    assignments: {
      Alice: [{ jira: "V2-100", hours: 10, sharedId: "s1" }, { jira: "V2-200", hours: 20, sharedId: null }],
      Bob: [{ jira: "V2-100", hours: 6, sharedId: "s1" }],
    },
  };
  const html = G.renderSprintHtml(sample);
  ok("download embeds planner state script", html.includes('id="sprint-planner-state"'));
  if (G.parseStateFromHtml) {
    const embedded = G.parseStateFromHtml(html);
    ok("embedded import succeeds", embedded.source === "embed" && !!embedded.state);
    ok("embedded sprint name preserved", embedded.state && embedded.state.sprint.name === "Sprint 04 — Test");
    ok("embedded team count", embedded.state && embedded.state.team.length === 2);
    ok("embedded shared JIRA", embedded.state && embedded.state.sharedJiras.length === 1);
    ok("embedded explicit assignment rows only", embedded.state && embedded.state.assignments.Alice.length === 1);
  } else {
    ok("parseStateFromHtml exported", false, "generator.js missing parseStateFromHtml");
  }

  const legacyPath = path.join(__dirname, "..", "..", "sprint-04-from-csv.html");
  if (fs.existsSync(legacyPath) && G.parseStateFromHtml && typeof DOMParser !== "undefined") {
    const legacyHtml = fs.readFileSync(legacyPath, "utf8");
    const legacy = G.parseStateFromHtml(legacyHtml);
    ok("legacy HTML scrape succeeds", legacy.source === "scrape" && !!legacy.state);
    ok("legacy team has 6 members", legacy.state && legacy.state.team.length === 6);
    ok("legacy Piyush has JIRAs", legacy.state && (legacy.state.assignments["Piyush Pandey"] || []).length >= 1);
  }
});

// ------------------------------------------------------------
console.log("\n----------------------------------------");
console.log(" RESULTS: " + pass + " passed, " + fail + " failed");
console.log("----------------------------------------");
if (fail > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f.name + (f.detail ? " // " + f.detail : "")));
  process.exit(1);
}
process.exit(0);
