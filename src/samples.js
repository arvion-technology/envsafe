// The sample schema and environments used by the demo, the CLI examples and
// the tests. One source of truth so a screenshot and a test never disagree.

export const ENV_SCHEMA = {
  NODE_ENV: {
    type: "enum",
    values: ["development", "test", "production"],
    required: true,
    default: "development",
    description: "Runtime mode. Affects logging and error detail.",
  },
  SERVICE_NAME: {
    type: "string",
    required: true,
    minLength: 2,
    description: "Used in logs, metrics and the health endpoint.",
  },
  PORT: {
    type: "port",
    required: true,
    default: 3000,
    description: "Port the HTTP server binds to.",
  },
  DATABASE_URL: {
    type: "url",
    required: true,
    protocols: ["postgres:", "postgresql:"],
    description: "PostgreSQL connection string.",
  },
  API_KEY: {
    type: "string",
    required: true,
    secret: true,
    minLength: 12,
    hint: "generate one with: openssl rand -hex 24",
    description: "Key used to sign outbound API requests.",
  },
  DEBUG: {
    type: "boolean",
    required: false,
    default: false,
    description: "Verbose request logging.",
  },
  REQUEST_TIMEOUT: {
    type: "duration",
    required: false,
    default: "30s",
    description: "Upstream timeout, converted to milliseconds.",
  },
  LOG_LEVEL: {
    type: "enum",
    values: ["debug", "info", "warn", "error"],
    required: false,
    default: "info",
    description: "Minimum level written to stdout.",
  },
  FEATURE_FLAGS: {
    type: "json",
    required: false,
    default: "{}",
    description: "Inline feature-flag overrides.",
  },
  SENTRY_DSN: {
    type: "url",
    required: false,
    protocols: ["https:"],
    secret: true,
    description: "Optional error-reporting endpoint.",
  },
};

export const VALID_ENV = `# checkout-api local environment
NODE_ENV=production
SERVICE_NAME=checkout-api
PORT=8080
DATABASE_URL=postgres://app:secret@db.internal:5432/checkout
API_KEY=sk_live_51H8xQ2eZvKYlo2C
DEBUG=true
REQUEST_TIMEOUT=2m
LOG_LEVEL=debug
FEATURE_FLAGS={"newCheckout":true,"searchV2":false}
SENTRY_DSN=https://abc123@sentry.example.com/42
`;

export const BROKEN_ENV = `NODE_ENV=production
SERVICE_NAME=x
PORT=eight-thousand
DATABASE_URL=localhost:5432/checkout
DEBUG=maybe
REQUEST_TIMEOUT=soon
LOG_LEVEL=verbose
FEATURE_FLAGS={"newCheckout": true
`;

export const SAMPLE_ENVIRONMENTS = [
  { id: "valid", name: "Valid setup", text: VALID_ENV },
  { id: "broken", name: "Broken setup", text: BROKEN_ENV },
];
