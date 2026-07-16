// .env parser.
//
// Supports the parts of dotenv syntax people actually use: comments, `export`,
// single and double quotes, escaped newlines in double quotes, inline comments
// after unquoted values, and later assignments overriding earlier ones. A
// malformed line is reported with its line number instead of being skipped,
// because silently ignoring a typo is how a production deploy gets the wrong
// database URL.

export function parseDotenv(text) {
  const values = {};
  const errors = [];
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");

  for (let index = 0; index < lines.length; index++) {
    let line = lines[index].trim();
    const lineNumber = index + 1;
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();

    const equals = line.indexOf("=");
    if (equals <= 0) {
      errors.push({ line: lineNumber, message: "expected KEY=VALUE" });
      continue;
    }
    const key = line.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      errors.push({ line: lineNumber, message: `invalid variable name "${key}"` });
      continue;
    }

    let rest = line.slice(equals + 1).trim();
    let value;

    if (rest.startsWith('"')) {
      // Double-quoted: escape sequences are interpreted, `#` is literal.
      let end = -1;
      for (let cursor = 1; cursor < rest.length; cursor++) {
        if (rest[cursor] === "\\") { cursor++; continue; }
        if (rest[cursor] === '"') { end = cursor; break; }
      }
      if (end === -1) {
        errors.push({ line: lineNumber, message: "unterminated double-quoted value" });
        continue;
      }
      value = rest.slice(1, end).replace(/\\([nrt"\\])/g, (_, escape) => ({ n: "\n", r: "\r", t: "\t" })[escape] ?? escape);
    } else if (rest.startsWith("'")) {
      // Single-quoted: everything literal, including backslashes.
      const end = rest.indexOf("'", 1);
      if (end === -1) {
        errors.push({ line: lineNumber, message: "unterminated single-quoted value" });
        continue;
      }
      value = rest.slice(1, end);
    } else {
      // Unquoted: an inline comment starts at ` #`, not at `#` inside a value.
      const comment = rest.search(/\s#/);
      if (comment !== -1) rest = rest.slice(0, comment);
      value = rest.trim();
    }

    values[key] = value;
  }

  return { values, errors };
}

/** Serialise values as a .env document (used by the CLI example command). */
export function stringifyDotenv(values) {
  return Object.entries(values)
    .map(([key, value]) => {
      const text = String(value ?? "");
      const needsQuotes = /[\s#"']/.test(text) || text === "";
      return `${key}=${needsQuotes ? JSON.stringify(text) : text}`;
    })
    .join("\n") + "\n";
}
