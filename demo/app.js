// EnvSafe demo application.
//
// parseDotenv, validateEnv and toTypeScript come from ../src. This file owns
// the two editors, the live preview and the tab switch.
import { parseDotenv } from "../src/dotenv.js";
import { validateEnv } from "../src/validate.js";
import { toTypeScript } from "../src/typings.js";
import { ENV_SCHEMA, SAMPLE_ENVIRONMENTS } from "../src/samples.js";

const { el, $, $$, toast, fmt } = A;

const state = {
  envId: "valid",
  view: "validation",
  result: null,
  elapsed: 0,
};

const escapeHtml = (text) => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const TS_TOKEN = /(\/\/[^\n]*|"(?:\\.|[^"\\])*"|\b(?:export|interface|type|keyof|string|number|boolean|unknown)\b)/g;

function highlightTypeScript(code) {
  let html = "";
  let last = 0;
  for (const match of code.matchAll(TS_TOKEN)) {
    html += escapeHtml(code.slice(last, match.index));
    const token = match[0];
    const kind = token.startsWith("//") ? "tok-c" : token.startsWith('"') ? "tok-s" : "tok-k";
    html += `<span class="${kind}">${escapeHtml(token)}</span>`;
    last = match.index + token.length;
  }
  return html + escapeHtml(code.slice(last));
}

/* --------------------------------------------------------------- rendering */

function renderEnvChips() {
  $("#env-chips").replaceChildren(...SAMPLE_ENVIRONMENTS.map((sample) =>
    el("button", {
      class: "chip" + (state.envId === sample.id ? " active" : ""),
      onclick: () => {
        state.envId = sample.id;
        $("#env-editor").value = sample.text;
        renderEnvChips();
        regenerate();
      },
    }, sample.name)));
}

function renderStatus(result, elapsed, schema, dotenv) {
  const badge = $("#status-badge");
  if (result.ok) {
    badge.textContent = "environment valid";
    badge.className = "badge green";
  } else {
    badge.textContent = `${result.errors.length} problem${result.errors.length === 1 ? "" : "s"}`;
    badge.className = "badge red";
  }
  $("#vars-badge").textContent = `${result.checked ?? Object.keys(schema).length} variables`;
  $("#time-badge").textContent = `${elapsed.toFixed(1)} ms`;
  $("#result-sub").textContent = `${Object.keys(dotenv.values).length} assignments parsed · ${result.secrets.length} secrets redacted`;
  $("#env-source").textContent = `env: ${state.envId === "valid" ? "valid setup" : "broken setup"}`;
  $("#env-lines").textContent = `${$("#env-editor").value.split("\n").filter((line) => line.trim()).length} non-empty lines`;
}

function renderValidation(result) {
  const verdict = $("#verdict");
  verdict.className = "verdict " + (result.ok ? "ok" : "bad");
  $("#verdict-mark").textContent = result.ok ? "✓" : "!";
  $("#verdict-title").textContent = result.ok
    ? "Every variable is valid"
    : `${result.errors.length} problem${result.errors.length === 1 ? "" : "s"} found`;
  $("#verdict-sub").textContent = `${result.checked} variables checked · ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}`;
  $("#verdict-stats").replaceChildren(
    el("span", { class: "badge green", text: `${Object.keys(result.preview).length} coerced` }),
    result.secrets.length ? el("span", { class: "badge gold", text: `${result.secrets.length} redacted` }) : null,
  );

  $("#error-list").replaceChildren(...result.errors.map((error) =>
    el("div", { class: "error-row" },
      el("span", { class: "error-key", text: error.key }),
      el("span", { class: "error-message", text: error.message }),
      error.value ? el("span", { class: "error-value", text: `value: ${error.value}` }) : null,
      error.hint ? el("div", { class: "error-hint", text: `hint: ${error.hint}` }) : null)));

  const rows = Object.entries(result.preview).map(([key, preview]) => ({
    key,
    type: state.result.schema[key]?.type || "string",
    preview,
    secret: result.secrets.includes(key),
  }));
  $("#values-table").replaceChildren(rows.length
    ? A.dataTable({
      columns: [
        { key: "key", label: "Variable", render: (row) => el("span", { class: "mono", text: row.key }) },
        { key: "type", label: "Type", render: (row) => el("span", { class: "badge", text: row.type }) },
        { key: "preview", label: "Coerced value", render: (row) => el("span", { class: "mono", text: row.preview }) },
        { key: "secret", label: "", width: "96px", render: (row) => (row.secret ? el("span", { class: "badge gold", text: "redacted" }) : null) },
      ],
      rows,
      empty: "No values resolved.",
    })
    : el("div", { class: "empty" }, el("strong", { text: "No values yet" }), "Fill in the environment above."));

  $("#warnings").replaceChildren(...result.warnings.map((warning) =>
    el("div", { class: "warning-row", text: `${warning.key} ${warning.message}` })));
}

function renderTypeScript(schema) {
  const code = toTypeScript(schema);
  $("#type-output").innerHTML = highlightTypeScript(code);
  return code;
}

function setView(view, { updateHash = true } = {}) {
  state.view = view;
  $$("[data-view-panel]").forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== view; });
  $$("#view-tabs .tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  if (updateHash) history.replaceState(null, "", view === "typescript" ? "#typescript" : "#validation");
}

/* -------------------------------------------------------------- generation */

function showSchemaError(message) {
  const box = $("#schema-error");
  box.textContent = `Schema JSON: ${message}`;
  box.classList.remove("hide");
  $("#status-badge").textContent = "schema invalid";
  $("#status-badge").className = "badge red";
}

function regenerate() {
  let schema;
  try {
    schema = JSON.parse($("#schema-editor").value);
  } catch (error) {
    showSchemaError(error.message);
    return;
  }
  $("#schema-error").classList.add("hide");

  const started = performance.now();
  const dotenv = parseDotenv($("#env-editor").value);
  const sourceErrors = {};
  for (const error of dotenv.errors) sourceErrors[`line ${error.line}`] = error.message;
  const result = validateEnv(schema, dotenv.values, { warnUnknown: false, sourceErrors });
  state.result = { schema, result, dotenv };
  state.elapsed = performance.now() - started;

  renderStatus(result, state.elapsed, schema, dotenv);
  renderValidation(result);
  renderTypeScript(schema);
}

/* --------------------------------------------------------------------- boot */

function applyHash() {
  const hash = location.hash.replace("#", "");
  if (!hash) return;
  if (hash.includes("typescript")) state.view = "typescript";
  if (hash.includes("broken")) state.envId = "broken";
}

async function copyType() {
  const code = $("#type-output").textContent;
  try {
    await navigator.clipboard.writeText(code);
    toast("Copied the generated interface", "success");
  } catch {
    A.download("env.d.ts", code, "text/typescript");
    toast("Clipboard blocked — downloaded env.d.ts", "info");
  }
}

function init() {
  applyHash();
  $("#schema-editor").value = JSON.stringify(ENV_SCHEMA, null, 2);
  $("#env-editor").value = SAMPLE_ENVIRONMENTS.find((sample) => sample.id === state.envId).text;
  renderEnvChips();
  setView(state.view, { updateHash: false });
  regenerate();

  const debounced = A.debounce(regenerate, 320);
  $("#schema-editor").addEventListener("input", debounced);
  $("#env-editor").addEventListener("input", debounced);
  $$("#view-tabs .tab").forEach((tab) => tab.addEventListener("click", () => setView(tab.dataset.view)));
  $("#copy-type").addEventListener("click", copyType);
  $("#reset-schema").addEventListener("click", () => {
    $("#schema-editor").value = JSON.stringify(ENV_SCHEMA, null, 2);
    regenerate();
    toast("Schema reset to the checkout example", "success");
  });
}

init();
