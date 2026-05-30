// Render the planner state captured from the live browser to a standalone HTML file.
// Used so the user can open the result of importing their CSV without running the planner.

const fs = require("fs");
const path = require("path");
global.window = {};
eval(fs.readFileSync(path.join(__dirname, "..", "generator.js"), "utf8"));
const G = window.SprintGenerator;

const state = JSON.parse(fs.readFileSync(path.join(__dirname, "imported-state.json"), "utf8"));
const html = G.renderSprintHtml(state);
const outPath = path.join(__dirname, "..", "..", "sprint-04-from-csv.html");
fs.writeFileSync(outPath, html);
console.log("Wrote " + outPath + " (" + html.length + " bytes)");
