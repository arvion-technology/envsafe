import test from "node:test";
import assert from "node:assert/strict";

import { coerceValue, displayValue, redact, TYPES } from "../src/coerce.js";

test("numbers are parsed and bounded", () => {
  assert.deepEqual(coerceValue("42", { type: "number" }), { ok: true, value: 42 });
  assert.equal(coerceValue("4.5", { type: "number", integer: true }).ok, false);
  assert.equal(coerceValue("0", { type: "number", min: 1 }).message, "must be >= 1");
  assert.equal(coerceValue("99", { type: "number", max: 10 }).message, "must be <= 10");
  assert.match(coerceValue("abc", { type: "number" }).message, /expected a number/);
});

test("booleans accept common spellings and explain the alternatives", () => {
  for (const truthy of ["true", "1", "yes", "on", "Y", " TRUE "]) {
    assert.equal(coerceValue(truthy, { type: "boolean" }).value, true, truthy);
  }
  for (const falsy of ["false", "0", "no", "off", "n", "False"]) {
    assert.equal(coerceValue(falsy, { type: "boolean" }).value, false, falsy);
  }
  const failure = coerceValue("maybe", { type: "boolean" });
  assert.equal(failure.ok, false);
  assert.match(failure.hint, /use one of/);
});

test("enums list the allowed values", () => {
  assert.deepEqual(coerceValue("info", { type: "enum", values: ["debug", "info"] }), { ok: true, value: "info" });
  const failure = coerceValue("verbose", { type: "enum", values: ["debug", "info"] });
  assert.equal(failure.message, "must be one of: debug, info");
  assert.equal(coerceValue("INFO", { type: "enum", values: ["info"], caseInsensitive: true }).value, "info");
});

test("urls are parsed and can be restricted by protocol", () => {
  assert.equal(coerceValue("https://example.com/x", { type: "url" }).value, "https://example.com/x");
  assert.match(coerceValue("not a url", { type: "url" }).message, /is not a URL/);
  const wrongProtocol = coerceValue("ftp://example.com", { type: "url", protocols: ["https:"] });
  assert.match(wrongProtocol.message, /ftp: is not allowed/);
  assert.match(coerceValue("localhost:5432/db", { type: "url", protocols: ["postgres:"] }).message, /protocol localhost: is not allowed/);
});

test("durations convert to milliseconds", () => {
  assert.deepEqual(coerceValue("500ms", { type: "duration" }), { ok: true, value: 500 });
  assert.deepEqual(coerceValue("30s", { type: "duration" }), { ok: true, value: 30_000 });
  assert.deepEqual(coerceValue("2m", { type: "duration" }), { ok: true, value: 120_000 });
  assert.deepEqual(coerceValue("1.5h", { type: "duration" }), { ok: true, value: 5_400_000 });
  assert.deepEqual(coerceValue("1d", { type: "duration" }), { ok: true, value: 86_400_000 });
  assert.match(coerceValue("soon", { type: "duration" }).hint, /30s, 5m, 2h, 1d/);
  assert.match(coerceValue("10s", { type: "duration", min: 30_000 }).message, /at least 30000ms/);
});

test("json values are parsed or reported with the parser message", () => {
  assert.deepEqual(coerceValue('{"a":1}', { type: "json" }).value, { a: 1 });
  const failure = coerceValue("{oops", { type: "json" });
  assert.equal(failure.ok, false);
  assert.match(failure.message, /invalid JSON/);
});

test("ports are integers inside 1..65535", () => {
  assert.deepEqual(coerceValue("8080", { type: "port" }), { ok: true, value: 8080 });
  assert.equal(coerceValue("0", { type: "port" }).ok, false);
  assert.equal(coerceValue("70000", { type: "port" }).ok, false);
  assert.equal(coerceValue("80.5", { type: "port" }).ok, false);
});

test("string constraints are enforced", () => {
  assert.equal(coerceValue("ab", { type: "string", minLength: 2 }).ok, true);
  assert.equal(coerceValue("a", { type: "string", minLength: 2 }).ok, false);
  assert.equal(coerceValue("abc", { type: "string", pattern: "^[a-z]+$" }).ok, true);
  assert.equal(coerceValue("ABC", { type: "string", pattern: "^[a-z]+$" }).ok, false);
  assert.equal(coerceValue("", { type: "string" }).ok, true);
});

test("secret redaction keeps a hint of the value and nothing usable", () => {
  assert.equal(redact("sk_live_51H8xQ2eZvKYlo2C"), "sk••••••••••2C");
  assert.equal(redact("short"), "••••••");
  assert.equal(redact(""), "(empty)");
  assert.ok(!redact("sk_live_51H8xQ2eZvKYlo2C").includes("live"));
});

test("displayValue renders typed values", () => {
  assert.equal(displayValue("text"), "text");
  assert.equal(displayValue(42), "42");
  assert.equal(displayValue({ a: 1 }), '{"a":1}');
  assert.equal(displayValue([true]), "[true]");
});

test("the type list is exported for schema validation", () => {
  assert.deepEqual(TYPES, ["string", "number", "boolean", "enum", "url", "duration", "json", "port"]);
  assert.equal(coerceValue("x", { type: "nope" }).ok, false);
});
