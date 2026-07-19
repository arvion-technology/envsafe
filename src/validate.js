// Environment validation: required fields, coercion, aggregated errors and
// secret redaction.
//
// The result separates `values` (what the application should use) from
// `preview` (what a human may see). Secret values never appear in an error
// message or in the preview, including when they fail validation.
import { TYPES, coerceValue, displayValue, redact } from "./coerce.js";

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Validate the schema itself before validating any values. */
export function validateSchemaDefinition(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return [{ key: "schema", message: "must be an object mapping variable names to rules", hint: "see examples/env.schema.json" }];
  }
  const errors = [];
  for (const [key, rule] of Object.entries(schema)) {
    if (!ENV_KEY.test(key)) errors.push({ key, message: "is not a valid environment variable name" });
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      errors.push({ key, message: "rule must be an object" });
      continue;
    }
    const type = rule.type || "string";
    if (!TYPES.includes(type)) errors.push({ key, message: `unknown type "${type}"`, hint: `use one of: ${TYPES.join(", ")}` });
    if (rule.required !== undefined && typeof rule.required !== "boolean") errors.push({ key, message: "required must be a boolean" });
    if (rule.secret !== undefined && typeof rule.secret !== "boolean") errors.push({ key, message: "secret must be a boolean" });
    if (type === "enum" && (!Array.isArray(rule.values) || !rule.values.length)) {
      errors.push({ key, message: "enum rules need a non-empty values array" });
    }
    for (const bound of ["min", "max"]) {
      if (rule[bound] !== undefined && typeof rule[bound] !== "number") errors.push({ key, message: `${bound} must be a number` });
    }
  }
  return errors;
}

/**
 * Validate an environment object.
 *
 * @param {object} schema KEY -> rule
 * @param {Record<string,string|undefined>} env
 * @param {{warnUnknown?: boolean, sourceErrors?: Array}} options
 */
export function validateEnv(schema, env = {}, options = {}) {
  const schemaErrors = validateSchemaDefinition(schema);
  if (schemaErrors.length) {
    return { ok: false, values: {}, preview: {}, errors: schemaErrors, warnings: [], secrets: [], schemaErrors };
  }

  const errors = [];
  const warnings = [];
  const values = {};
  const preview = {};
  const secrets = [];

  for (const [key, rule] of Object.entries(schema)) {
    const secret = rule.secret === true;
    if (secret) secrets.push(key);
    const raw = env[key];

    if (raw === undefined || raw === "") {
      if (rule.default !== undefined) {
        const coerced = coerceValue(String(rule.default), rule);
        if (!coerced.ok) {
          errors.push({ key, message: `default is invalid: ${coerced.message}`, hint: "fix the default in the schema" });
          continue;
        }
        values[key] = coerced.value;
        preview[key] = secret ? redact(String(rule.default)) : displayValue(coerced.value);
        continue;
      }
      if (rule.required) {
        errors.push({ key, message: "is required", hint: rule.hint || `set ${key} in your environment or add a default` });
      }
      continue;
    }

    const result = coerceValue(raw, rule);
    if (!result.ok) {
      errors.push({
        key,
        message: result.message,
        hint: rule.hint || result.hint,
        value: secret ? redact(raw) : raw,
      });
      continue;
    }
    values[key] = result.value;
    preview[key] = secret ? redact(raw) : displayValue(result.value);
  }

  for (const [key, rule] of Object.entries(options.sourceErrors || [])) {
    errors.push({ key, message: rule, hint: "check the .env file" });
  }

  if (options.warnUnknown !== false) {
    for (const key of Object.keys(env)) {
      if (!(key in schema) && env[key] !== undefined) {
        warnings.push({ key, message: "is not described by the schema and was ignored" });
      }
    }
  }

  return { ok: errors.length === 0, values, preview, errors, warnings, secrets, checked: Object.keys(schema).length, schemaErrors: [] };
}

/** Plain-text report used by the CLI and in tests. */
export function formatReport(result) {
  const lines = [];
  if (result.schemaErrors?.length) {
    lines.push("Schema problems:");
    for (const error of result.schemaErrors) lines.push(`  fail  ${error.key}  ${error.message}${error.hint ? `  (${error.hint})` : ""}`);
    return lines.join("\n") + "\n";
  }
  const checked = result.checked ?? Object.keys(result.preview).length;
  lines.push(`Checked ${checked} variable${checked === 1 ? "" : "s"}.`);
  for (const [key, value] of Object.entries(result.preview)) {
    lines.push(`  ok    ${key.padEnd(24)} ${value}`);
  }
  for (const warning of result.warnings) lines.push(`  warn  ${warning.key.padEnd(24)} ${warning.message}`);
  for (const error of result.errors) {
    lines.push(`  fail  ${error.key.padEnd(24)} ${error.message}`);
    if (error.hint) lines.push(`        ${"".padEnd(24)} hint: ${error.hint}`);
  }
  lines.push(result.ok
    ? "Environment is valid."
    : `${result.errors.length} problem${result.errors.length === 1 ? "" : "s"} found.`);
  return lines.join("\n") + "\n";
}
