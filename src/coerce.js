// Value coercion for environment variables.
//
// Everything arrives as a string. The point of the schema is to turn it into
// the type the application expects, or to fail with a hint that says what was
// wrong. Each failure is a value, not an exception, so the validator can report
// every problem in one pass.

export const TYPES = ["string", "number", "boolean", "enum", "url", "duration", "json", "port"];

const TRUE_VALUES = ["true", "1", "yes", "on", "y"];
const FALSE_VALUES = ["false", "0", "no", "off", "n"];

const DURATION_UNITS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Mask a secret for display. Never returns enough characters to use it. */
export function redact(value) {
  const text = String(value ?? "");
  if (!text) return "(empty)";
  if (text.length <= 6) return "••••••";
  return text.slice(0, 2) + "•".repeat(Math.min(10, text.length - 4)) + text.slice(-2);
}

const invalid = (message, hint) => ({ ok: false, message, hint });

function coerceString(text, rule) {
  if (rule.minLength !== undefined && text.length < rule.minLength) {
    return invalid(`must be at least ${rule.minLength} characters`, rule.hint);
  }
  if (rule.maxLength !== undefined && text.length > rule.maxLength) {
    return invalid(`must be at most ${rule.maxLength} characters`, rule.hint);
  }
  if (rule.pattern) {
    let expression;
    try {
      expression = new RegExp(rule.pattern);
    } catch {
      return invalid("schema has an invalid pattern", "fix the schema, not the environment");
    }
    if (!expression.test(text)) return invalid(`must match ${rule.pattern}`, rule.hint);
  }
  return { ok: true, value: text };
}

/**
 * Coerce one raw value against one schema rule.
 * @returns {{ok: true, value: unknown} | {ok: false, message: string, hint?: string}}
 */
export function coerceValue(raw, rule = {}) {
  const type = rule.type || "string";
  const text = raw === undefined || raw === null ? "" : String(raw);
  if (type !== "string" && text.trim() === "") return invalid("must not be empty", rule.hint);

  switch (type) {
    case "string":
      return coerceString(text, rule);

    case "number": {
      const value = Number(text);
      if (!Number.isFinite(value)) return invalid(`expected a number, received "${text}"`, rule.hint || "use digits only, e.g. 8080");
      if (rule.integer && !Number.isInteger(value)) return invalid("expected a whole number", rule.hint);
      if (rule.min !== undefined && value < rule.min) return invalid(`must be >= ${rule.min}`, rule.hint);
      if (rule.max !== undefined && value > rule.max) return invalid(`must be <= ${rule.max}`, rule.hint);
      return { ok: true, value };
    }

    case "port": {
      const value = Number(text);
      if (!Number.isInteger(value)) return invalid(`expected a port number, received "${text}"`, rule.hint || "use an integer between 1 and 65535");
      if (value < 1 || value > 65535) return invalid("port must be between 1 and 65535", rule.hint);
      return { ok: true, value };
    }

    case "boolean": {
      const normalized = text.trim().toLowerCase();
      if (TRUE_VALUES.includes(normalized)) return { ok: true, value: true };
      if (FALSE_VALUES.includes(normalized)) return { ok: true, value: false };
      return invalid(
        `expected a boolean, received "${text}"`,
        rule.hint || `use one of: ${[...TRUE_VALUES, ...FALSE_VALUES].join(", ")}`,
      );
    }

    case "enum": {
      const values = Array.isArray(rule.values) ? rule.values : [];
      const match = rule.caseInsensitive
        ? values.find((entry) => String(entry).toLowerCase() === text.trim().toLowerCase())
        : values.find((entry) => String(entry) === text.trim());
      if (match === undefined) return invalid(`must be one of: ${values.join(", ")}`, rule.hint);
      return { ok: true, value: match };
    }

    case "url": {
      let parsed;
      try {
        parsed = new URL(text);
      } catch {
        return invalid(`"${text}" is not a URL`, rule.hint || "use a full URL, e.g. https://api.example.com");
      }
      const protocols = rule.protocols || ["http:", "https:"];
      if (!protocols.includes(parsed.protocol)) {
        return invalid(`protocol ${parsed.protocol} is not allowed`, `use one of: ${protocols.join(", ")}`);
      }
      return { ok: true, value: text };
    }

    case "duration": {
      const match = text.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/i);
      if (!match) return invalid(`expected a duration, received "${text}"`, rule.hint || "use a number and unit, e.g. 30s, 5m, 2h, 1d");
      const value = Number(match[1]) * DURATION_UNITS[match[2].toLowerCase()];
      if (rule.min !== undefined && value < rule.min) return invalid(`must be at least ${rule.min}ms`, rule.hint);
      if (rule.max !== undefined && value > rule.max) return invalid(`must be at most ${rule.max}ms`, rule.hint);
      return { ok: true, value };
    }

    case "json": {
      try {
        return { ok: true, value: JSON.parse(text) };
      } catch (error) {
        return invalid(`invalid JSON: ${error.message}`, rule.hint || "quote the value or use compact JSON, e.g. {\"a\":1}");
      }
    }

    default:
      return invalid(`unknown type "${type}"`, "fix the schema, not the environment");
  }
}

/** Render a typed value for display in the CLI and the demo. */
export function displayValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
