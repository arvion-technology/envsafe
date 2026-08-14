#!/usr/bin/env node
// EnvSafe CLI — check an environment, print its type, or build a .env.example.
import { readFileSync, writeFileSync } from "node:fs";
import { parseDotenv } from "../src/dotenv.js";
import { validateEnv, validateSchemaDefinition, formatReport } from "../src/validate.js";
import { toTypeScript, toEnvExample } from "../src/typings.js";

const USAGE = `envsafe — fail fast on bad environment variables

Usage
  envsafe check  [--schema env.schema.json] [--env .env] [--strict] [--json]
  envsafe type   [--schema env.schema.json] [--out src/env.d.ts]
  envsafe example [--schema env.schema.json]

Commands
  check     validate a .env file (or process.env) against the schema
  type      print a TypeScript interface for the coerced values
  example   print a .env.example populated with descriptions and defaults

Options
  --schema, -s   Path to the JSON schema (default: env.schema.json)
  --env, -e      Path to a .env file; without it, process.env is checked
  --strict       Warn about variables that the schema does not describe
  --json         Print the check result as JSON (secrets stay redacted)
  --out, -o      Write output to a file instead of stdout
  --help, -h     Show this message
`;

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index++) {
    const argument = rest[index];
    if (argument === "--strict") flags.strict = true;
    else if (argument === "--json") flags.json = true;
    else if (argument === "--help" || argument === "-h") flags.help = true;
    else if (["--schema", "-s"].includes(argument)) flags.schema = rest[++index];
    else if (["--env", "-e"].includes(argument)) flags.env = rest[++index];
    else if (["--out", "-o"].includes(argument)) flags.out = rest[++index];
    else if (argument.startsWith("--schema=")) flags.schema = argument.slice(9);
    else if (argument.startsWith("--env=")) flags.env = argument.slice(6);
  }
  return { command, flags };
}

const { command, flags } = parseArguments(process.argv.slice(2));
if (!command || command === "help" || flags.help) {
  console.log(USAGE);
  process.exit(command || flags.help ? 0 : 2);
}

const schemaPath = flags.schema || "env.schema.json";
let schema;
try {
  schema = JSON.parse(readFileSync(schemaPath, "utf8"));
} catch (error) {
  console.error(`envsafe: cannot read schema ${schemaPath}: ${error.message}`);
  process.exit(2);
}

const schemaErrors = validateSchemaDefinition(schema);
if (schemaErrors.length) {
  for (const error of schemaErrors) console.error(`envsafe: schema ${error.key}: ${error.message}${error.hint ? ` (${error.hint})` : ""}`);
  process.exit(2);
}

const emit = (text) => {
  if (flags.out) {
    writeFileSync(flags.out, text);
    console.log(`wrote ${flags.out}`);
  } else {
    process.stdout.write(text);
  }
};

if (command === "type") {
  emit(toTypeScript(schema));
  process.exit(0);
}

if (command === "example") {
  emit(toEnvExample(schema));
  process.exit(0);
}

if (command !== "check") {
  console.error(`envsafe: unknown command "${command}"\n\n${USAGE}`);
  process.exit(2);
}

let env = {};
const sourceErrors = [];
if (flags.env) {
  let text;
  try {
    text = readFileSync(flags.env, "utf8");
  } catch (error) {
    console.error(`envsafe: cannot read ${flags.env}: ${error.message}`);
    process.exit(2);
  }
  const parsed = parseDotenv(text);
  env = parsed.values;
  for (const error of parsed.errors) sourceErrors.push([`${flags.env}:${error.line}`, error.message]);
} else {
  env = { ...process.env };
}

const result = validateEnv(schema, env, {
  warnUnknown: flags.strict,
  sourceErrors: Object.fromEntries(sourceErrors),
});

if (flags.json) {
  const { values, ...safe } = result;
  process.stdout.write(JSON.stringify(safe, null, 2) + "\n");
  process.exit(result.ok ? 0 : 1);
}

const label = flags.env ? flags.env : "process.env";
console.log(`Environment: ${label}`);
process.stdout.write(formatReport(result));
process.exit(result.ok ? 0 : 1);
