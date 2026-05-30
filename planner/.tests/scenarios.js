// Two realistic example sprints, hand-crafted to produce interesting feasibility:
// some over-booked, some under-utilized — exactly the kind of plan a manager
// would catch with the planner before publishing.

const PHASES_SCENARIO = {
  sprint: {
    name: "Sprint 04 — Release Plan",
    number: 4,
    startDate: "2026-06-15",
    endDate: "2026-06-26",
    workingDaysOverride: "",
  },
  style: "phases",
  brainDump:
    "QA Mon-Wed, UAT Thu-Fri week 1. CRT runs all sprint long, Ramesh owns it. " +
    "Beta in week 2 Mon-Wed. Regression Thu-Fri week 2. " +
    "Karthick on KB/release notes only. Jeevan 70% (parental), Kalanithi 50% (split with another team).",
  team: [
    { name: "Piyush Pandey",             leaveDays: 0, allocationPct: 100, notes: "Lead" },
    { name: "Manupriya",            leaveDays: 0, allocationPct: 100, notes: "Owns automation/CRT" },
    { name: "Karthick Thangadurai",      leaveDays: 0, allocationPct: 100, notes: "Docs/KB lead" },
    { name: "Kesavanmurthy K",           leaveDays: 0, allocationPct: 100, notes: "" },
    { name: "Jeevan Saravanan",          leaveDays: 0, allocationPct: 70,  notes: "Parental leave window" },
    { name: "Kalanithi Balasubramanian", leaveDays: 0, allocationPct: 50,  notes: "50% shared with team B" },
  ],
  phases: [
    {
      phaseName: "QA Testing",
      startDate: "2026-06-15", endDate: "2026-06-17",      // 3 wd
      assignments: [
        { personName: "Piyush Pandey", allocationPct: 100 },      // 24h
        { personName: "Manupriya", allocationPct: 100 },      // 24h
        { personName: "Kesavanmurthy K", allocationPct: 100 },      // 24h
        { personName: "Jeevan Saravanan", allocationPct: 70  },      // 16.8 -> 17h
        { personName: "Kalanithi Balasubramanian", allocationPct: 50  },      // 12h
      ],
    },
    {
      phaseName: "UAT",
      startDate: "2026-06-18", endDate: "2026-06-19",      // 2 wd
      assignments: [
        { personName: "Piyush Pandey", allocationPct: 100 },      // 16h
        { personName: "Manupriya", allocationPct: 100 },      // 16h
        { personName: "Kesavanmurthy K", allocationPct: 100 },      // 16h
        { personName: "Jeevan Saravanan", allocationPct: 70  },      // 11.2 -> 11h
      ],
    },
    {
      phaseName: "Automated CRT Testing",
      startDate: "2026-06-15", endDate: "2026-06-26",      // 10 wd
      assignments: [
        { personName: "Manupriya", allocationPct: 50 },       // 40h  <-- overlaps everything else for Ramesh
      ],
    },
    {
      phaseName: "Beta Testing",
      startDate: "2026-06-22", endDate: "2026-06-24",      // 3 wd
      assignments: [
        { personName: "Piyush Pandey", allocationPct: 100 },      // 24h
        { personName: "Manupriya", allocationPct: 100 },      // 24h
        { personName: "Kesavanmurthy K", allocationPct: 100 },      // 24h
        { personName: "Jeevan Saravanan", allocationPct: 70  },      // 17h
        { personName: "Kalanithi Balasubramanian", allocationPct: 50  },      // 12h
      ],
    },
    {
      phaseName: "Automated Regression",
      startDate: "2026-06-22", endDate: "2026-06-25",      // 4 wd  <-- overlaps Beta
      assignments: [
        { personName: "Piyush Pandey", allocationPct: 50 },       // 16h
        { personName: "Manupriya", allocationPct: 50 },       // 16h
      ],
    },
    {
      phaseName: "Regression Testing",
      startDate: "2026-06-25", endDate: "2026-06-26",      // 2 wd
      assignments: [
        { personName: "Piyush Pandey", allocationPct: 100 },      // 16h
        { personName: "Manupriya", allocationPct: 100 },      // 16h
        { personName: "Kesavanmurthy K", allocationPct: 100 },      // 16h
        { personName: "Jeevan Saravanan", allocationPct: 70  },      // 11h
        { personName: "Kalanithi Balasubramanian", allocationPct: 50  },      // 8h
      ],
    },
    {
      phaseName: "KB / Release Notes / Version Tracker",
      startDate: "2026-06-25", endDate: "2026-06-26",      // 2 wd
      assignments: [
        { personName: "Karthick Thangadurai", allocationPct: 80 },     // 12.8 -> 13h
        { personName: "Kalanithi Balasubramanian", allocationPct: 20 },     // 3.2 -> 3h
      ],
    },
  ],
  sharedJiras: [],
  assignments: {},
};

const PER_PERSON_SCENARIO = {
  sprint: {
    name: "Sprint 05 — Feature Sprint",
    number: 5,
    startDate: "2026-06-29",
    endDate: "2026-07-10",
    workingDaysOverride: "9",                              // one public holiday: 04 Jul (US Independence Day)
  },
  style: "perPerson",
  brainDump:
    "Piyush owns PERF-451 and DESIGN-89. Ramesh on API-303 mostly. " +
    "Karthick has CRT-77 + KB-15. K7 helps Piyush on PERF + owns BUG-201. " +
    "Jeevan on TEST-99 / QA-CHECK at 70%. Kalanithi on ADMIN + KB-RELEASE at 50%. " +
    "Shared REGRESSION-50 split unevenly because Piyush knows the legacy module. " +
    "Plus a SUPPORT rotation shared across Piyush/Ramesh/Karthick/K7.",
  team: [
    { name: "Piyush Pandey",             leaveDays: 0, allocationPct: 100, notes: "Lead" },
    { name: "Manupriya",            leaveDays: 0, allocationPct: 100, notes: "" },
    { name: "Karthick Thangadurai",      leaveDays: 0, allocationPct: 100, notes: "" },
    { name: "Kesavanmurthy K",           leaveDays: 0, allocationPct: 100, notes: "" },
    { name: "Jeevan Saravanan",          leaveDays: 2, allocationPct: 70,  notes: "PTO Mon-Tue week 2" },
    { name: "Kalanithi Balasubramanian", leaveDays: 1, allocationPct: 50,  notes: "" },
  ],
  phases: [],
  sharedJiras: [
    {
      id: "SHARED-REG-50",
      jira: "REGRESSION-50 — Cross-team regression",
      totalHours: 60,
      startDate: "2026-07-06", endDate: "2026-07-10",
      splits: { "Piyush Pandey": 24, "Manupriya": 16, "Kesavanmurthy K": 16, "Jeevan Saravanan": 4 },
    },
    {
      id: "SHARED-SUPPORT",
      jira: "SUPPORT-ROTATION — On-call coverage",
      totalHours: 40,
      startDate: "2026-06-29", endDate: "2026-07-10",
      splits: { "Piyush Pandey": 8, "Manupriya": 8, "Karthick Thangadurai": 16, "Kesavanmurthy K": 8 },
    },
  ],
  assignments: {
    "Piyush Pandey": [
      { id: "p1", jira: "PERF-451 — Cache layer rewrite",       hours: 24, startDate: "2026-06-29", endDate: "2026-07-02", sharedId: null },
      { id: "p2", jira: "DESIGN-89 — Sync-up + design doc",     hours: 12, startDate: "2026-07-03", endDate: "2026-07-03", sharedId: null },
      { id: "p3", jira: "BUG-200 — Memory leak in worker pool", hours: 16, startDate: "2026-07-06", endDate: "2026-07-07", sharedId: null },
    ],
    "Manupriya": [
      { id: "r1", jira: "API-303 — Pagination + filter rewrite", hours: 40, startDate: "2026-06-29", endDate: "2026-07-03", sharedId: null },
      { id: "r2", jira: "DOC-12 — OpenAPI spec refresh",         hours: 8,  startDate: "2026-07-06", endDate: "2026-07-06", sharedId: null },
    ],
    "Karthick Thangadurai": [
      { id: "k1", jira: "CRT-77 — Automation suite expansion", hours: 32, startDate: "2026-06-29", endDate: "2026-07-03", sharedId: null },
      { id: "k2", jira: "KB-15 — Internal runbook",            hours: 10, startDate: "2026-07-06", endDate: "2026-07-07", sharedId: null },
    ],
    "Kesavanmurthy K": [
      { id: "x1", jira: "PERF-451-SUB — Cache benchmark",  hours: 28, startDate: "2026-06-29", endDate: "2026-07-02", sharedId: null },
      { id: "x2", jira: "BUG-201 — Race condition fix",    hours: 16, startDate: "2026-07-03", endDate: "2026-07-06", sharedId: null },
    ],
    "Jeevan Saravanan": [
      { id: "j1", jira: "TEST-99 — Edge-case test pass", hours: 16, startDate: "2026-07-01", endDate: "2026-07-03", sharedId: null },
      { id: "j2", jira: "QA-CHECK-2 — Smoke run",        hours: 8,  startDate: "2026-07-07", endDate: "2026-07-07", sharedId: null },
    ],
    "Kalanithi Balasubramanian": [
      { id: "m1", jira: "ADMIN-22 — Quarterly board prep",      hours: 16, startDate: "2026-06-29", endDate: "2026-07-02", sharedId: null },
      { id: "m2", jira: "KB-RELEASE — Sprint 05 release notes", hours: 12, startDate: "2026-07-09", endDate: "2026-07-10", sharedId: null },
    ],
  },
};

module.exports = { PHASES_SCENARIO, PER_PERSON_SCENARIO };
