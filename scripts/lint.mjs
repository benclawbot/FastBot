#!/usr/bin/env node
// Dependency-free repository hygiene checks. TypeScript's compiler runs next
// via the root "lint" script, so this command can run offline after install.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-z", "--", "packages", "scripts"], {
  encoding: "utf8",
}).split("\0").filter(Boolean).filter((path) => /\.(?:ts|tsx|js|mjs|cjs)$/.test(path));

const failures = [];
for (const path of files) {
  const contents = readFileSync(path, "utf8");
  if (contents.includes("\0")) failures.push(path + ": unexpected NUL byte");
  contents.split(/\r?\n/).forEach((line, index) => {
    if (/^(?:<{7}|>{7})\s/.test(line) || /^={7}$/.test(line)) {
      failures.push(path + ":" + (index + 1) + ": unresolved merge conflict marker");
    }
  });
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Checked " + files.length + " tracked JavaScript/TypeScript files for repository hygiene.");
}
