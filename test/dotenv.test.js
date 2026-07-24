import test from "node:test";
import assert from "node:assert/strict";

import { parseDotenv, stringifyDotenv } from "../src/dotenv.js";

test("parses simple pairs, comments and blank lines", () => {
  const { values, errors } = parseDotenv(`# a comment
PORT=3000

DATABASE_URL=postgres://localhost/db
`);
  assert.deepEqual(errors, []);
  assert.deepEqual(values, { PORT: "3000", DATABASE_URL: "postgres://localhost/db" });
});

test("supports export, inline comments and quoted hashes", () => {
  const { values } = parseDotenv(`export NODE_ENV=production
DEBUG=true   # trailing comment
PASSWORD="pa#ss word"
PLAIN=before # comment
`);
  assert.equal(values.NODE_ENV, "production");
  assert.equal(values.DEBUG, "true");
  assert.equal(values.PASSWORD, "pa#ss word");
  assert.equal(values.PLAIN, "before");
});

test("interprets escapes in double quotes but not single quotes", () => {
  const { values } = parseDotenv(`MULTILINE="line one\\nline two"
LITERAL='a\\nb'
BACKSLASH="C:\\\\temp"
`);
  assert.equal(values.MULTILINE, "line one\nline two");
  assert.equal(values.LITERAL, "a\\nb");
  assert.equal(values.BACKSLASH, "C:\\temp");
});

test("later assignments override earlier ones", () => {
  const { values } = parseDotenv("PORT=3000\nPORT=4000\n");
  assert.equal(values.PORT, "4000");
});

test("malformed lines are reported with line numbers", () => {
  const { values, errors } = parseDotenv("GOOD=1\nNOT A PAIR\n9BAD=x\nQUOTED=\"unterminated\n");
  assert.equal(values.GOOD, "1");
  assert.equal(values["9BAD"], undefined);
  assert.equal(errors.length, 3);
  assert.deepEqual(errors.map((error) => error.line), [2, 3, 4]);
  assert.match(errors[0].message, /expected KEY=VALUE/);
  assert.match(errors[1].message, /invalid variable name/);
  assert.match(errors[2].message, /unterminated/);
});

test("stringifyDotenv quotes values that need it", () => {
  const text = stringifyDotenv({ A: "plain", B: "with space", C: 'quote"inside' });
  assert.equal(text, 'A=plain\nB="with space"\nC="quote\\"inside"\n');
});
