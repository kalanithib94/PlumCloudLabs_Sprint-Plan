// app.js — Sprint Planner state, rendering, mic, save/load, preview, download.
// Two structures: "phases" (phase cards with per-person sub-rows) and
// "perPerson" (one card per teammate with their own JIRAs + shared JIRAs).
// 8h working day. Vacations via team.leaveDays.

(function () {
  "use strict";

  // ---------- Constants ----------

  const HOURS_PER_DAY = 8;
  const STORAGE_KEY = "sprintPlanner.v3";
  const STORAGE_KEY_V2 = "sprintPlanner.v2";
  const TINTS = ["tint-mint", "tint-lavender", "tint-peach", "tint-sky", "tint-rose", "tint-sand"];

  // Company teams — each tab owns its own roster, saved sprints, and draft state.
  const COMPANY_TEAMS = [
    { id: "dev",        label: "Dev",        allowPhases: false, members: ["Rishabh", "Piyush C", "Sagar"] },
    { id: "marketing",  label: "Marketing",  allowPhases: false, members: ["Vivaan", "Ujjwal", "Khushi", "Garv"] },
    { id: "ee",         label: "EE",         allowPhases: true,  members: ["Kalanithi", "Kesavamoorthy", "Jeevan", "Karthick", "Piyush P", "Manupriya"] },
    { id: "hynoyo",     label: "Henoyo",     allowPhases: false, members: ["Praful", "Mahima", "Nandan", "Tanya", "Tejesh", "Sunil"] },
  ];

  function companyTeamConfig(teamId) {
    return COMPANY_TEAMS.find((t) => t.id === teamId) || COMPANY_TEAMS.find((t) => t.id === "ee");
  }

  function defaultTeamFor(teamId) {
    return companyTeamConfig(teamId).members.map((name) => ({
      name, leaveDays: 0, allocationPct: 100, notes: "",
    }));
  }

  // Short labels / old Jira CSV names → current EE roster names.
  const LEGACY_TEAM_NAMES = {
    Piyush: "Piyush P",
    "Piyush Pandey": "Piyush P",
    Ramesh: "Manupriya",
    Karthick: "Karthick",
    "Karthick Thangadurai": "Karthick",
    K7: "Kesavamoorthy",
    "Kesavanmurthy K": "Kesavamoorthy",
    Jeevan: "Jeevan",
    "Jeevan Saravanan": "Jeevan",
    Master: "Kalanithi",
    "Kalanithi Balasubramanian": "Kalanithi",
  };

  // Departures: full name in old saves → replacement on load.
  const ROSTER_REPLACEMENTS = {
    "Ramesh Mandava": "Manupriya",
  };

  // Pre-populated phases for the Phases structure. Each phase already has the typical participants
  // with their usual allocation %. Just edit dates/hours per sprint, or ✕ out people/phases not used.
  // Dates start blank (sprint-specific); fill them in to make hours compute.
  const DEFAULT_PHASE_TEMPLATES = [
    { phaseName: "QA Testing",                            allocations: { "Piyush P":100, "Manupriya":100, "Kesavamoorthy":100, "Jeevan":70, "Kalanithi":50 } },
    { phaseName: "UAT",                                   allocations: { "Piyush P":100, "Manupriya":100, "Kesavamoorthy":100, "Jeevan":70, "Kalanithi":50 } },
    { phaseName: "Automated CRT Testing",                 allocations: { "Manupriya":100 } },
    { phaseName: "Beta Testing",                          allocations: { "Piyush P":100, "Manupriya":100, "Kesavamoorthy":100, "Jeevan":70, "Kalanithi":50 } },
    { phaseName: "Automated Regression",                  allocations: { "Piyush P":50,  "Manupriya":50 } },
    { phaseName: "Regression Testing",                    allocations: { "Piyush P":100, "Manupriya":100, "Kesavamoorthy":100, "Jeevan":70, "Kalanithi":50 } },
    { phaseName: "KB / Release Notes / Version Tracker",  allocations: { "Karthick":80, "Kalanithi":20 } },
  ];

  function buildDefaultPhases() {
    return DEFAULT_PHASE_TEMPLATES.map((t) => ({
      id: uid(),
      phaseName: t.phaseName,
      notes: "",
      startDate: "",
      endDate: "",
      assignments: Object.keys(t.allocations).map((name) => ({
        id: uid(),
        personName: name,
        allocationPct: t.allocations[name],
      })),
    }));
  }

  // EE (Phases-capable) plans seed the seven release templates when switching to
  // Phases with an empty list — e.g. after CSV/JSON import or an older localStorage save.
  function seedDefaultPhasesIfEmpty() {
    if (!companyTeamAllowsPhases()) return false;
    if (Array.isArray(state.phases) && state.phases.length > 0) return false;
    state.phases = buildDefaultPhases();
    return true;
  }

  // Lift legacy per-row dates onto the phase header. Older saved sprints
  // stored startDate/endDate on each assignment row; we now hold those on the
  // phase itself. Take the first row's dates as the phase dates.
  function migratePhaseDates(phases) {
    (phases || []).forEach((p) => {
      if (p.startDate === undefined) p.startDate = "";
      if (p.endDate === undefined) p.endDate = "";
      if ((!p.startDate || !p.endDate) && Array.isArray(p.assignments)) {
        const withDates = p.assignments.find((a) => a && (a.startDate || a.endDate));
        if (withDates) {
          if (!p.startDate) p.startDate = withDates.startDate || "";
          if (!p.endDate) p.endDate = withDates.endDate || "";
        }
        p.assignments.forEach((a) => { delete a.startDate; delete a.endDate; });
      }
    });
    return phases;
  }

  // Rename short team labels from pre-Jira-CSV saves to full Assignee-V2 names.
  function renamePersonInState(state, oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    (state.team || []).forEach((m) => { if (m.name === oldName) m.name = newName; });
    (state.phases || []).forEach((p) => {
      (p.assignments || []).forEach((a) => { if (a.personName === oldName) a.personName = newName; });
    });
    if (state.assignments && Object.prototype.hasOwnProperty.call(state.assignments, oldName)) {
      state.assignments[newName] = state.assignments[oldName];
      delete state.assignments[oldName];
    }
    (state.sharedJiras || []).forEach((sj) => {
      if (sj.splits && Object.prototype.hasOwnProperty.call(sj.splits, oldName)) {
        sj.splits[newName] = sj.splits[oldName];
        delete sj.splits[oldName];
      }
      if (Array.isArray(sj.memberNames)) {
        sj.memberNames = sj.memberNames.map((n) => (n === oldName ? newName : n));
      }
    });
  }

  function migrateTeamNames(state) {
    if (!state) return state;
    Object.keys(LEGACY_TEAM_NAMES).forEach((oldName) => {
      const newName = LEGACY_TEAM_NAMES[oldName];
      const hasOld = (state.team || []).some((m) => m.name === oldName);
      const hasNew = (state.team || []).some((m) => m.name === newName);
      if (hasOld && !hasNew) renamePersonInState(state, oldName, newName);
    });
    Object.keys(ROSTER_REPLACEMENTS).forEach((oldName) => {
      const newName = ROSTER_REPLACEMENTS[oldName];
      const hasOld = (state.team || []).some((m) => m.name === oldName);
      const hasNew = (state.team || []).some((m) => m.name === newName);
      if (hasOld && !hasNew) renamePersonInState(state, oldName, newName);
    });
    return state;
  }

  // ---------- Utils ----------

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function uid() { return "id-" + Math.random().toString(36).slice(2, 10); }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") node.className = v;
        else if (k === "dataset") Object.assign(node.dataset, v);
        else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else if (k === "checked" || k === "disabled" || k === "readOnly" || k === "selected") {
          if (v) node.setAttribute(k === "readOnly" ? "readonly" : k, "");
        } else node.setAttribute(k, v);
      }
    }
    (Array.isArray(children) ? children : children !== undefined ? [children] : []).forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return node;
  }

  function toast(msg, kind) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast" + (kind ? " " + kind : "");
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => (t.hidden = true), 2400);
  }

  function parseDate(s) {
    if (!s) return null;
    const d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }

  function workingDaysBetween(startStr, endStr) {
    const a = parseDate(startStr);
    const b = parseDate(endStr);
    if (!a || !b || b < a) return 0;
    let count = 0;
    const d = new Date(a);
    while (d <= b) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  function autoWorkingDays() {
    const w = workingDaysBetween(state.sprint.startDate, state.sprint.endDate);
    return w > 0 ? w : 10;
  }

  function sprintWorkingDays() {
    const ov = Number(state.sprint.workingDaysOverride);
    if (state.sprint.workingDaysOverride !== "" && state.sprint.workingDaysOverride != null && ov > 0) return ov;
    return autoWorkingDays();
  }

  function availableHours(member) {
    const wd = sprintWorkingDays();
    const leave = Math.max(0, Number(member.leaveDays) || 0);
    const alloc = Math.max(0, Number(member.allocationPct) || 0);
    return Math.max(0, (wd - leave) * HOURS_PER_DAY * alloc / 100);
  }

  // Round to the nearest half-hour so per-row hours read cleanly (16, 16.5, 17 — never 16.8).
  // Totals stay consistent because every row uses this same rounded value everywhere.
  function roundHalf(n) { return Math.round(n * 2) / 2; }

  function phaseRowHours(phase, row) {
    const wd = workingDaysBetween(phase.startDate, phase.endDate);
    const alloc = Math.max(0, Number(row.allocationPct) || 0);
    return roundHalf(wd * HOURS_PER_DAY * alloc / 100);
  }

  function plannedFor(personName) {
    if (state.style === "phases") {
      let sum = 0;
      state.phases.forEach((p) => p.assignments.forEach((a) => {
        if (a.personName === personName) sum += phaseRowHours(p, a);
      }));
      return sum;
    }
    const rows = state.assignments[personName] || [];
    return rows.reduce((acc, r) => acc + (Number(r.hours) || 0), 0);
  }

  function feasibilityClass(planned, available) {
    if (available <= 0) return planned > 0 ? "rose" : "green";
    const r = planned / available;
    if (r > 1) return "rose";
    if (r > 0.8) return "amber";
    return "green";
  }

  function fmt(n) {
    const x = Math.round(n * 10) / 10;
    return Number.isInteger(x) ? String(x) : x.toFixed(1);
  }

  // ---------- State ----------

  function emptyStateForTeam(teamId) {
    const cfg = companyTeamConfig(teamId);
    return {
      sprint: { name: "", number: "", startDate: "", endDate: "", workingDaysOverride: "" },
      style: "perPerson",
      brainDump: "",
      team: defaultTeamFor(teamId),
      phases: cfg.allowPhases ? buildDefaultPhases() : [],
      sharedJiras: [],
      assignments: {},
    };
  }

  function emptyState() { return emptyStateForTeam(activeCompanyTeamId); }

  let storeRoot = null;
  let activeCompanyTeamId = "ee";
  let state = emptyStateForTeam("ee");

  // ---------- Speech-to-text ----------

  const RecCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

  function bindMic(btn) {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    if (!RecCtor) {
      btn.disabled = true; btn.title = "Use Chrome or Edge for dictation."; btn.textContent = "n/a";
      return;
    }
    let rec = null, base = "", target = null;
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (btn.dataset.on === "1") { try { rec && rec.stop(); } catch (_) {} return; }
      const id = btn.getAttribute("data-mic-for");
      target = id ? document.getElementById(id) : btn.closest("tr,.row")?.querySelector("input.cell,textarea.cell,input.text,textarea");
      if (!target) { toast("No text field for this mic.", "error"); return; }
      base = target.value || "";
      rec = new RecCtor();
      rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
      rec.onresult = (e) => {
        let txt = "";
        for (let i = e.resultIndex; i < e.results.length; i++) txt += e.results[i][0].transcript;
        target.value = (base ? base + " " : "") + txt;
        target.dispatchEvent(new Event("input", { bubbles: true }));
      };
      rec.onend = () => { btn.dataset.on = "0"; btn.textContent = "Mic"; };
      rec.onerror = (e) => {
        btn.dataset.on = "0"; btn.textContent = "Mic";
        if (e.error && e.error !== "aborted" && e.error !== "no-speech") toast("Mic: " + e.error, "error");
      };
      try { rec.start(); btn.dataset.on = "1"; btn.textContent = "Stop"; }
      catch (err) { toast("Mic failed: " + err.message, "error"); }
    });
  }

  function bindMics() { $$(".btn.mic").forEach(bindMic); }

  // ---------- Rendering: header / metric strip / feasibility ----------

  function renderHeader() {
    $("#sprint-name").value = state.sprint.name || "";
    $("#sprint-number").value = state.sprint.number || "";
    $("#sprint-start").value = state.sprint.startDate || "";
    $("#sprint-end").value = state.sprint.endDate || "";
    $("#brain-dump").value = state.brainDump || "";
    $("#page-title").textContent = state.sprint.name
      ? state.sprint.name
      : companyTeamConfig(activeCompanyTeamId).label + " — new sprint";
    refreshWorkingDays();
  }

  function renderMetricStrip() {
    const cap = state.team.reduce((a, m) => a + availableHours(m), 0);
    const planned = state.team.reduce((a, m) => a + plannedFor(m.name), 0);
    const buffer = Math.max(0, cap - planned);
    const root = $("#metric-strip");
    root.innerHTML = "";
    root.appendChild(el("span", { class: "metric-pill" }, [el("strong", null, fmt(cap)), "h capacity"]));
    root.appendChild(el("span", { class: "metric-pill" }, [el("strong", null, fmt(planned)), "h planned"]));
    root.appendChild(el("span", { class: "metric-pill" }, [el("strong", null, fmt(buffer)), "h buffer"]));
  }

  function renderFeasibility() {
    const root = $("#feasibility-pills");
    root.innerHTML = "";
    if (!state.team.length) {
      root.appendChild(el("span", { class: "feasibility-empty" }, "Add team members above to see feasibility."));
      return;
    }
    const maxScale = Math.max(
      1,
      ...state.team.map((m) => Math.max(plannedFor(m.name), availableHours(m), 0))
    );
    state.team.forEach((m) => {
      const avail = availableHours(m);
      const planned = plannedFor(m.name);
      const cls = feasibilityClass(planned, avail);
      const pct = avail > 0 ? Math.round((planned / avail) * 100) : (planned > 0 ? 999 : 0);
      const capW = (avail / maxScale) * 100;
      const planW = (planned / maxScale) * 100;
      const row = el("div", {
        class: "feas-bar-row " + cls,
        title: m.name + ": " + fmt(planned) + "h planned of " + fmt(avail) + "h available",
      });
      row.appendChild(el("span", { class: "feas-bar-name" }, m.name || "—"));
      row.appendChild(el("div", { class: "feas-bar-track-wrap" }, [
        el("div", { class: "feas-bar-track" }, [
          el("div", { class: "feas-bar-cap", style: { width: capW + "%" } }),
          el("div", { class: "feas-bar-fill", style: { width: planW + "%" } }),
        ]),
      ]));
      row.appendChild(el("span", { class: "feas-bar-meta" }, fmt(planned) + "h / " + fmt(avail) + "h (" + pct + "%)"));
      root.appendChild(row);
    });
  }

  // ---------- Rendering: team table ----------

  function renderTeam() {
    const tbody = $("#team-table tbody");
    tbody.innerHTML = "";
    state.team.forEach((m, i) => {
      const nameInput = makeInput("text", m.name, (v) => {
        if (state.team[i]) state.team[i].name = v;
        renderFeasibility();
        renderMetricStrip();
      });
      bindTeamNameCommit(nameInput, i);
      const tr = el("tr", { dataset: { teamIdx: String(i) } }, [
        el("td", null, nameInput),
        el("td", { class: "cen" }, makeInput("number", m.leaveDays, (v) => {
          state.team[i].leaveDays = Math.max(0, Number(v) || 0);
          onTeamCapacityChange(i);
        })),
        el("td", { class: "cen" }, makeInput("number", m.allocationPct, (v) => {
          state.team[i].allocationPct = Math.max(0, Number(v) || 0);
          onTeamCapacityChange(i);
        })),
        el("td", { class: "num", dataset: { availCell: String(i) } }, fmt(availableHours(m)) + "h"),
        el("td", null, makeInput("text", m.notes || "", (v) => { state.team[i].notes = v; })),
        el("td", null, el("button", { class: "row-del", title: "Remove", onclick: () => removeMember(i) }, "✕")),
      ]);
      tbody.appendChild(tr);
    });
    bindMics();
  }

  // Commit renames on blur — propagating on every keystroke rebuilds the table and steals focus.
  function bindTeamNameCommit(input, teamIdx) {
    let nameAtFocus = "";
    input.addEventListener("focus", () => { nameAtFocus = state.team[teamIdx]?.name || ""; });
    input.addEventListener("blur", () => { commitMemberRename(teamIdx, nameAtFocus); });
  }

  function commitMemberRename(i, oldName) {
    const member = state.team[i];
    if (!member) return;
    const newName = (member.name || "").trim();
    member.name = newName;
    if (!oldName || oldName === newName) return;
    if (state.assignments[oldName]) {
      state.assignments[newName] = state.assignments[oldName];
      delete state.assignments[oldName];
    }
    state.phases.forEach((p) => p.assignments.forEach((a) => { if (a.personName === oldName) a.personName = newName; }));
    state.sharedJiras.forEach((s) => {
      if (s.splits && Object.prototype.hasOwnProperty.call(s.splits, oldName)) {
        s.splits[newName] = s.splits[oldName];
        delete s.splits[oldName];
      }
    });
    renderPhases();
    renderPerPerson();
    renderFeasibility();
    renderMetricStrip();
  }

  // Leave days / alloc % changed — update derived UI without rebuilding the team
  // table (rebuilding steals focus after every keystroke).
  function onTeamCapacityChange(teamIdx) {
    updateTeamAvailCell(teamIdx);
    renderFeasibility();
    renderMetricStrip();
    const name = state.team[teamIdx]?.name;
    if (name) refreshPersonHeader(name);
  }

  function updateTeamAvailCell(teamIdx) {
    const cell = document.querySelector('#team-table [data-avail-cell="' + teamIdx + '"]');
    if (cell && state.team[teamIdx]) cell.textContent = fmt(availableHours(state.team[teamIdx])) + "h";
  }

  function removeMember(i) {
    const name = state.team[i].name;
    const hasWork =
      (state.assignments[name] && state.assignments[name].length) ||
      state.phases.some((p) => p.assignments.some((a) => a.personName === name)) ||
      state.sharedJiras.some((s) => s.memberNames.includes(name));
    if (hasWork && !confirm("Remove " + name + "? Their assignments will also be removed.")) return;
    state.team.splice(i, 1);
    delete state.assignments[name];
    state.phases.forEach((p) => { p.assignments = p.assignments.filter((a) => a.personName !== name); });
    state.sharedJiras.forEach((s) => {
      if (s.splits && name in s.splits) delete s.splits[name];
      syncShared(s.id);
    });
    renderAfterTeamChange();
  }

  function renderAfterTeamChange() {
    renderTeam();
    renderFeasibility();
    renderMetricStrip();
    renderPhases();
    renderPerPerson();
  }

  function makeInput(type, value, onChange) {
    const input = el("input", { class: "cell", type: type });
    if (type === "date") input.value = value || "";
    else input.value = value !== undefined && value !== null ? value : "";
    input.addEventListener("input", (e) => onChange(e.target.value));
    return input;
  }

  // ---------- Rendering: Phases structure ----------

  function renderPhases() {
    if (state.style === "phases" && seedDefaultPhasesIfEmpty()) {
      schedulePersistDraft();
    }
    const root = $("#phase-cards");
    root.innerHTML = "";
    if (!state.phases.length) {
      root.appendChild(el("div", { class: "empty-state" }, "No phases yet. Click + Add phase to begin."));
      return;
    }
    state.phases.forEach((ph, pIdx) => {
      const tint = TINTS[pIdx % TINTS.length];
      const totalH = ph.assignments.reduce((a, r) => a + phaseRowHours(ph, r), 0);
      const wd = workingDaysBetween(ph.startDate, ph.endDate);
      const card = el("div", { class: "phase-card", dataset: { id: ph.id } }, [
        el("div", { class: "head " + tint }, [
          el("input", {
            class: "name-input", type: "text", value: ph.phaseName || "",
            placeholder: "Phase name (e.g. QA Testing)",
            oninput: (e) => { state.phases[pIdx].phaseName = e.target.value; updateMetricsLight(); },
          }),
          el("div", { class: "phase-dates" }, [
            el("label", { class: "phase-date" }, [
              el("span", null, "Start"),
              el("input", {
                type: "date", value: ph.startDate || "",
                oninput: (e) => onPhaseDateChange(pIdx, "startDate", e.target.value),
              }),
            ]),
            el("label", { class: "phase-date" }, [
              el("span", null, "End"),
              el("input", {
                type: "date", value: ph.endDate || "",
                oninput: (e) => onPhaseDateChange(pIdx, "endDate", e.target.value),
              }),
            ]),
          ]),
          el("span", { class: "summary-pill", title: wd + " working day(s) in this phase" }, fmt(totalH) + "h total"),
          el("button", { class: "row-del", title: "Delete phase", onclick: () => removePhase(pIdx) }, "✕"),
        ]),
        el("div", { class: "body" }, [
          renderPhaseTable(ph, pIdx),
          el("button", { class: "add-row-btn", onclick: () => addPhaseAssignment(pIdx) }, "+ Add person to this phase"),
        ]),
      ]);
      root.appendChild(card);
    });
    bindMics();
  }

  function onPhaseDateChange(pIdx, field, value) {
    state.phases[pIdx][field] = value;
    // Phase dates drive every row's hours, so re-render the table for this phase
    // and refresh the totals + feasibility.
    renderPhases();
    renderFeasibility();
    renderMetricStrip();
  }

  function renderPhaseTable(phase, pIdx) {
    if (!phase.assignments.length) {
      return el("div", { class: "empty-state" }, "No people yet. Click + Add person.");
    }
    const wrap = el("div");
    const table = el("table", { class: "data editable" }, [
      el("thead", null, el("tr", null, [
        el("th", { style: "width: 40%" }, "Person"),
        el("th", { class: "cen", style: "width: 22%" }, "Alloc %"),
        el("th", { class: "num", style: "width: 28%" }, "Hours"),
        el("th", { style: "width: 40px" }, ""),
      ])),
      el("tbody", null, phase.assignments.map((row, rIdx) => {
        const hours = phaseRowHours(phase, row);
        return el("tr", null, [
          el("td", null, makePersonSelect(row.personName, (v) => {
            state.phases[pIdx].assignments[rIdx].personName = v;
            renderFeasibility(); renderMetricStrip(); updatePhaseTotal(pIdx);
          })),
          el("td", { class: "cen" }, makeInput("number", row.allocationPct, (v) => {
            state.phases[pIdx].assignments[rIdx].allocationPct = Math.max(0, Number(v) || 0);
            updatePhaseRowHours(pIdx, rIdx);
            updatePhaseTotal(pIdx);
            renderFeasibility(); renderMetricStrip();
          })),
          el("td", { class: "num", dataset: { hcell: pIdx + "-" + rIdx } }, fmt(hours) + "h"),
          el("td", null, el("button", { class: "row-del", onclick: () => {
            state.phases[pIdx].assignments.splice(rIdx, 1);
            renderPhases(); renderFeasibility(); renderMetricStrip();
          } }, "✕")),
        ]);
      })),
    ]);
    wrap.appendChild(table);
    return wrap;
  }

  function updatePhaseRowHours(pIdx, rIdx) {
    const cell = document.querySelector('[data-hcell="' + pIdx + "-" + rIdx + '"]');
    if (cell) cell.textContent = fmt(phaseRowHours(state.phases[pIdx], state.phases[pIdx].assignments[rIdx])) + "h";
  }
  function updatePhaseTotal(pIdx) {
    const ph = state.phases[pIdx];
    const card = document.querySelector('.phase-card[data-id="' + ph.id + '"] .summary-pill');
    if (card) {
      const total = ph.assignments.reduce((a, r) => a + phaseRowHours(ph, r), 0);
      card.textContent = fmt(total) + "h total";
    }
  }

  function makePersonSelect(value, onChange) {
    const sel = el("select", { class: "cell" });
    if (!state.team.length) sel.appendChild(el("option", { value: "" }, "(no team yet)"));
    state.team.forEach((m) => {
      const opt = el("option", { value: m.name }, m.name || "(unnamed)");
      if (m.name === value) opt.selected = true;
      sel.appendChild(opt);
    });
    if (value && !state.team.some((m) => m.name === value)) {
      const opt = el("option", { value: value }, value + " (removed)");
      opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", (e) => onChange(e.target.value));
    return sel;
  }

  function addPhase() {
    state.phases.push({
      id: uid(), phaseName: "", notes: "",
      startDate: state.sprint.startDate || "",
      endDate: state.sprint.endDate || "",
      assignments: [],
    });
    renderPhases();
  }

  function addPhaseAssignment(pIdx) {
    state.phases[pIdx].assignments.push({
      id: uid(), personName: state.team[0]?.name || "",
      allocationPct: 100,
    });
    renderPhases(); renderFeasibility(); renderMetricStrip();
  }

  function removePhase(pIdx) {
    if (!confirm("Delete this phase?")) return;
    state.phases.splice(pIdx, 1);
    renderPhases(); renderFeasibility(); renderMetricStrip();
  }

  // ---------- Rendering: Per-Person structure ----------

  function renderPerPerson() {
    renderSharedTable();
    renderPersonCards();
  }

  // ----- Shared JIRA helpers (per-person splits) -----

  function sharedMembers(s) { return Object.keys(s.splits || {}); }
  function sharedAllocated(s) {
    const sp = s.splits || {};
    return Object.keys(sp).reduce((a, k) => a + (Number(sp[k]) || 0), 0);
  }
  function roundTo(n, p) { const f = Math.pow(10, p); return Math.round(n * f) / f; }
  function autoSplit(s) {
    const members = sharedMembers(s);
    if (!members.length) return;
    const each = roundTo((Number(s.totalHours) || 0) / members.length, 2);
    members.forEach((nm) => { s.splits[nm] = each; });
  }

  function refreshSharedCardUI(sharedId) {
    const s = state.sharedJiras.find((x) => x.id === sharedId);
    if (!s) return;
    const card = document.querySelector('.shared-card[data-shared-id="' + sharedId + '"]');
    if (!card) return;
    const allocated = sharedAllocated(s);
    const total = Number(s.totalHours) || 0;
    const diff = roundTo(allocated - total, 2);
    let allocCls = "green";
    if (total > 0 && Math.abs(diff) > 0.05) allocCls = diff > 0 ? "rose" : "amber";
    else if (total === 0 && allocated > 0) allocCls = "amber";
    const pill = card.querySelector("[data-shared-alloc]");
    if (pill) {
      pill.className = "summary-pill " + allocCls;
      pill.textContent = fmt(allocated) + "h / " + fmt(total) + "h";
    }
  }

  function patchSharedPersonRows(sharedId) {
    const s = state.sharedJiras.find((x) => x.id === sharedId);
    if (!s) return;
    sharedMembers(s).forEach((nm) => {
      const row = (state.assignments[nm] || []).find((r) => r.sharedId === sharedId);
      if (!row) return;
      document.querySelectorAll('input[data-shared-id="' + sharedId + '"]').forEach((inp) => {
        if (inp.dataset.sharedPerson !== nm) return;
        if (inp.dataset.sharedField === "jira") inp.value = row.jira || "";
        else if (inp.dataset.sharedField === "hours") inp.value = row.hours;
      });
      refreshPersonHeader(nm);
    });
  }

  function syncSharedFields(sharedId) {
    syncSharedSilent(sharedId);
    refreshSharedCardUI(sharedId);
    patchSharedPersonRows(sharedId);
    renderFeasibility();
    renderMetricStrip();
  }

  function renderSharedTable() {
    const root = $("#shared-list");
    root.innerHTML = "";
    if (!state.sharedJiras.length) {
      root.appendChild(el("div", { class: "empty-state" }, "No shared JIRAs yet. Click + Add shared JIRA."));
      return;
    }
    state.sharedJiras.forEach((s, idx) => {
      if (!s.splits) s.splits = {};
      const allocated = sharedAllocated(s);
      const total = Number(s.totalHours) || 0;
      const diff = roundTo(allocated - total, 2);
      let allocCls = "green";
      if (total > 0 && Math.abs(diff) > 0.05) allocCls = diff > 0 ? "rose" : "amber";
      else if (total === 0 && allocated > 0) allocCls = "amber";

      const card = el("div", { class: "shared-card", dataset: { sharedId: s.id } }, [
        el("div", { class: "shared-head" }, [
          el("input", {
            class: "name-input", type: "text", value: s.jira || "",
            placeholder: "JIRA key or title (e.g. SFDC-123 — Beta regression)",
            oninput: (e) => {
              s.jira = e.target.value;
              syncSharedSilent(s.id);
              patchSharedPersonRows(s.id);
            },
          }),
          el("button", { class: "row-del", title: "Delete shared JIRA", onclick: () => {
            const id = s.id;
            state.sharedJiras.splice(idx, 1);
            Object.keys(state.assignments).forEach((nm) => {
              state.assignments[nm] = (state.assignments[nm] || []).filter((r) => r.sharedId !== id);
            });
            renderPerPerson(); renderFeasibility(); renderMetricStrip();
          } }, "✕"),
        ]),
        el("div", { class: "shared-meta" }, [
          el("label", { class: "field inline" }, [
            el("span", null, "Total"),
            el("input", {
              type: "number", min: "0", step: "0.5", value: s.totalHours,
              oninput: (e) => {
                s.totalHours = Math.max(0, Number(e.target.value) || 0);
                refreshSharedCardUI(s.id);
              },
            }),
          ]),
          el("label", { class: "field inline" }, [
            el("span", null, "Start"),
            el("input", {
              type: "date", value: s.startDate || "",
              oninput: (e) => { s.startDate = e.target.value; syncSharedFields(s.id); },
            }),
          ]),
          el("label", { class: "field inline" }, [
            el("span", null, "End"),
            el("input", {
              type: "date", value: s.endDate || "",
              oninput: (e) => { s.endDate = e.target.value; syncSharedFields(s.id); },
            }),
          ]),
          el("span", { class: "spacer" }),
          el("span", {
            class: "summary-pill " + allocCls,
            dataset: { sharedAlloc: "1" },
            title: diff > 0 ? "Over-allocated by " + fmt(diff) + "h"
                 : diff < 0 ? "Under-allocated by " + fmt(-diff) + "h" : "Allocation matches total",
          }, fmt(allocated) + "h / " + fmt(total) + "h"),
          el("button", {
            class: "btn small",
            title: "Distribute total equally across checked members",
            onclick: () => { autoSplit(s); syncShared(s.id); },
          }, "Auto-split"),
        ]),
        makeMemberSplitGrid(s),
      ]);
      root.appendChild(card);
    });
    bindMics();
  }

  function makeMemberSplitGrid(s) {
    const wrap = el("div", { class: "split-grid" });
    if (!state.team.length) {
      wrap.appendChild(el("span", { class: "feasibility-empty" }, "Add team members first."));
      return wrap;
    }
    state.team.forEach((m) => {
      const nm = m.name;
      const isOn = nm in (s.splits || {});
      const hours = isOn ? (Number(s.splits[nm]) || 0) : 0;

      const checkbox = el("input", {
        type: "checkbox",
        checked: isOn,
        onchange: (e) => {
          if (e.target.checked) {
            // New member joining: give them an even slice of whatever isn't allocated yet
            // (or an even share of the total if nothing's allocated).
            const remaining = Math.max(0, (Number(s.totalHours) || 0) - sharedAllocated(s));
            const others = sharedMembers(s).length; // before adding
            const seed = others === 0
              ? (Number(s.totalHours) || 0)
              : (remaining > 0 ? remaining : 0);
            s.splits[nm] = roundTo(seed, 2);
          } else {
            delete s.splits[nm];
          }
          syncShared(s.id);
        },
      });
      const hoursInput = el("input", {
        type: "number", min: "0", step: "0.5",
        class: "split-hours",
        value: hours,
        disabled: !isOn,
        oninput: (e) => {
          if (!(nm in s.splits)) return;
          s.splits[nm] = Math.max(0, Number(e.target.value) || 0);
          syncSharedFields(s.id);
        },
      });

      wrap.appendChild(el("label", { class: "split-chip" + (isOn ? " on" : "") }, [
        checkbox,
        el("span", { class: "split-name" }, nm || "(unnamed)"),
        hoursInput,
        el("span", { class: "split-unit" }, "h"),
      ]));
    });
    return wrap;
  }

  function renderPersonCards() {
    const root = $("#person-cards");
    root.innerHTML = "";
    if (!state.team.length) {
      root.appendChild(el("div", { class: "empty-state" }, "Add team members above to get cards here."));
      return;
    }
    state.team.forEach((m, idx) => {
      const tint = TINTS[idx % TINTS.length];
      const avail = availableHours(m);
      const planned = plannedFor(m.name);
      const cls = feasibilityClass(planned, avail);
      const remain = avail - planned;
      const fillPct = avail > 0 ? Math.min(100, (planned / avail) * 100) : 0;
      const initial = (m.name || "?").trim().charAt(0).toUpperCase();
      const rows = state.assignments[m.name] || [];

      const card = el("div", { class: "person-card", dataset: { person: m.name || "" } }, [
        el("div", { class: "head " + tint }, [
          el("span", { class: "name" }, [
            el("span", { class: "avatar" }, initial),
            m.name || "(unnamed)",
          ]),
          el("span", { class: "summary-pill " + cls }, fmt(planned) + "h / " + fmt(avail) + "h • " + fmt(Math.max(0, remain)) + "h left"),
        ]),
        el("div", { class: "workload-bar" }, el("div", { class: "workload-fill " + cls, style: { width: fillPct + "%" } })),
        el("div", { class: "body" }, [
          renderPersonRows(m.name, rows),
          el("button", { class: "add-row-btn", onclick: () => addAssignment(m.name) }, "+ Add JIRA for " + (m.name || "this teammate")),
        ]),
      ]);
      root.appendChild(card);
    });
    bindMics();
  }

  function renderPersonRows(personName, rows) {
    if (!rows.length) return el("div", { class: "empty-state" }, "No JIRAs yet. Click + Add JIRA.");
    const table = el("table", { class: "data editable" }, [
      el("thead", null, el("tr", null, [
        el("th", { style: "width: 38%" }, "JIRA"),
        el("th", { class: "cen", style: "width: 10%" }, "Hours"),
        el("th", { class: "cen", style: "width: 18%" }, "Start"),
        el("th", { class: "cen", style: "width: 18%" }, "End"),
        el("th", { class: "cen", style: "width: 80px" }, ""),
        el("th", { style: "width: 40px" }, ""),
      ])),
      el("tbody", null, rows.map((row, idx) => {
        const isShared = !!row.sharedId;
        return el("tr", null, [
          el("td", null,
            isShared
              ? el("input", {
                class: "cell", type: "text", value: row.jira || "", readOnly: true, title: "From shared JIRA",
                dataset: { sharedId: row.sharedId, sharedPerson: personName, sharedField: "jira" },
              })
              : makeInput("text", row.jira, (v) => { row.jira = v; })
          ),
          el("td", { class: "cen" }, isShared
            ? el("input", {
              class: "cell", type: "number", value: row.hours, readOnly: true, title: "Locked: from shared JIRA",
              dataset: { sharedId: row.sharedId, sharedPerson: personName, sharedField: "hours" },
            })
            : makeInput("number", row.hours, (v) => {
                row.hours = Math.max(0, Number(v) || 0);
                renderFeasibility(); renderMetricStrip(); refreshPersonHeader(personName);
              })),
          el("td", { class: "cen" }, makeInput("date", row.startDate, (v) => { row.startDate = v; })),
          el("td", { class: "cen" }, makeInput("date", row.endDate, (v) => { row.endDate = v; })),
          el("td", { class: "cen" }, isShared ? el("span", { class: "shared-pill" }, "shared") : ""),
          el("td", null, isShared
            ? el("span", { class: "row-del", title: "Remove via Shared JIRA section above", style: { opacity: "0.3", cursor: "not-allowed" } }, "✕")
            : el("button", { class: "row-del", onclick: () => {
                state.assignments[personName].splice(idx, 1);
                renderPersonCards(); renderFeasibility(); renderMetricStrip();
              } }, "✕")),
        ]);
      })),
    ]);
    return table;
  }

  function refreshPersonHeader(personName) {
    const idx = state.team.findIndex((m) => m.name === personName);
    if (idx < 0) return;
    const m = state.team[idx];
    const avail = availableHours(m);
    const planned = plannedFor(m.name);
    const cls = feasibilityClass(planned, avail);
    const remain = avail - planned;
    const fillPct = avail > 0 ? Math.min(100, (planned / avail) * 100) : 0;
    const cards = document.querySelectorAll("#person-cards .person-card");
    const card = cards[idx];
    if (!card) return;
    const pill = card.querySelector(".head .summary-pill");
    if (pill) {
      pill.className = "summary-pill " + cls;
      pill.textContent = fmt(planned) + "h / " + fmt(avail) + "h • " + fmt(Math.max(0, remain)) + "h left";
    }
    const fill = card.querySelector(".workload-fill");
    if (fill) {
      fill.className = "workload-fill " + cls;
      fill.style.width = fillPct + "%";
    }
  }

  function addAssignment(personName) {
    if (!state.assignments[personName]) state.assignments[personName] = [];
    state.assignments[personName].push({
      id: uid(), jira: "", hours: 0,
      startDate: state.sprint.startDate || "", endDate: state.sprint.endDate || "",
      sharedId: null,
    });
    renderPersonCards();
  }

  // ---------- Shared sync ----------

  function syncShared(sharedId) {
    syncSharedSilent(sharedId);
    renderPerPerson();
    renderFeasibility();
    renderMetricStrip();
  }

  function addSharedJira() {
    const names = state.team.map((m) => m.name).filter(Boolean);
    const splits = {};
    const each = names.length ? roundTo(0 / names.length, 2) : 0; // start at 0h per person
    names.forEach((nm) => { splits[nm] = each; });
    state.sharedJiras.push({
      id: uid(), jira: "", totalHours: 0,
      startDate: state.sprint.startDate || "", endDate: state.sprint.endDate || "",
      splits: splits,
    });
    renderPerPerson();
  }

  // Lift legacy `memberNames` arrays onto the new `splits` map (equal split of totalHours).
  function migrateSharedSplits(jiras) {
    (jiras || []).forEach((s) => {
      if (s.splits && typeof s.splits === "object") return;
      const names = Array.isArray(s.memberNames) ? s.memberNames : [];
      const each = names.length ? Math.round((Number(s.totalHours) || 0) / names.length * 100) / 100 : 0;
      s.splits = {};
      names.forEach((nm) => { s.splits[nm] = each; });
      delete s.memberNames;
    });
  }

  // ---------- Tab switching ----------

  function companyTeamAllowsPhases() {
    return companyTeamConfig(activeCompanyTeamId).allowPhases;
  }

  function updateStructureTabsVisibility() {
    const allow = companyTeamAllowsPhases();
    const phasesTab = document.querySelector('.tab[data-tab="phases"]');
    const hint = $("#structure-hint");
    if (phasesTab) phasesTab.hidden = !allow;
    if (hint) {
      hint.textContent = allow
        ? "EE team — pick Phases or Per-Person"
        : "Per-Person only for this team";
    }
    if (!allow && state.style === "phases") setStyle("perPerson");
  }

  function setStyle(style) {
    if (style === "phases" && !companyTeamAllowsPhases()) style = "perPerson";
    state.style = style;
    $$(".tab").forEach((t) => {
      const on = t.getAttribute("data-tab") === style;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    $$(".panel").forEach((p) => p.classList.toggle("active", p.getAttribute("data-style") === style));
    if (style === "phases") {
      if (seedDefaultPhasesIfEmpty()) schedulePersistDraft();
      renderPhases();
    }
    renderMetricStrip();
    renderFeasibility();
  }

  // ---------- Company team tabs ----------

  function renderCompanyTabs() {
    const root = $("#company-tabs");
    if (!root) return;
    root.innerHTML = "";
    COMPANY_TEAMS.forEach((t) => {
      const on = t.id === activeCompanyTeamId;
      root.appendChild(el("button", {
        class: "company-tab" + (on ? " active" : ""),
        role: "tab",
        type: "button",
        "aria-selected": on ? "true" : "false",
        onclick: () => switchCompanyTeam(t.id),
      }, [
        el("span", { class: "company-tab-label" }, t.label),
        el("span", { class: "company-tab-sub" }, t.members.length + " people"),
      ]));
    });
  }

  function syncCurrentToStore() {
    readHeaderToState();
    if (!storeRoot) storeRoot = emptyStoreV3();
    if (!storeRoot.teams[activeCompanyTeamId]) {
      storeRoot.teams[activeCompanyTeamId] = { sprints: {}, lastKey: null, current: null };
    }
    storeRoot.teams[activeCompanyTeamId].current = clone(state);
    storeRoot.activeTeamId = activeCompanyTeamId;
    writeStore(storeRoot);
  }

  // Debounced draft persist — survives refresh without clicking Save (named saves still use Save).
  let persistDraftTimer = null;
  function schedulePersistDraft() {
    clearTimeout(persistDraftTimer);
    persistDraftTimer = setTimeout(() => syncCurrentToStore(), 500);
  }

  function bindAutoPersist() {
    const app = $(".app");
    if (!app || app.dataset.persistBound === "1") return;
    app.dataset.persistBound = "1";
    app.addEventListener("input", schedulePersistDraft);
    app.addEventListener("change", schedulePersistDraft);
    window.addEventListener("beforeunload", () => {
      clearTimeout(persistDraftTimer);
      syncCurrentToStore();
    });
  }

  function hydrateState(raw) {
    state = clone(raw);
    migrateTeamNames(state);
    migratePhaseDates(state.phases);
    migrateSharedSplits(state.sharedJiras);
    if (!companyTeamAllowsPhases() && state.style === "phases") state.style = "perPerson";
  }

  function loadStateForActiveTeam() {
    const bucket = storeRoot.teams[activeCompanyTeamId] || { sprints: {}, lastKey: null, current: null };
    if (bucket.current) {
      hydrateState(bucket.current);
    } else if (bucket.lastKey && bucket.sprints[bucket.lastKey]) {
      hydrateState(bucket.sprints[bucket.lastKey].state);
    } else {
      state = emptyStateForTeam(activeCompanyTeamId);
    }
  }

  function switchCompanyTeam(teamId) {
    if (teamId === activeCompanyTeamId) return;
    syncCurrentToStore();
    activeCompanyTeamId = teamId;
    storeRoot.activeTeamId = teamId;
    loadStateForActiveTeam();
    renderCompanyTabs();
    renderAll();
    updateStructureTabsVisibility();
    setStyle(state.style || "perPerson");
    toast("Switched to " + companyTeamConfig(teamId).label + " team.", "success");
  }

  // ---------- Persistence ----------

  function emptyTeamBucket() {
    return { sprints: {}, lastKey: null, current: null };
  }

  function emptyStoreV3() {
    const teams = {};
    COMPANY_TEAMS.forEach((t) => { teams[t.id] = emptyTeamBucket(); });
    return { version: 3, activeTeamId: "ee", teams };
  }

  function normalizeStore(raw) {
    const store = emptyStoreV3();
    if (!raw || typeof raw !== "object") return store;
    store.activeTeamId = COMPANY_TEAMS.some((t) => t.id === raw.activeTeamId) ? raw.activeTeamId : "ee";
    if (raw.teams && typeof raw.teams === "object") {
      COMPANY_TEAMS.forEach((t) => {
        const b = raw.teams[t.id];
        if (b && typeof b === "object") {
          store.teams[t.id] = {
            sprints: b.sprints && typeof b.sprints === "object" ? b.sprints : {},
            lastKey: b.lastKey || null,
            current: b.current || null,
          };
        }
      });
    }
    return store;
  }

  function migrateFromV2(v2) {
    const store = emptyStoreV3();
    const ee = store.teams.ee;
    ee.sprints = (v2 && v2.sprints) || {};
    ee.lastKey = (v2 && v2.lastKey) || null;
    if (ee.lastKey && ee.sprints[ee.lastKey]) {
      ee.current = clone(ee.sprints[ee.lastKey].state);
    }
    return store;
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeStore(JSON.parse(raw));
    } catch (_) { /* fall through */ }
    try {
      const v2raw = localStorage.getItem(STORAGE_KEY_V2);
      if (v2raw) return migrateFromV2(JSON.parse(v2raw));
    } catch (_) { /* fall through */ }
    return emptyStoreV3();
  }

  function writeStore(store) { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }

  function teamBucket() {
    if (!storeRoot) storeRoot = loadStore();
    if (!storeRoot.teams[activeCompanyTeamId]) storeRoot.teams[activeCompanyTeamId] = emptyTeamBucket();
    return storeRoot.teams[activeCompanyTeamId];
  }

  function clearPlanner() {
    const label = companyTeamConfig(activeCompanyTeamId).label;
    if (!confirm("Clear the " + label + " team plan? This resets the sprint, assignments, and saved plans for this team only.")) return;
    storeRoot.teams[activeCompanyTeamId] = emptyTeamBucket();
    writeStore(storeRoot);
    state = emptyStateForTeam(activeCompanyTeamId);
    renderSavedList();
    renderAll();
    updateStructureTabsVisibility();
    setStyle(state.style || "perPerson");
    toast(label + " team cleared.", "success");
  }

  function saveCurrent() {
    readHeaderToState();
    const key = (state.sprint.name || "sprint-" + (state.sprint.number || Date.now())).trim();
    const bucket = teamBucket();
    bucket.sprints[key] = { savedAt: new Date().toISOString(), state: clone(state) };
    bucket.lastKey = key;
    bucket.current = clone(state);
    storeRoot.activeTeamId = activeCompanyTeamId;
    writeStore(storeRoot);
    renderSavedList();
    toast("Saved as “" + key + "”", "success");
  }

  function loadSaved(key) {
    const bucket = teamBucket();
    if (!bucket.sprints[key]) return;
    hydrateState(bucket.sprints[key].state);
    bucket.lastKey = key;
    bucket.current = clone(state);
    writeStore(storeRoot);
    renderAll();
    updateStructureTabsVisibility();
    setStyle(state.style);
    toast("Loaded “" + key + "”", "success");
  }

  function deleteSaved(key) {
    const bucket = teamBucket();
    delete bucket.sprints[key];
    if (bucket.lastKey === key) bucket.lastKey = null;
    writeStore(storeRoot);
    renderSavedList();
  }

  function renderSavedList() {
    const bucket = teamBucket();
    const keys = Object.keys(bucket.sprints).sort();
    const bar = $("#saved-bar");
    const list = $("#saved-list");
    if (keys.length < 2) { bar.hidden = true; list.innerHTML = ""; return; }
    bar.hidden = false;
    list.innerHTML = "";
    keys.forEach((k) => {
      const isActive = k === bucket.lastKey;
      list.appendChild(el("span", { class: "saved-chip" + (isActive ? " active" : ""), title: isActive ? "Currently loaded" : "Click to load" }, [
        el("button", { class: "load", onclick: () => loadSaved(k) }, k),
        el("button", { class: "del", title: "Delete", onclick: () => { if (confirm("Delete “" + k + "”?")) deleteSaved(k); } }, "✕"),
      ]));
    });
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------- Brain dump → Cursor round-trip ----------

  // Serialize current plan for the Cursor prompt — explicit rows only (shared
  // JIRA per-person rows are derived by syncShared, so omit them here).
  function exportStateForPrompt() {
    readHeaderToState();
    const assignments = {};
    Object.keys(state.assignments || {}).forEach((nm) => {
      const rows = (state.assignments[nm] || []).filter((r) => !r.sharedId);
      if (rows.length) {
        assignments[nm] = rows.map((r) => ({
          jira: r.jira,
          hours: Number(r.hours) || 0,
          startDate: r.startDate || "",
          endDate: r.endDate || "",
        }));
      }
    });
    const out = {
      companyTeamId: activeCompanyTeamId,
      companyTeamLabel: companyTeamConfig(activeCompanyTeamId).label,
      sprint: {
        name: state.sprint.name || "",
        number: state.sprint.number || "",
        startDate: state.sprint.startDate || "",
        endDate: state.sprint.endDate || "",
        workingDaysOverride: state.sprint.workingDaysOverride ?? "",
      },
      style: state.style || "perPerson",
      team: (state.team || []).map((m) => ({
        name: m.name,
        leaveDays: m.leaveDays || 0,
        allocationPct: m.allocationPct ?? 100,
        notes: m.notes || "",
      })),
      sharedJiras: (state.sharedJiras || []).map((s) => ({
        jira: s.jira,
        totalHours: Number(s.totalHours) || 0,
        startDate: s.startDate || "",
        endDate: s.endDate || "",
        splits: { ...(s.splits || {}) },
      })),
      assignments: assignments,
    };
    if (state.style === "phases" && Array.isArray(state.phases) && state.phases.length) {
      out.phases = state.phases.map((p) => ({
        phaseName: p.phaseName,
        startDate: p.startDate || "",
        endDate: p.endDate || "",
        notes: p.notes || "",
        assignments: (p.assignments || []).map((a) => ({
          personName: a.personName,
          allocationPct: a.allocationPct ?? 100,
        })),
      }));
    }
    return out;
  }

  async function copyCursorPrompt() {
    readHeaderToState();
    let template;
    try {
      const res = await fetch("prompt-template.md", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      template = await res.text();
    } catch (err) {
      toast("Couldn't load prompt-template.md (" + err.message + "). Serve the planner over http://, not file://.", "error");
      return;
    }
    const dump = (state.brainDump || "").trim();
    const stateJson = JSON.stringify(exportStateForPrompt(), null, 2);
    let filled = template.replace("<CURRENT PLANNER STATE>", stateJson);
    filled = dump
      ? filled.replace("<PASTE YOUR DICTATION HERE>", dump)
      : filled.replace("<PASTE YOUR DICTATION HERE>", "(No extra instructions — return the current state unchanged.)");
    try {
      await navigator.clipboard.writeText(filled);
      toast(dump ? "Prompt + plan + notes copied. Paste into Cursor chat." : "Prompt + current plan copied. Add notes in brain dump first, or paste as-is.", "success");
    } catch (err) {
      // Clipboard API can be blocked; fall back to a textarea + execCommand.
      const ta = document.createElement("textarea");
      ta.value = filled; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast("Prompt copied (fallback). Paste into Cursor chat.", "success"); }
      catch (_) { toast("Couldn't copy. Open prompt-template.md manually.", "error"); }
      document.body.removeChild(ta);
    }
  }

  function syncModalScrollLock() {
    const open = !$("#csv-modal").hidden || !$("#json-modal").hidden;
    document.body.classList.toggle("modal-open", open);
  }

  function openJsonModal() {
    $("#json-error").hidden = true;
    $("#json-error").textContent = "";
    $("#json-input").value = "";
    const m = $("#json-modal");
    m.hidden = false;
    m.setAttribute("aria-hidden", "false");
    m.scrollTop = 0;
    syncModalScrollLock();
    setTimeout(() => $("#json-input").focus(), 0);
  }

  function closeJsonModal() {
    const m = $("#json-modal");
    m.hidden = true;
    m.setAttribute("aria-hidden", "true");
    syncModalScrollLock();
  }

  function applyJsonFromModal() {
    const raw = $("#json-input").value.trim();
    const errBox = $("#json-error");
    errBox.hidden = true; errBox.textContent = "";
    if (!raw) { showJsonError("Paste some JSON first."); return; }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (err) { showJsonError("Invalid JSON: " + err.message); return; }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      showJsonError("Top-level value must be a JSON object.");
      return;
    }
    try {
      mergeFromJson(parsed);
    } catch (err) {
      showJsonError("Couldn't apply: " + err.message);
      return;
    }
    closeJsonModal();
    renderAll();
    setStyle(state.style || "perPerson");
    toast("Applied JSON from Cursor.", "success");
  }

  function showJsonError(msg) {
    const errBox = $("#json-error");
    errBox.textContent = msg;
    errBox.hidden = false;
  }

  // Merge parsed JSON into state. Replaces structural arrays/objects when present,
  // preserves anything not mentioned (so partial JSON is safe).
  function mergeFromJson(j) {
    readHeaderToState(); // capture latest header edits before overwriting

    if (j.sprint && typeof j.sprint === "object") {
      Object.assign(state.sprint, j.sprint);
    }
    if (j.style === "phases" || j.style === "perPerson") {
      state.style = j.style;
    }
    if (typeof j.brainDump === "string" && j.brainDump.trim()) {
      state.brainDump = j.brainDump;
    }
    if (Array.isArray(j.team)) {
      state.team = j.team.map((m) => ({
        name: String(m.name || ""),
        leaveDays: Math.max(0, Number(m.leaveDays) || 0),
        allocationPct: Math.max(0, Number(m.allocationPct) || 0),
        notes: String(m.notes || ""),
      }));
    }
    if (Array.isArray(j.phases)) {
      state.phases = j.phases.map((p) => ({
        id: uid(),
        phaseName: String(p.phaseName || ""),
        notes: String(p.notes || ""),
        startDate: String(p.startDate || ""),
        endDate: String(p.endDate || ""),
        assignments: Array.isArray(p.assignments) ? p.assignments.map((a) => ({
          id: uid(),
          personName: String(a.personName || ""),
          allocationPct: Math.max(0, Number(a.allocationPct) || 0),
        })) : [],
      }));
      migratePhaseDates(state.phases);
    }
    if (Array.isArray(j.sharedJiras)) {
      state.sharedJiras = j.sharedJiras.map((s) => {
        const splits = {};
        if (s.splits && typeof s.splits === "object") {
          Object.keys(s.splits).forEach((nm) => { splits[nm] = Math.max(0, Number(s.splits[nm]) || 0); });
        } else if (Array.isArray(s.memberNames)) {
          const each = s.memberNames.length ? (Number(s.totalHours) || 0) / s.memberNames.length : 0;
          s.memberNames.forEach((nm) => { splits[nm] = Math.max(0, Number(each) || 0); });
        }
        return {
          id: uid(),
          jira: String(s.jira || ""),
          totalHours: Math.max(0, Number(s.totalHours) || 0),
          startDate: String(s.startDate || ""),
          endDate: String(s.endDate || ""),
          splits: splits,
        };
      });
    }
    if (j.assignments && typeof j.assignments === "object" && !Array.isArray(j.assignments)) {
      const next = {};
      Object.keys(j.assignments).forEach((nm) => {
        const rows = Array.isArray(j.assignments[nm]) ? j.assignments[nm] : [];
        next[nm] = rows.map((r) => ({
          id: uid(),
          jira: String(r.jira || ""),
          hours: Math.max(0, Number(r.hours) || 0),
          startDate: String(r.startDate || ""),
          endDate: String(r.endDate || ""),
          sharedId: null, // explicit per-person rows only; shared rows are re-derived below
        }));
      });
      state.assignments = next;
    }
    // Re-derive shared JIRA rows so the locked per-person entries are in sync with the new splits.
    state.sharedJiras.forEach((s) => syncSharedSilent(s.id));
  }

  // syncShared() re-renders the whole per-person panel; during bulk import we want
  // to mutate state without intermediate renders, then renderAll() once at the end.
  function syncSharedSilent(sharedId) {
    const s = state.sharedJiras.find((x) => x.id === sharedId);
    if (!s) return;
    if (!s.splits) s.splits = {};
    const members = sharedMembers(s);
    Object.keys(state.assignments).forEach((nm) => {
      if (!members.includes(nm)) {
        state.assignments[nm] = (state.assignments[nm] || []).filter((r) => r.sharedId !== sharedId);
      }
    });
    members.forEach((nm) => {
      const personHours = Number(s.splits[nm]) || 0;
      if (!state.assignments[nm]) state.assignments[nm] = [];
      const list = state.assignments[nm];
      const existing = list.find((r) => r.sharedId === sharedId);
      if (existing) {
        existing.jira = s.jira;
        existing.hours = personHours;
        existing.startDate = s.startDate || "";
        existing.endDate = s.endDate || "";
      } else {
        list.push({
          id: uid(), jira: s.jira, hours: personHours,
          startDate: s.startDate || "", endDate: s.endDate || "", sharedId: sharedId,
        });
      }
    });
  }

  // ---------- CSV import (per-person Jira CSV) ----------

  // Soft column-name detection. We score each header against every category and
  // pick the highest-scoring header. Patterns are case-insensitive substrings —
  // standard Jira exports use "Issue key", "Summary", "Assignee", "Original
  // Estimate" (or "Σ Original Estimate" for rollups), "Start date", "Due Date".
  const CSV_HINTS = {
    key:      ["issue key", "issue id", "key"],
    summary:  ["summary", "title", "name"],
    assignee: ["assignee.name", "assignee", "owner"],
    estimate: ["σ original estimate", "original estimate", "original_estimate", "remaining estimate", "time estimate", "estimate", "story point estimate", "story points"],
    start:    ["start date", "started", "start"],
    end:      ["due date", "due", "resolved", "end date", "end"],
  };
  function detectColumn(headers, category, rows) {
    const hints = CSV_HINTS[category];
    // For assignee specifically, we also weigh "variety" — a column that's always
    // the same value (typically the report owner/manager) loses to one with many
    // distinct values. This is what makes "Assignee-V2" beat "Assignee" when
    // every row's Assignee = the manager who exported the CSV.
    const wantsVariety = category === "assignee" && Array.isArray(rows) && rows.length > 1;
    function uniqueCount(colIdx) {
      if (colIdx === null) return 0;
      const header = headers[colIdx];
      const seen = new Set();
      for (const r of rows) {
        const v = r && r[header];
        if (v && !isBlankToken(v)) seen.add(String(v).trim().toLowerCase());
      }
      return seen.size;
    }
    let best = null, bestScore = -Infinity;
    headers.forEach((h, i) => {
      const lo = String(h || "").toLowerCase().trim();
      if (!lo) return;
      hints.forEach((hint, rank) => {
        let score = lo === hint ? 1000 - rank
                  : lo.includes(hint) ? 100 - rank - Math.abs(lo.length - hint.length)
                  : -Infinity;
        if (score === -Infinity) return;
        if (wantsVariety) {
          const uniq = uniqueCount(i);
          // Heavy penalty for "stuck" columns (only 0 or 1 distinct value) — that's
          // typically the reporter/manager echoed on every row, not the real assignee.
          if (uniq <= 1) score -= 2000;
          else score += Math.min(uniq, 10) * 20;
        }
        if (score > bestScore) { bestScore = score; best = i; }
      });
    });
    return best;
  }

  // Estimate parser. Returns hours (rounded to 0.5).
  //   "8"      -> 8 (hours) or 0 (seconds if unit=seconds)
  //   "8h"     -> 8
  //   "1d"     -> HOURS_PER_DAY
  //   "1d 4h"  -> HOURS_PER_DAY + 4
  //   "30m"    -> 0.5
  //   "28800"  -> auto: if >=1000 assume seconds -> 8h; else hours
  //   "1.5"    -> 1.5
  // Jira's CSV uses em-dash, en-dash, or "—" to indicate "no value". Treat them as empty.
  function isBlankToken(s) {
    if (s === null || s === undefined) return true;
    const t = String(s).trim();
    return t === "" || t === "-" || t === "—" || t === "–" || t === "—" || t.toLowerCase() === "none" || t === "N/A";
  }

  function parseEstimate(value, unit, spHours) {
    if (isBlankToken(value)) return 0;
    const raw = String(value).trim();
    if (unit === "storypoints") {
      const n = parseFloat(raw);
      return isFinite(n) ? roundHalf(n * (Number(spHours) || HOURS_PER_DAY)) : 0;
    }
    // Jira "1d 4h 30m" style
    const re = /(\d+(?:\.\d+)?)\s*(w|d|h|m|s)/gi;
    let totalH = 0, matched = false, m;
    while ((m = re.exec(raw)) !== null) {
      matched = true;
      const n = parseFloat(m[1]);
      const u = m[2].toLowerCase();
      if (u === "w") totalH += n * 5 * HOURS_PER_DAY;
      else if (u === "d") totalH += n * HOURS_PER_DAY;
      else if (u === "h") totalH += n;
      else if (u === "m") totalH += n / 60;
      else if (u === "s") totalH += n / 3600;
    }
    if (matched) return roundHalf(totalH);
    // pure number
    const n = parseFloat(raw);
    if (!isFinite(n)) return 0;
    if (unit === "seconds") return roundHalf(n / 3600);
    if (unit === "hours")   return roundHalf(n);
    // auto: anything >= 1000 is almost certainly seconds (1000s = 16.7 min;
    // smallest Jira estimate that's not human-typed in seconds is usually
    // 3600 = 1h). Below 1000, treat as hours.
    return roundHalf(n >= 1000 ? n / 3600 : n);
  }

  // Date normalization: accept "YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", ISO timestamps.
  // Returns "" if we can't make sense of it (don't guess).
  function parseDateLoose(value) {
    if (isBlankToken(value)) return "";
    const s = String(value).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (m) {
      const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      let yr = parseInt(m[3], 10);
      if (yr < 100) yr += 2000;
      // If first part > 12, it must be day-first (DD/MM/YYYY).
      // Otherwise assume Jira default (which is locale-driven — risky) and prefer DD/MM since this team is non-US.
      const isDayFirst = a > 12 || b <= 12;
      const day = isDayFirst ? a : b;
      const mon = isDayFirst ? b : a;
      return yr + "-" + String(mon).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    }
    // ISO datetime
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
    return "";
  }

  // Fuzzy assignee → team member name. Returns the matched team name (preserving casing)
  // or null if no decent match. Accepts "FirstName LastName", "first.last", "first_last", "firstname".
  function matchAssignee(rawName) {
    if (!rawName) return null;
    const lo = String(rawName).toLowerCase().trim();
    if (!lo) return null;
    const norm = lo.replace(/[._-]/g, " ").replace(/\s+/g, " ");
    let best = null, bestScore = 0;
    state.team.forEach((m) => {
      const team = (m.name || "").toLowerCase();
      if (!team) return;
      if (team === lo || team === norm) { best = m.name; bestScore = 1000; return; }
      // First name match
      const teamFirst = team.split(/\s+/)[0];
      const rawFirst = norm.split(/\s+/)[0];
      if (teamFirst === rawFirst && rawFirst.length >= 3) {
        if (bestScore < 100) { best = m.name; bestScore = 100; }
      }
      // Contains match
      if (norm.includes(team) || team.includes(rawFirst)) {
        if (bestScore < 50) { best = m.name; bestScore = 50; }
      }
    });
    return best;
  }

  // Live state for the CSV modal so the preview can re-render when mappings change.
  let csvCtx = null;

  function openCsvPicker() {
    $("#csv-file").click();
  }

  function onCsvFileSelected(evt) {
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;
    if (typeof Papa === "undefined") {
      toast("CSV parser failed to load (vendor/papaparse.min.js missing).", "error");
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => String(h || "").trim(),
      complete: (results) => {
        if (results.errors && results.errors.length) {
          // Don't abort on minor parse warnings — Jira often has trailing-comma weirdness.
          console.warn("CSV warnings:", results.errors);
        }
        const headers = results.meta && results.meta.fields ? results.meta.fields : [];
        if (!headers.length) { toast("Couldn't read any columns from " + file.name, "error"); return; }
        const dataRows = results.data || [];
        csvCtx = {
          file: file,
          headers: headers,
          rows: dataRows,
          aliases: {}, // rawAssigneeName -> teamName OR "" (skip)
          mapping: {
            key: detectColumn(headers, "key"),
            summary: detectColumn(headers, "summary"),
            assignee: detectColumn(headers, "assignee", dataRows),
            estimate: detectColumn(headers, "estimate"),
            start: detectColumn(headers, "start"),
            end: detectColumn(headers, "end"),
            estimateUnit: "auto",
            spHours: HOURS_PER_DAY,
            mode: "append",
          },
        };
        // Smart default: if the chosen estimate column looks like story points used
        // as hours (e.g. values 14, 30, 40, 64 — clearly not Fibonacci), default the
        // SP rate to 1 h/point so we don't multiply by 8 and blow capacity up.
        suggestSpHoursIfNeeded();
        openCsvModal();
      },
      error: (err) => { toast("CSV error: " + err.message, "error"); },
    });
    evt.target.value = ""; // allow re-selecting the same file
  }

  function suggestSpHoursIfNeeded() {
    if (!csvCtx) return;
    const { headers, rows, mapping } = csvCtx;
    if (mapping.estimate === null) return;
    const header = headers[mapping.estimate];
    const values = rows.map((r) => Number(r[header])).filter((n) => isFinite(n) && n > 0);
    if (values.length < 3) return;
    const headerLo = String(header || "").toLowerCase();
    const looksLikePoints = headerLo.includes("point") || headerLo.includes("story");
    if (!looksLikePoints) return;
    values.sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];
    const max = values[values.length - 1];
    // Real Fibonacci-style story points top out at 13 (or 21). If we see >= 14 anywhere,
    // or median > 5, this team is almost certainly entering hours as points.
    if (max >= 14 || median > 5) {
      mapping.estimateUnit = "storypoints";
      mapping.spHours = 1;
    }
  }

  function openCsvModal() {
    const m = $("#csv-modal");
    m.hidden = false;
    m.setAttribute("aria-hidden", "false");
    m.scrollTop = 0;
    syncModalScrollLock();
    $("#csv-error").hidden = true;
    fillCsvColumnSelects();
    bindCsvMappingChange();
    renderCsvPreview();
  }
  function closeCsvModal() {
    const m = $("#csv-modal");
    m.hidden = true;
    m.setAttribute("aria-hidden", "true");
    csvCtx = null;
    syncModalScrollLock();
  }

  function fillCsvColumnSelects() {
    const { headers, mapping } = csvCtx;
    const populate = (id, picked, includeBlank) => {
      const sel = $("#" + id);
      sel.innerHTML = "";
      if (includeBlank) sel.appendChild(el("option", { value: "" }, "(none)"));
      headers.forEach((h, i) => {
        const opt = el("option", { value: String(i) }, h || "(unnamed col " + (i + 1) + ")");
        if (picked === i) opt.selected = true;
        sel.appendChild(opt);
      });
    };
    populate("map-key",      mapping.key,      true);
    populate("map-summary",  mapping.summary,  true);
    populate("map-assignee", mapping.assignee, false);
    populate("map-estimate", mapping.estimate, false);
    populate("map-start",    mapping.start,    true);
    populate("map-end",      mapping.end,      true);
    $("#csv-filename").textContent = csvCtx.file.name;
    $("#csv-stats").textContent = csvCtx.rows.length + " row(s), " + headers.length + " column(s)";
    $("#map-estimate-unit").value = mapping.estimateUnit;
    $("#map-sp-hours").value = mapping.spHours;
    $("#sp-hours-field").hidden = mapping.estimateUnit !== "storypoints";
    $("#map-mode").value = mapping.mode;
  }

  function bindCsvMappingChange() {
    if (csvCtx._bound) return;
    csvCtx._bound = true;
    const handler = () => {
      const m = csvCtx.mapping;
      const prevAssignee = m.assignee, prevEstimate = m.estimate;
      m.key      = numOrNull($("#map-key").value);
      m.summary  = numOrNull($("#map-summary").value);
      m.assignee = numOrNull($("#map-assignee").value);
      m.estimate = numOrNull($("#map-estimate").value);
      m.start    = numOrNull($("#map-start").value);
      m.end      = numOrNull($("#map-end").value);
      m.estimateUnit = $("#map-estimate-unit").value;
      m.spHours = Number($("#map-sp-hours").value) || HOURS_PER_DAY;
      m.mode = $("#map-mode").value;
      $("#sp-hours-field").hidden = m.estimateUnit !== "storypoints";
      // If the user changed which column the assignee comes from, previously-set
      // aliases (for raw names from the OLD column) are now meaningless. Clear them.
      if (prevAssignee !== m.assignee) csvCtx.aliases = {};
      // Re-suggest SP hours if user switched the estimate column to a points-like one.
      if (prevEstimate !== m.estimate) suggestSpHoursIfNeeded();
      $("#map-estimate-unit").value = m.estimateUnit;
      $("#map-sp-hours").value = m.spHours;
      $("#sp-hours-field").hidden = m.estimateUnit !== "storypoints";
      renderCsvPreview();
    };
    ["map-key", "map-summary", "map-assignee", "map-estimate", "map-estimate-unit", "map-sp-hours", "map-start", "map-end", "map-mode"]
      .forEach((id) => $("#" + id).addEventListener("change", handler));
    $("#map-sp-hours").addEventListener("input", handler);
    $("#btn-pick-another").addEventListener("click", () => $("#csv-file").click());
  }

  function numOrNull(s) { return (s === "" || s === null || s === undefined) ? null : Number(s); }

  function buildCsvRows() {
    const { headers, rows, mapping, aliases } = csvCtx;
    const get = (row, col) => (col === null || col === undefined) ? "" : (row[headers[col]] || "");
    return rows.map((row) => {
      const key      = String(get(row, mapping.key)).trim();
      const summary  = String(get(row, mapping.summary)).trim();
      const rawAss   = String(get(row, mapping.assignee)).trim();
      const estRaw   = get(row, mapping.estimate);
      const start    = parseDateLoose(get(row, mapping.start));
      const end      = parseDateLoose(get(row, mapping.end));
      const hours    = parseEstimate(estRaw, mapping.estimateUnit, mapping.spHours);
      const jiraText = key && summary ? key + " — " + summary : (key || summary || "(no title)");
      // Resolution order: explicit user alias (incl. "" = skip) > fuzzy match
      let matched = null;
      if (rawAss) {
        if (Object.prototype.hasOwnProperty.call(aliases, rawAss)) {
          matched = aliases[rawAss] || null; // "" means skip
        } else {
          matched = matchAssignee(rawAss);
        }
      }
      return { jira: jiraText, assigneeRaw: rawAss, matched: matched, hours: hours, startDate: start, endDate: end };
    });
  }

  function uniqueUnmatched() {
    if (!csvCtx) return [];
    const { rows, mapping, headers, aliases } = csvCtx;
    if (mapping.assignee === null) return [];
    const header = headers[mapping.assignee];
    const seen = new Map(); // rawName -> count
    rows.forEach((r) => {
      const raw = String(r[header] || "").trim();
      if (!raw || isBlankToken(raw)) return;
      if (Object.prototype.hasOwnProperty.call(aliases, raw)) return; // user has already decided
      if (matchAssignee(raw)) return; // already auto-matched
      seen.set(raw, (seen.get(raw) || 0) + 1);
    });
    return Array.from(seen.entries()).map(([name, count]) => ({ name, count }));
  }

  function renderCsvRemap() {
    const wrap = $("#csv-remap-wrap");
    const list = $("#csv-remap-list");
    list.innerHTML = "";
    const unmatched = uniqueUnmatched();
    // Show the section if EITHER we have unmatched names OR the user has already aliased something
    // (so they can change their mind without re-uploading).
    const aliasedNames = Object.keys(csvCtx.aliases || {});
    if (!unmatched.length && !aliasedNames.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const toRender = [
      ...unmatched.map((u) => ({ name: u.name, count: u.count, aliased: false })),
      ...aliasedNames.map((n) => ({ name: n, count: csvCtx.rows.filter((r) => String(r[csvCtx.headers[csvCtx.mapping.assignee]] || "").trim() === n).length, aliased: true })),
    ];
    toRender.forEach(({ name, count, aliased }) => {
      const sel = el("select", { class: "cell" });
      sel.appendChild(el("option", { value: "" }, "— Skip these rows —"));
      const sep = el("option", { value: "__add__" }, "+ Add as new team member …");
      sel.appendChild(sep);
      state.team.forEach((m) => {
        const opt = el("option", { value: m.name }, "→ " + (m.name || "(unnamed)"));
        if (aliased && csvCtx.aliases[name] === m.name) opt.selected = true;
        sel.appendChild(opt);
      });
      if (aliased && csvCtx.aliases[name] === "") sel.value = "";
      sel.addEventListener("change", (e) => {
        const v = e.target.value;
        if (v === "__add__") {
          const proposed = name.split(/\s+/)[0] || name; // first name as default short label
          const shortName = prompt("Add as new team member. Short name to use in the planner:", proposed);
          if (!shortName || !shortName.trim()) { sel.value = ""; return; }
          const clean = shortName.trim();
          if (!state.team.some((m) => m.name === clean)) {
            state.team.push({ name: clean, leaveDays: 0, allocationPct: 100, notes: "From CSV: " + name });
            renderAfterTeamChange();
          }
          csvCtx.aliases[name] = clean;
        } else {
          csvCtx.aliases[name] = v; // could be "" to skip, or a team name
        }
        renderCsvRemap();
        renderCsvPreview();
      });
      list.appendChild(el("div", { class: "csv-remap-row" }, [
        el("span", { class: "csv-remap-name" }, name),
        el("span", { class: "csv-remap-count muted" }, count + " row" + (count === 1 ? "" : "s")),
        sel,
      ]));
    });
  }

  function renderCsvPreview() {
    renderCsvRemap();
    const all = buildCsvRows();
    const tbody = $("#csv-preview-table tbody");
    tbody.innerHTML = "";
    all.forEach((r) => {
      tbody.appendChild(el("tr", null, [
        el("td", { title: r.jira }, r.jira.length > 60 ? r.jira.slice(0, 57) + "…" : r.jira),
        el("td", { class: "cen" }, r.assigneeRaw || "—"),
        el("td", { class: "cen" }, r.matched
          ? el("span", { class: "shared-pill", style: { background: "var(--mint-soft)", color: "#2d7a55", borderColor: "#b8e0cc" } }, r.matched)
          : el("span", { class: "shared-pill", style: { background: "var(--rose-soft)", color: "#a83838", borderColor: "#f5bcbc" }, title: "No team member matches '" + r.assigneeRaw + "' — row will be skipped" }, "no match")),
        el("td", { class: "num" }, fmt(r.hours) + "h"),
        el("td", { class: "cen" }, r.startDate || "—"),
        el("td", { class: "cen" }, r.endDate || "—"),
      ]));
    });
    const matched = all.filter((r) => r.matched).length;
    const totalH = all.filter((r) => r.matched).reduce((a, r) => a + r.hours, 0);
    $("#csv-preview-stats").textContent =
      all.length + " rows · " +
      matched + " will import (" + fmt(totalH) + "h total) · " +
      (all.length - matched) + " skipped (no assignee match)";
    $("#btn-apply-csv").disabled = matched === 0;
    $("#csv-summary").textContent = matched > 0
      ? matched + " row(s) ready to import"
      : "No rows match any team member — adjust the Assignee column or add missing teammates first.";
  }

  function applyCsvImport() {
    if (!csvCtx) return;
    const built = buildCsvRows().filter((r) => r.matched && r.hours >= 0);
    if (!built.length) { toast("Nothing to import — no rows matched a team member.", "error"); return; }
    if (csvCtx.mapping.mode === "replace") {
      // Wipe explicit (non-shared) rows; preserve shared-derived rows so we don't break sync.
      Object.keys(state.assignments).forEach((nm) => {
        state.assignments[nm] = (state.assignments[nm] || []).filter((r) => !!r.sharedId);
      });
    }
    built.forEach((r) => {
      if (!state.assignments[r.matched]) state.assignments[r.matched] = [];
      state.assignments[r.matched].push({
        id: uid(),
        jira: r.jira,
        hours: r.hours,
        startDate: r.startDate || state.sprint.startDate || "",
        endDate: r.endDate || state.sprint.endDate || "",
        sharedId: null,
      });
    });
    // Switch to per-person view so the user sees the result immediately.
    state.style = "perPerson";
    closeCsvModal();
    renderAll();
    setStyle("perPerson");
    toast("Imported " + built.length + " row(s) from CSV.", "success");
  }

  // ---------- HTML import (round-trip downloaded release plans) ----------

  function openHtmlPicker() {
    const input = $("#html-file");
    input.value = "";
    input.click();
  }

  function onHtmlFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { applyHtmlImport(String(reader.result || ""), file.name); }
      catch (err) { toast("Import failed: " + err.message, "error"); }
    };
    reader.onerror = () => toast("Couldn't read file.", "error");
    reader.readAsText(file);
  }

  function applyHtmlImport(html, filename) {
    const G = window.SprintGenerator;
    if (!G || typeof G.parseStateFromHtml !== "function") {
      toast("HTML parser failed to load.", "error");
      return;
    }
    const result = G.parseStateFromHtml(html);
    if (!result.state) {
      toast(result.error || "Couldn't import this HTML.", "error");
      return;
    }
    mergeFromJson(result.state);
    if (!companyTeamAllowsPhases() && state.style === "phases") state.style = "perPerson";
    renderAll();
    updateStructureTabsVisibility();
    setStyle(state.style || "perPerson");
    const label = filename || "HTML";
    if (result.source === "embed") {
      toast("Imported “" + label + "” — edit, then Download HTML again.", "success");
    } else {
      toast("Imported “" + label + "” from layout (older file). Re-download after edits for full round-trip.", "success");
    }
  }

  // ---------- Preview / Download ----------

  function buildHtml() {
    readHeaderToState();
    return window.SprintGenerator.renderSprintHtml(state);
  }

  function previewInNewTab() {
    const html = buildHtml();
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const w = window.open(url, "_blank");
    if (!w) { toast("Popup blocked — allow popups for preview.", "error"); return; }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function downloadHtml() {
    const html = buildHtml();
    const num = state.sprint.number ? String(state.sprint.number).padStart(2, "0") : "xx";
    const fname = "sprint-" + num + "-release-plan.html";
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = el("a", { href: url, download: fname });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast("Downloaded " + fname, "success");
  }

  // ---------- Header read ----------

  function readHeaderToState() {
    state.sprint.name = $("#sprint-name").value;
    state.sprint.number = $("#sprint-number").value;
    state.sprint.startDate = $("#sprint-start").value;
    state.sprint.endDate = $("#sprint-end").value;
    state.brainDump = $("#brain-dump").value;
  }

  function updateMetricsLight() {
    renderFeasibility(); renderMetricStrip();
  }

  // ---------- Render orchestrator ----------

  function renderAll() {
    renderCompanyTabs();
    renderHeader();
    renderTeam();
    renderFeasibility();
    renderMetricStrip();
    renderPhases();
    renderPerPerson();
    updateStructureTabsVisibility();
    setStyle(state.style || "perPerson");
    bindMics();
  }

  // ---------- Wire everything ----------

  function bindHeader() {
    $("#sprint-name").addEventListener("input", () => {
      state.sprint.name = $("#sprint-name").value;
      $("#page-title").textContent = state.sprint.name
        || companyTeamConfig(activeCompanyTeamId).label + " — new sprint";
    });
    $("#sprint-number").addEventListener("input", () => { state.sprint.number = $("#sprint-number").value; });
    $("#sprint-start").addEventListener("input", () => {
      state.sprint.startDate = $("#sprint-start").value;
      if (state.sprint.startDate && !state.sprint.endDate) {
        const d = new Date(state.sprint.startDate + "T00:00:00");
        d.setDate(d.getDate() + 13);
        state.sprint.endDate = d.toISOString().slice(0, 10);
        $("#sprint-end").value = state.sprint.endDate;
      }
      refreshWorkingDays();
      renderTeam(); renderFeasibility(); renderMetricStrip();
    });
    $("#sprint-end").addEventListener("input", () => {
      state.sprint.endDate = $("#sprint-end").value;
      refreshWorkingDays();
      renderTeam(); renderFeasibility(); renderMetricStrip();
    });
    $("#sprint-workingdays").addEventListener("input", () => {
      const v = $("#sprint-workingdays").value.trim();
      const auto = autoWorkingDays();
      // Treat blank OR a value matching the auto-computed number as "no override"
      // — that way clearing the field or typing 10 when auto is 10 both stay on auto.
      state.sprint.workingDaysOverride = (v === "" || Number(v) === auto) ? "" : v;
      refreshWorkingDays();
      renderTeam(); renderFeasibility(); renderMetricStrip();
    });
    $("#sprint-workingdays").addEventListener("blur", () => {
      // If user left the field empty, repopulate with the auto value so the pill is never blank.
      if ($("#sprint-workingdays").value.trim() === "") refreshWorkingDays();
    });
    $("#brain-dump").addEventListener("input", () => { state.brainDump = $("#brain-dump").value; });
  }

  function refreshWorkingDays() {
    const input = $("#sprint-workingdays");
    const pill = input.closest(".working-days-pill");
    const auto = autoWorkingDays();
    const ov = state.sprint.workingDaysOverride;
    const hasOverride = ov !== "" && ov !== null && ov !== undefined && Number(ov) > 0;
    // Always show the effective number in the input (auto OR override).
    // Don't clobber while the user is mid-edit (focus check).
    if (document.activeElement !== input) {
      input.value = hasOverride ? ov : auto;
    }
    input.title = hasOverride
      ? "Override: " + ov + " (auto would be " + auto + "). Clear to revert."
      : "Auto-computed from start/end (weekends excluded). Type to override.";
    if (pill) pill.classList.toggle("override", !!hasOverride);
  }

  function bindActions() {
    $("#btn-preview").addEventListener("click", previewInNewTab);
    $("#btn-download").addEventListener("click", downloadHtml);
    $("#btn-save").addEventListener("click", saveCurrent);
    $("#btn-clear").addEventListener("click", clearPlanner);
    $("#btn-feasibility").addEventListener("click", () => {
      renderFeasibility();
      const rose = document.querySelector(".feas-bar-row.rose");
      if (rose) {
        rose.scrollIntoView({ behavior: "smooth", block: "center" });
        toast("Over-booked teammate(s) highlighted.", "error");
      } else if (state.team.length) {
        toast("All teammates within capacity.", "success");
      }
    });

    $("#btn-copy-prompt").addEventListener("click", copyCursorPrompt);
    $("#btn-copy-rovo").addEventListener("click", async () => {
      const text = ($("#rovo-prompt") && $("#rovo-prompt").textContent) || "";
      try {
        await navigator.clipboard.writeText(text.trim());
        toast("ROVO prompt copied. Paste into Jira ROVO.", "success");
      } catch (_) {
        toast("Copy failed — select the prompt text manually.", "error");
      }
    });

    $("#btn-guide-preview").addEventListener("click", () => {
      const w = window.open("user-guide.html", "_blank", "noopener");
      if (!w) toast("Popup blocked — allow popups to preview the user guide.", "error");
    });
    $("#btn-paste-json").addEventListener("click", openJsonModal);
    $("#btn-apply-json").addEventListener("click", applyJsonFromModal);
    $("#btn-import-csv").addEventListener("click", openCsvPicker);
    $("#btn-import-html").addEventListener("click", openHtmlPicker);
    $("#html-file").addEventListener("change", onHtmlFileSelected);
    $("#csv-file").addEventListener("change", onCsvFileSelected);
    $("#btn-apply-csv").addEventListener("click", applyCsvImport);
    document.body.addEventListener("click", (e) => {
      if (e.target.closest("[data-close-modal]")) {
        if (!$("#json-modal").hidden) closeJsonModal();
        if (!$("#csv-modal").hidden)  closeCsvModal();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!$("#json-modal").hidden) closeJsonModal();
        if (!$("#csv-modal").hidden)  closeCsvModal();
      }
    });

    document.body.addEventListener("click", (e) => {
      const t = e.target.closest("[data-add]");
      if (!t) return;
      const kind = t.getAttribute("data-add");
      if (kind === "team") {
        state.team.push({ name: "", leaveDays: 0, allocationPct: 100, notes: "" });
        renderAfterTeamChange();
      } else if (kind === "phase") {
        addPhase();
      } else if (kind === "shared") {
        addSharedJira();
      }
    });

    $$(".tab").forEach((tab) => {
      tab.addEventListener("click", () => setStyle(tab.getAttribute("data-tab")));
    });
  }

  // ---------- Boot ----------

  // Browsers only open the native date picker when you click the small calendar
  // icon (or focus + press a key). Delegating a click anywhere on a date input to
  // `showPicker()` makes the whole field clickable. Wrapped in try/catch because
  // older browsers don't expose showPicker and will throw.
  function enableClickAnywhereDatePicker() {
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!t || t.tagName !== "INPUT" || t.type !== "date") return;
      if (t.disabled || t.readOnly) return;
      if (typeof t.showPicker !== "function") return;
      try { t.showPicker(); } catch (_) { /* user-gesture lost or unsupported */ }
    });
  }

  function boot() {
    bindHeader();
    bindActions();
    bindAutoPersist();
    enableClickAnywhereDatePicker();

    storeRoot = loadStore();
    activeCompanyTeamId = storeRoot.activeTeamId || "ee";
    loadStateForActiveTeam();
    renderSavedList();
    renderAll();
    setStyle(state.style || "perPerson");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // expose for debugging
  window.__planner = {
    get state() { return state; },
    get activeCompanyTeamId() { return activeCompanyTeamId; },
    COMPANY_TEAMS,
    syncShared,
  };
})();
