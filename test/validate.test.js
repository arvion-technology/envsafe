import test from "node:test";
import assert from "node:assert/strict";

import { validateEnv, validateSchemaDefinition, formatReport } from "../src/validate.js";
import { parseDotenv } from "../src/dotenv.js";
import { defineEnv, EnvError } from "../src/index.js";
import { ENV_SCHEMA, VALID_ENV, BROKEN_ENV } from "../src/samples.js";

const validEnv = () => parseDotenv(VALID_ENV).values;

test("a valid environment is coerced to typed values", () => {
  const result = validateEnv(ENV_SCHEMA, validEnv(), { warnUnknown: false });
  assert.equal(result.ok, true);
  assert.equal(result.values.PORT, 8080);
  assert.equal(result.values.DEBUG, true);
  assert.equal(result.values.REQUEST_TIMEOUT, 120_000);
  assert.deepEqual(result.values.FEATURE_FLAGS, { newCheckout: true, searchV2: false });
  assert.equal(result.checked, Object.keys(ENV_SCHEMA).length);
});

test("secrets are redacted in previews but typed values stay usable", () => {
  const env = validEnv();
  const result = validateEnv(ENV_SCHEMA, env, { warnUnknown: false });
  assert.equal(result.values.API_KEY, env.API_KEY);
  assert.ok(!result.preview.API_KEY.includes("51H8x"), result.preview.API_KEY);
  assert.ok(!result.preview.SENTRY_DSN.includes("abc123"), result.preview.SENTRY_DSN);
  assert.deepEqual(result.secrets.sort(), ["API_KEY", "SENTRY_DSN"]);
});

test("every problem is reported, not just the first", () => {
  const result = validateEnv(ENV_SCHEMA, parseDotenv(BROKEN_ENV).values, { warnUnknown: false });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 8);
  const keys = result.errors.map((error) => error.key);
  for (const key of ["SERVICE_NAME", "PORT", "DATABASE_URL", "API_KEY", "DEBUG", "REQUEST_TIMEOUT", "LOG_LEVEL", "FEATURE_FLAGS"]) {
    assert.ok(keys.includes(key), key);
  }
  assert.match(result.errors.find((error) => error.key === "PORT").hint, /integer between/);
});

test("a secret that fails validation is redacted in the error", () => {
  const env = { ...validEnv(), API_KEY: "short" };
  const result = validateEnv(ENV_SCHEMA, env, { warnUnknown: false });
  const error = result.errors.find((entry) => entry.key === "API_KEY");
  assert.ok(error, "expected an API_KEY error");
  assert.ok(!error.value.includes("short"), error.value);
  assert.ok(!formatReport(result).includes("short"));
});

test("defaults are applied to missing values", () => {
  const result = validateEnv(
    { LOG_LEVEL: { type: "enum", values: ["info", "debug"], default: "info" }, PORT: { type: "port", default: 3000 } },
    {},
    { warnUnknown: false },
  );
  assert.equal(result.ok, true);
  assert.equal(result.values.LOG_LEVEL, "info");
  assert.equal(result.values.PORT, 3000);
  assert.equal(result.preview.PORT, "3000");
});

test("required fields report missing values with hints", () => {
  const result = validateEnv({ API_KEY: { type: "string", required: true, secret: true, hint: "ask the platform team" } }, {});
  assert.equal(result.errors[0].key, "API_KEY");
  assert.equal(result.errors[0].message, "is required");
  assert.equal(result.errors[0].hint, "ask the platform team");
});

test("unknown variables are warnings, not failures", () => {
  const env = { ...validEnv(), BUILDKITE: "1" };
  const warned = validateEnv(ENV_SCHEMA, env, { warnUnknown: true });
  assert.equal(warned.ok, true);
  assert.deepEqual(warned.warnings.map((warning) => warning.key), ["BUILDKITE"]);

  const quiet = validateEnv(ENV_SCHEMA, env, { warnUnknown: false });
  assert.deepEqual(quiet.warnings, []);
});

test("bad schema definitions are reported before any value is checked", () => {
  const errors = validateSchemaDefinition({
    "9BAD": { type: "string" },
    MODE: { type: "enum", values: [] },
    PORT: { type: "nope", required: "yes" },
  });
  assert.equal(errors.length, 4);
  assert.ok(errors.some((error) => /valid environment variable name/.test(error.message)));
  assert.ok(errors.some((error) => /non-empty values/.test(error.message)));
  assert.ok(errors.some((error) => /unknown type/.test(error.message)));

  const result = validateEnv({ PORT: { type: "nope" } }, { PORT: "1" });
  assert.equal(result.ok, false);
  assert.ok(result.schemaErrors.length > 0);
});

test("formatReport shows ok, warn and fail lines without leaking secrets", () => {
  const env = { ...validEnv(), BUILDKITE: "1", PORT: "nope" };
  const result = validateEnv(ENV_SCHEMA, env, { warnUnknown: true });
  const report = formatReport(result);
  assert.match(report, /Checked 10 variables/);
  assert.match(report, /fail\s+PORT/);
  assert.match(report, /warn\s+BUILDKITE/);
  assert.match(report, /problem(s)? found/);
  assert.ok(!report.includes(env.API_KEY), "report leaked the API key");
});

test("defineEnv returns values or throws one aggregated error", () => {
  const values = defineEnv(ENV_SCHEMA, { env: validEnv() });
  assert.equal(values.PORT, 8080);

  try {
    defineEnv(ENV_SCHEMA, { env: parseDotenv("PORT=nope").values });
    assert.fail("expected defineEnv to throw");
  } catch (error) {
    assert.ok(error instanceof EnvError);
    assert.ok(error.errors.length >= 3);
    assert.match(error.message, /Invalid environment/);
  }
});
