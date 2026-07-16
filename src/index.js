// Public entry point for EnvSafe.
export { parseDotenv, stringifyDotenv } from "./dotenv.js";
export { TYPES, coerceValue, redact, displayValue } from "./coerce.js";
export { validateEnv, validateSchemaDefinition, formatReport } from "./validate.js";
export { toTypeScript, toEnvExample } from "./typings.js";

import { validateEnv, formatReport } from "./validate.js";

export class EnvError extends Error {
  constructor(result) {
    super(`Invalid environment:\n${formatReport(result)}`.trim());
    this.name = "EnvError";
    this.errors = result.errors;
    this.preview = result.preview;
  }
}

/**
 * Validate and return typed values, throwing one aggregated error when the
 * environment is not usable. This is the call a server makes at startup.
 */
export function defineEnv(schema, { env = globalThis.process?.env || {}, warnUnknown = false } = {}) {
  const result = validateEnv(schema, env, { warnUnknown });
  if (!result.ok) throw new EnvError(result);
  return result.values;
}

/** Validate without throwing — used by the CLI and the demo. */
export function checkEnv(schema, env, options) {
  const result = validateEnv(schema, env, options);
  return { ...result, report: formatReport(result) };
}
