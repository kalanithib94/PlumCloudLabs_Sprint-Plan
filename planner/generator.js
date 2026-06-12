// generator.js — pure renderSprintHtml(state) -> standalone pastel HTML string.
// Branches on state.style: "phases" or "perPerson". No DOM dependencies; safe to call from node.

(function (root) {
  "use strict";

  const HOURS_PER_DAY = 8;
  const TINTS = ["tint-mint", "tint-lavender", "tint-peach", "tint-sky", "tint-rose", "tint-sand"];

  function escapeHtml(s) {
    if (s === undefined || s === null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseDate(s) {
    if (!s) return null;
    const d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }
  function workingDaysBetween(a, b) {
    const x = parseDate(a), y = parseDate(b);
    if (!x || !y || y < x) return 0;
    let count = 0, d = new Date(x);
    while (d <= y) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }
  function sprintWorkingDays(state) {
    // Honor an explicit override first (set e.g. to 9 when a public holiday lands in the sprint),
    // then fall back to weekday count between dates, then to a 10-day default.
    const ov = state.sprint.workingDaysOverride;
    const ovN = Number(ov);
    if (ov !== "" && ov !== null && ov !== undefined && !isNaN(ovN) && ovN > 0) return ovN;
    const w = workingDaysBetween(state.sprint.startDate, state.sprint.endDate);
    return w > 0 ? w : 10;
  }
  function availableHours(member, wd) {
    const leave = Math.max(0, Number(member.leaveDays) || 0);
    const alloc = Math.max(0, Number(member.allocationPct) || 0);
    return Math.max(0, (wd - leave) * HOURS_PER_DAY * alloc / 100);
  }
  function phaseRowHours(phase, row) {
    const wd = workingDaysBetween(phase.startDate, phase.endDate);
    const alloc = Math.max(0, Number(row.allocationPct) || 0);
    // Round to nearest half-hour so rows show clean numbers (16, 16.5, 17) and totals add up.
    return Math.round(wd * HOURS_PER_DAY * alloc / 100 * 2) / 2;
  }
  function plannedFor(state, name) {
    if (state.style === "phases") {
      let sum = 0;
      (state.phases || []).forEach((p) => (p.assignments || []).forEach((a) => {
        if (a.personName === name) sum += phaseRowHours(p, a);
      }));
      return sum;
    }
    return ((state.assignments || {})[name] || []).reduce((a, r) => a + (Number(r.hours) || 0), 0);
  }
  function feasClass(planned, avail) {
    if (avail <= 0) return planned > 0 ? "rose" : "green";
    const r = planned / avail;
    if (r > 1) return "rose";
    if (r > 0.8) return "amber";
    return "green";
  }
  function fmt(n) {
    const x = Math.round(n * 10) / 10;
    return Number.isInteger(x) ? String(x) : x.toFixed(1);
  }

  function fillDefaults(input) {
    const phases = Array.isArray(input.phases) ? input.phases : [];
    // Backwards compatibility: phases used to store dates per assignment row.
    // Lift them onto the phase header here so older saved sprints still render.
    phases.forEach((p) => {
      if (p.startDate === undefined) p.startDate = "";
      if (p.endDate === undefined) p.endDate = "";
      if ((!p.startDate || !p.endDate) && Array.isArray(p.assignments)) {
        const withDates = p.assignments.find((a) => a && (a.startDate || a.endDate));
        if (withDates) {
          if (!p.startDate) p.startDate = withDates.startDate || "";
          if (!p.endDate) p.endDate = withDates.endDate || "";
        }
      }
    });
    const sharedJiras = Array.isArray(input.sharedJiras) ? input.sharedJiras : [];
    // Backwards compatibility: legacy shape stored `memberNames` (array) with implicit equal split.
    // New shape stores `splits` (map of name -> hours).
    sharedJiras.forEach((s) => {
      if (s.splits && typeof s.splits === "object") return;
      const names = Array.isArray(s.memberNames) ? s.memberNames : [];
      const each = names.length ? Math.round((Number(s.totalHours) || 0) / names.length * 100) / 100 : 0;
      s.splits = {};
      names.forEach((nm) => { s.splits[nm] = each; });
    });
    return {
      sprint: Object.assign({ name: "", number: "", startDate: "", endDate: "" }, input.sprint || {}),
      style: input.style === "phases" ? "phases" : "perPerson",
      brainDump: input.brainDump || "",
      team: Array.isArray(input.team) ? input.team : [],
      phases: phases,
      sharedJiras: sharedJiras,
      assignments: input.assignments && typeof input.assignments === "object" ? input.assignments : {},
    };
  }

  function renderMetricStrip(state, wd) {
    const cap = state.team.reduce((a, m) => a + availableHours(m, wd), 0);
    const planned = state.team.reduce((a, m) => a + plannedFor(state, m.name), 0);
    const buffer = Math.max(0, cap - planned);
    return `<div class="metric-strip">
      <span class="metric-pill"><strong>${fmt(cap)}</strong>h capacity</span>
      <span class="metric-pill"><strong>${fmt(planned)}</strong>h planned</span>
      <span class="metric-pill"><strong>${fmt(buffer)}</strong>h buffer</span>
      <span class="metric-pill"><strong>${state.team.length}</strong> members</span>
      <span class="metric-pill"><strong>${wd}</strong> working days</span>
    </div>`;
  }

  function renderFeasibility(state, wd) {
    if (!state.team.length) return `<div class="feasibility-empty">No team yet.</div>`;
    const maxScale = Math.max(
      1,
      ...state.team.map((m) => Math.max(plannedFor(state, m.name), availableHours(m, wd), 0))
    );
    const bars = state.team.map((m) => {
      const avail = availableHours(m, wd);
      const planned = plannedFor(state, m.name);
      const cls = feasClass(planned, avail);
      const pct = avail > 0 ? Math.round((planned / avail) * 100) : (planned > 0 ? 999 : 0);
      const capW = (avail / maxScale) * 100;
      const planW = (planned / maxScale) * 100;
      return `<div class="feas-bar-row ${cls}">
        <span class="feas-bar-name">${escapeHtml(m.name)}</span>
        <div class="feas-bar-track-wrap">
          <div class="feas-bar-track">
            <div class="feas-bar-cap" style="width:${capW}%"></div>
            <div class="feas-bar-fill" style="width:${planW}%"></div>
          </div>
        </div>
        <span class="feas-bar-meta">${fmt(planned)}h / ${fmt(avail)}h (${pct}%)</span>
      </div>`;
    }).join("");
    return `<div class="feasibility"><div class="feasibility-bars">${bars}</div></div>`;
  }

  function renderTeamTable(state, wd) {
    if (!state.team.length) return "";
    const rows = state.team.map((m) => `<tr>
      <td>${escapeHtml(m.name)}</td>
      <td class="cen">${Number(m.leaveDays) || 0}</td>
      <td class="cen">${Number(m.allocationPct) || 0}%</td>
      <td class="num">${fmt(availableHours(m, wd))}h</td>
      <td>${escapeHtml(m.notes || "")}</td>
    </tr>`).join("");
    return `<table class="data">
      <thead><tr>
        <th>Member</th><th class="cen">Leave days</th><th class="cen">Alloc %</th>
        <th class="num">Available hours</th><th>Notes</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function renderPhaseCards(state) {
    if (!state.phases.length) return `<div class="empty-state">No phases defined.</div>`;
    return state.phases.map((p, idx) => {
      const tint = TINTS[idx % TINTS.length];
      const total = p.assignments.reduce((a, r) => a + phaseRowHours(p, r), 0);
      const rows = p.assignments.map((a) => `<tr>
        <td>${escapeHtml(a.personName)}</td>
        <td class="cen">${Number(a.allocationPct) || 0}%</td>
        <td class="num">${fmt(phaseRowHours(p, a))}h</td>
      </tr>`).join("");
      const body = p.assignments.length
        ? `<table class="data">
            <thead><tr><th>Person</th><th class="cen">Alloc %</th><th class="num">Hours</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`
        : `<div class="empty-state">No people assigned.</div>`;
      const dateLine = (p.startDate || p.endDate)
        ? `<span class="phase-dates">${escapeHtml(p.startDate || "—")} → ${escapeHtml(p.endDate || "—")}</span>`
        : `<span class="phase-dates muted">Dates not set</span>`;
      return `<div class="phase-card">
        <div class="head ${tint}">
          <span class="name">${escapeHtml(p.phaseName || "Untitled phase")}</span>
          ${dateLine}
          <span class="summary-pill">${fmt(total)}h total</span>
        </div>
        <div class="body">${body}</div>
      </div>`;
    }).join("");
  }

  function renderSharedTable(state) {
    if (!state.sharedJiras.length) return `<div class="empty-state">No shared JIRAs.</div>`;
    const rows = state.sharedJiras.map((s) => {
      const splits = s.splits || {};
      const names = Object.keys(splits);
      const allocated = names.reduce((a, n) => a + (Number(splits[n]) || 0), 0);
      const total = Number(s.totalHours) || 0;
      const diff = Math.round((allocated - total) * 100) / 100;
      let allocCls = "green";
      if (total > 0 && Math.abs(diff) > 0.05) allocCls = diff > 0 ? "rose" : "amber";
      else if (total === 0 && allocated > 0) allocCls = "amber";
      const chips = names
        .map((n) => `<span class="chip on">${escapeHtml(n)} <strong>${fmt(Number(splits[n]) || 0)}h</strong></span>`)
        .join(" ");
      return `<tr>
        <td>${escapeHtml(s.jira)}</td>
        <td class="num">${fmt(total)}h</td>
        <td class="cen">${escapeHtml(s.startDate || "—")}</td>
        <td class="cen">${escapeHtml(s.endDate || "—")}</td>
        <td>${chips || "—"}</td>
        <td class="cen"><span class="summary-pill ${allocCls}">${fmt(allocated)}h / ${fmt(total)}h</span></td>
      </tr>`;
    }).join("");
    return `<table class="data">
      <thead><tr>
        <th>JIRA</th><th class="num">Total</th><th class="cen">Start</th><th class="cen">End</th>
        <th>Per-person split</th><th class="cen">Allocated</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function renderPersonCards(state, wd) {
    if (!state.team.length) return `<div class="empty-state">No team yet.</div>`;
    return state.team.map((m, idx) => {
      const tint = TINTS[idx % TINTS.length];
      const avail = availableHours(m, wd);
      const planned = plannedFor(state, m.name);
      const cls = feasClass(planned, avail);
      const remain = Math.max(0, avail - planned);
      const fill = avail > 0 ? Math.min(100, (planned / avail) * 100) : 0;
      const rows = (state.assignments[m.name] || []);
      const body = rows.length
        ? `<table class="data">
            <thead><tr><th>JIRA</th><th class="cen">Hours</th><th class="cen">Start</th><th class="cen">End</th><th></th></tr></thead>
            <tbody>${rows.map((r) => `<tr>
              <td>${escapeHtml(r.jira || "—")}</td>
              <td class="cen">${fmt(Number(r.hours) || 0)}h</td>
              <td class="cen">${escapeHtml(r.startDate || "—")}</td>
              <td class="cen">${escapeHtml(r.endDate || "—")}</td>
              <td>${r.sharedId ? `<span class="shared-pill">shared</span>` : ""}</td>
            </tr>`).join("")}</tbody>
          </table>`
        : `<div class="empty-state">No JIRAs.</div>`;
      const initial = (m.name || "?").trim().charAt(0).toUpperCase();
      return `<div class="person-card">
        <div class="head ${tint}">
          <span class="name"><span class="avatar">${escapeHtml(initial)}</span>${escapeHtml(m.name)}</span>
          <span class="summary-pill ${cls}">${fmt(planned)}h / ${fmt(avail)}h • ${fmt(remain)}h left</span>
        </div>
        <div class="workload-bar"><div class="workload-fill ${cls}" style="width:${fill.toFixed(1)}%"></div></div>
        <div class="body">${body}</div>
      </div>`;
    }).join("");
  }

  const STATE_SCRIPT_ID = "sprint-planner-state";

  function serializeStateForEmbed(input) {
    const state = fillDefaults(input);
    const assignments = {};
    Object.keys(state.assignments || {}).forEach((nm) => {
      const rows = (state.assignments[nm] || []).filter((r) => !r.sharedId);
      if (rows.length) {
        assignments[nm] = rows.map((r) => ({
          jira: r.jira || "",
          hours: Number(r.hours) || 0,
          startDate: r.startDate || "",
          endDate: r.endDate || "",
        }));
      }
    });
    const out = {
      sprint: {
        name: state.sprint.name || "",
        number: state.sprint.number || "",
        startDate: state.sprint.startDate || "",
        endDate: state.sprint.endDate || "",
        workingDaysOverride: state.sprint.workingDaysOverride ?? "",
      },
      style: state.style,
      team: state.team.map((m) => ({
        name: m.name,
        leaveDays: Number(m.leaveDays) || 0,
        allocationPct: Number(m.allocationPct ?? 100),
        notes: m.notes || "",
      })),
      sharedJiras: (state.sharedJiras || []).map((s) => ({
        jira: s.jira || "",
        totalHours: Number(s.totalHours) || 0,
        startDate: s.startDate || "",
        endDate: s.endDate || "",
        splits: Object.assign({}, s.splits || {}),
      })),
      assignments: assignments,
    };
    if (state.style === "phases") {
      out.phases = (state.phases || []).map((p) => ({
        phaseName: p.phaseName || "",
        startDate: p.startDate || "",
        endDate: p.endDate || "",
        notes: p.notes || "",
        assignments: (p.assignments || []).map((a) => ({
          personName: a.personName || "",
          allocationPct: Number(a.allocationPct ?? 100),
        })),
      }));
    }
    return out;
  }

  function safeJsonForScript(obj) {
    return JSON.stringify(obj).replace(/</g, "\\u003c");
  }

  function parseHoursText(text) {
    const m = String(text || "").match(/([\d.]+)/);
    return m ? Number(m[1]) : 0;
  }

  function parseCellDate(text) {
    const t = String(text || "").trim();
    return !t || t === "—" || t === "-" || t === "–" ? "" : t;
  }

  function personNameFromCard(nameEl) {
    if (!nameEl) return "";
    const clone = nameEl.cloneNode(true);
    const av = clone.querySelector(".avatar");
    if (av) av.remove();
    return clone.textContent.trim();
  }

  function scrapeStateFromDocument(doc) {
    const h1 = doc.querySelector("h1");
    const title = h1 ? h1.textContent.trim() : "";
    const numMatch = title.match(/Sprint\s+(\d+)/i);
    const sub = doc.querySelector(".subtitle");
    const subText = sub ? sub.textContent.trim() : "";
    let startDate = "";
    let endDate = "";
    let workingDaysOverride = "";
    let style = "perPerson";
    const dateMatch = subText.match(/^(.+?)\s*→\s*(.+?)\s*·\s*(\d+(?:\.\d+)?)\s*working days\s*·\s*(.+)$/i);
    if (dateMatch) {
      startDate = dateMatch[1].trim();
      endDate = dateMatch[2].trim();
      if (startDate === "Dates not set") startDate = "";
      if (endDate === "Dates not set") endDate = "";
      workingDaysOverride = dateMatch[3];
      style = /phases/i.test(dateMatch[4]) ? "phases" : "perPerson";
    }

    const team = [];
    const teamSection = Array.from(doc.querySelectorAll("section")).find((s) => {
      const h2 = s.querySelector(":scope > h2");
      return h2 && /^team$/i.test(h2.textContent.trim());
    });
    if (teamSection) {
      teamSection.querySelectorAll("table.data tbody tr").forEach((tr) => {
        const cells = tr.querySelectorAll("td");
        if (cells.length < 4) return;
        team.push({
          name: cells[0].textContent.trim(),
          leaveDays: parseHoursText(cells[1].textContent),
          allocationPct: parseHoursText(cells[2].textContent),
          notes: (cells[4] && cells[4].textContent.trim()) || "",
        });
      });
    }

    const sharedJiras = [];
    const sharedSection = Array.from(doc.querySelectorAll("section")).find((s) => {
      const h2 = s.querySelector(":scope > h2");
      return h2 && /^shared jiras$/i.test(h2.textContent.trim());
    });
    if (sharedSection && !sharedSection.querySelector(".empty-state")) {
      sharedSection.querySelectorAll("table.data tbody tr").forEach((tr) => {
        const cells = tr.querySelectorAll("td");
        if (cells.length < 5) return;
        const splits = {};
        cells[4].querySelectorAll(".chip.on").forEach((chip) => {
          const txt = chip.textContent.trim();
          const m = txt.match(/^(.+?)\s+([\d.]+)h$/);
          if (m) splits[m[1].trim()] = Number(m[2]);
        });
        sharedJiras.push({
          jira: cells[0].textContent.trim(),
          totalHours: parseHoursText(cells[1].textContent),
          startDate: parseCellDate(cells[2].textContent),
          endDate: parseCellDate(cells[3].textContent),
          splits: splits,
        });
      });
    }

    const phases = [];
    if (style === "phases") {
      doc.querySelectorAll(".phase-card").forEach((card) => {
        const phaseName = card.querySelector(".name")?.textContent.trim() || "";
        const datesEl = card.querySelector(".phase-dates");
        let pStart = "";
        let pEnd = "";
        if (datesEl && !datesEl.classList.contains("muted")) {
          const dm = datesEl.textContent.match(/^(.+?)\s*→\s*(.+)$/);
          if (dm) {
            pStart = parseCellDate(dm[1]);
            pEnd = parseCellDate(dm[2]);
          }
        }
        const assignments = [];
        card.querySelectorAll("table.data tbody tr").forEach((tr) => {
          const cells = tr.querySelectorAll("td");
          if (cells.length < 3) return;
          assignments.push({
            personName: cells[0].textContent.trim(),
            allocationPct: parseHoursText(cells[1].textContent),
          });
        });
        phases.push({ phaseName, startDate: pStart, endDate: pEnd, notes: "", assignments });
      });
    }

    const assignments = {};
    doc.querySelectorAll(".person-card").forEach((card) => {
      const name = personNameFromCard(card.querySelector(".head .name"));
      if (!name) return;
      const rows = [];
      card.querySelectorAll("table.data tbody tr").forEach((tr) => {
        if (tr.querySelector(".shared-pill")) return;
        const cells = tr.querySelectorAll("td");
        if (cells.length < 4) return;
        rows.push({
          jira: cells[0].textContent.trim(),
          hours: parseHoursText(cells[1].textContent),
          startDate: parseCellDate(cells[2].textContent),
          endDate: parseCellDate(cells[3].textContent),
        });
      });
      if (rows.length) assignments[name] = rows;
    });

    if (!team.length && !Object.keys(assignments).length && !phases.length) return null;

    return {
      sprint: {
        name: title,
        number: numMatch ? numMatch[1] : "",
        startDate,
        endDate,
        workingDaysOverride,
      },
      style,
      team,
      phases,
      sharedJiras,
      assignments,
    };
  }

  function parseStateFromHtml(html) {
    if (!html || typeof html !== "string") {
      return { source: null, state: null, error: "Empty file" };
    }
    const embedMatch = html.match(
      new RegExp('<script[^>]*id="' + STATE_SCRIPT_ID + '"[^>]*>([\\s\\S]*?)<\\/script>', "i")
    );
    if (embedMatch) {
      try {
        const parsed = JSON.parse(embedMatch[1]);
        if (parsed && typeof parsed === "object") return { source: "embed", state: parsed };
      } catch (err) {
        return { source: null, state: null, error: "Embedded state is invalid JSON: " + err.message };
      }
    }
    if (typeof DOMParser === "undefined") {
      return { source: null, state: null, error: "No embedded state found (re-download from the planner for full round-trip)." };
    }
    const doc = new DOMParser().parseFromString(html, "text/html");
    const scraped = scrapeStateFromDocument(doc);
    if (!scraped) {
      return { source: null, state: null, error: "Could not read team or assignments from this HTML." };
    }
    return { source: "scrape", state: scraped };
  }

  function renderSprintHtml(input) {
    const state = fillDefaults(input);
    const wd = sprintWorkingDays(state);
    const title = state.sprint.name || ("Sprint " + (state.sprint.number || "") + " — Release Plan").trim();
    const dateRange =
      state.sprint.startDate && state.sprint.endDate
        ? `${state.sprint.startDate} → ${state.sprint.endDate}`
        : "Dates not set";
    const generated = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    const styleSection = state.style === "phases"
      ? `<section><h2>Phases</h2><div class="cards stack">${renderPhaseCards(state)}</div></section>`
      : `<section><h2>Shared JIRAs</h2>${renderSharedTable(state)}</section>
         <section><h2>Per-Person Assignments</h2><div class="cards stack">${renderPersonCards(state, wd)}</div></section>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg:#fbf8f3; --surface:#ffffff; --surface-2:#f5efe5; --stroke:#ece3d2;
      --text:#3a3a4a; --muted:#7a7a8a; --faint:#b8b0a4;
      --accent:#8b7cd9; --accent-strong:#6c5ec9;
      --mint:#6dbe9e; --peach:#f5a878; --rose:#e87878; --sky:#6db8e8;
      --mint-soft:#dff3e7; --lavender-soft:#ece5fa; --peach-soft:#ffe7d3;
      --sky-soft:#dceff8; --rose-soft:#ffdcdc; --sand-soft:#f6ecd5;
      --radius:12px;
      --shadow:0 1px 2px rgba(58,58,74,.05), 0 4px 14px rgba(58,58,74,.07);
      --font:"Segoe UI", system-ui, -apple-system, Roboto, sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin:0; padding:32px clamp(20px, 3vw, 48px) 56px; font-family:var(--font); font-size:14px;
           line-height:1.5; color:var(--text); background:var(--bg); }
    .wrap { max-width: none; width: 100%; margin: 0; display: flex; flex-direction: column; gap: 18px; }
    h1 { font-size: 24px; font-weight: 600; margin: 0 0 4px 0; letter-spacing:-0.01em; }
    h1::after { content:""; display:block; width:42px; height:3px; background:var(--accent); border-radius:2px; margin-top:6px; }
    h2 { font-size: 15px; font-weight: 600; margin: 0 0 10px 0; color: var(--text); }
    .subtitle { color: var(--muted); margin: 0; }
    section { display: flex; flex-direction: column; gap: 10px; }
    .cards { display: flex; flex-direction: column; gap: 12px; }
    .card { background: var(--surface); border: 1px solid var(--stroke); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
    .card-h { display:flex; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--stroke); background:var(--surface-2); font-weight:600; font-size:12px; color:var(--text); }
    .card-b { padding: 12px 14px; }
    .metric-strip { display:flex; gap:8px; flex-wrap:wrap; }
    .metric-pill { background: var(--surface); border:1px solid var(--stroke); border-radius:999px; padding:6px 14px; font-size:12px; color: var(--text); box-shadow: var(--shadow); }
    .metric-pill strong { color: var(--accent-strong); margin-right: 4px; }
    table.data { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--stroke); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }
    table.data th, table.data td { padding: 9px 12px; text-align: left; border-bottom: 1px solid var(--stroke); }
    table.data th { font-size: 11px; font-weight: 600; color: var(--muted); background: var(--surface-2); text-transform: uppercase; letter-spacing: 0.04em; }
    table.data tr:last-child td { border-bottom: none; }
    .num { text-align: right; }
    .cen { text-align: center; }
    .feasibility { padding:12px 14px; background: var(--surface); border:1px solid var(--stroke); border-radius:var(--radius); box-shadow:var(--shadow); }
    .feasibility-bars { display:flex; flex-direction:column; gap:10px; width:100%; }
    .feasibility-empty { color: var(--faint); font-size: 12px; }
    .feas-bar-row { display:grid; grid-template-columns:minmax(130px,1fr) minmax(120px,2.5fr) auto; align-items:center; gap:10px 14px; }
    .feas-bar-name { font-weight:600; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .feas-bar-track { position:relative; height:18px; background:var(--surface-2); border:1px solid var(--stroke); border-radius:6px; overflow:hidden; }
    .feas-bar-cap { position:absolute; left:0; top:0; height:100%; background:var(--mint-soft); border-right:2px solid rgba(109,190,158,0.4); z-index:0; }
    .feas-bar-fill { position:absolute; left:0; top:0; height:100%; border-radius:5px 0 0 5px; z-index:1; min-width:2px; }
    .feas-bar-row.green .feas-bar-fill { background:var(--mint); }
    .feas-bar-row.amber .feas-bar-fill { background:var(--peach); }
    .feas-bar-row.rose .feas-bar-fill { background:var(--rose); }
    .feas-bar-meta { font-size:12px; font-weight:500; text-align:right; white-space:nowrap; color:var(--muted); }
    .feas-bar-row.green .feas-bar-meta { color:#2d7a55; }
    .feas-bar-row.amber .feas-bar-meta { color:#a85a1f; }
    .feas-bar-row.rose .feas-bar-meta { color:#a83838; }
    .summary-pill { display:inline-flex; gap:4px; padding:4px 10px; border-radius:999px; font-size:12px; border:1px solid var(--stroke); background: var(--surface); color: var(--text); }
    .summary-pill.green { background: var(--mint-soft); border-color:#b8e0cc; color:#2d7a55; }
    .summary-pill.amber { background: var(--peach-soft); border-color:#f5cba5; color:#a85a1f; }
    .summary-pill.rose  { background: var(--rose-soft); border-color:#f5bcbc; color:#a83838; }
    .shared-pill { display:inline-flex; padding:2px 7px; border-radius:999px; background: var(--lavender-soft); color: var(--accent-strong); border:1px solid #d2c3f0; font-size:10px; text-transform:uppercase; letter-spacing:0.05em; font-weight:600; }
    .phase-card, .person-card { background: var(--surface); border:1px solid var(--stroke); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
    .phase-card .head, .person-card .head { display:flex; justify-content: space-between; align-items: center; padding: 12px 14px; gap: 10px; flex-wrap: wrap; }
    .phase-card .name, .person-card .name { font-weight: 600; font-size: 14px; }
    .phase-card .phase-dates { font-size: 12px; color: var(--text); background: rgba(255,255,255,0.6); border:1px solid var(--stroke); border-radius: 6px; padding: 3px 8px; }
    .phase-card .phase-dates.muted { color: var(--faint); font-style: italic; }
    .person-card .name { display:flex; align-items: center; gap: 8px; }
    .person-card .avatar { width: 26px; height: 26px; border-radius: 50%; background: var(--surface); border: 1px solid var(--stroke); display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; color: var(--accent-strong); }
    .workload-bar { margin: 6px 14px; height: 8px; background: rgba(255,255,255,0.6); border:1px solid rgba(58,58,74,.06); border-radius: 999px; overflow:hidden; }
    .workload-fill { height: 100%; border-radius: 999px; }
    .workload-fill.green { background: var(--mint); }
    .workload-fill.amber { background: var(--peach); }
    .workload-fill.rose  { background: var(--rose); }
    .phase-card .body, .person-card .body { padding: 0 14px 14px; }
    .tint-mint     { background: var(--mint-soft); }
    .tint-lavender { background: var(--lavender-soft); }
    .tint-peach    { background: var(--peach-soft); }
    .tint-sky      { background: var(--sky-soft); }
    .tint-rose     { background: var(--rose-soft); }
    .tint-sand     { background: var(--sand-soft); }
    .chip { display:inline-flex; padding: 2px 8px; border-radius: 999px; background: var(--surface-2); border:1px solid var(--stroke); font-size: 11px; color: var(--text); }
    .chip.on { background: var(--lavender-soft); color: var(--accent-strong); border-color: var(--accent); font-weight: 600; }
    .empty-state { padding: 16px; text-align: center; color: var(--faint); font-size: 13px; border: 1px dashed var(--stroke); border-radius: var(--radius); background: var(--surface); }
    .footer { color: var(--muted); font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${escapeHtml(title)}</h1>
      <p class="subtitle">${escapeHtml(dateRange)} · ${wd} working days · ${state.style === "phases" ? "Phases structure" : "Per-Person structure"}</p>
    </header>

    ${renderMetricStrip(state, wd)}

    <section>
      <h2>Team</h2>
      ${renderTeamTable(state, wd)}
    </section>

    <section>
      <h2>Feasibility</h2>
      ${renderFeasibility(state, wd)}
    </section>

    ${styleSection}

    <p class="footer">${escapeHtml(title)} — PLUM CLOUD LABS Sprint Plan · generated ${escapeHtml(generated)}</p>
  </div>
  <script type="application/json" id="${STATE_SCRIPT_ID}">${safeJsonForScript(serializeStateForEmbed(state))}</script>
</body>
</html>`;
  }

  root.SprintGenerator = { renderSprintHtml, parseStateFromHtml, STATE_SCRIPT_ID };
})(typeof window !== "undefined" ? window : globalThis);
