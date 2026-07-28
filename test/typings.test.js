import test from "node:test";
import assert from "node:assert/strict";

import { toTypeScript, toEnvExample } from "../src/typings.js";
import { ENV_SCHEMA } from "../src/samples.js";

test("generates an interface with coerced types", () => {
  const code = toTypeScript(ENV_SCHEMA);
  assert.match(code, /export interface Env \{/);
  assert.match(code, /NODE_ENV: "development" \| "test" \| "production";/);
  assert.match(code, /PORT: number;/);
  assert.match(code, /DEBUG\?: boolean;/);
  assert.match(code, /REQUEST_TIMEOUT\?: number;/);
  assert.match(code, /LOG_LEVEL\?: "debug" \| "info" \| "warn" \| "error";/);
  assert.match(code, /FEATURE_FLAGS\?: unknown;/);
  assert.match(code, /API_KEY: string;/);
  assert.match(code, /export type EnvKey = keyof Env;/);
});

test("descriptions become JSDoc comments", () => {
  const code = toTypeScript({ PORT: { type: "port", description: "Port the server binds to." } });
  assert.match(code, /\/\*\* Port the server binds to\. \*\//);
  assert.match(code, /PORT\?: number;/);
});

test("a custom interface name is respected", () => {
  const code = toTypeScript({ A: { type: "string", required: true } }, { interfaceName: "Config" });
  assert.match(code, /export interface Config \{/);
  assert.match(code, /export type ConfigKey = keyof Config;/);
});

test("the example file documents types, defaults and secrets", () => {
  const text = toEnvExample({
    SERVICE_NAME: { type: "string", required: true, description: "Service name." },
    LOG_LEVEL: { type: "enum", values: ["info", "debug"], default: "info" },
    API_KEY: { type: "string", required: true, secret: true },
  });
  assert.match(text, /# Service name\./);
  assert.match(text, /# string, required/);
  assert.match(text, /# enum/);
  assert.match(text, /# allowed: info, debug/);
  assert.match(text, /LOG_LEVEL=info/);
  assert.match(text, /API_KEY=\n/);
  assert.match(text, /# string, required, secret/);
});
