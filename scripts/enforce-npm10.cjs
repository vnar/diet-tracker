#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

function readNpmMajorFromExecPath() {
  const execPath = process.env.npm_execpath;
  if (!execPath) return null;
  const pkgPath = path.resolve(path.dirname(execPath), "..", "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const major = Number(String(pkg.version || "").split(".")[0]);
    return Number.isFinite(major) ? major : null;
  } catch {
    return null;
  }
}

const major = readNpmMajorFromExecPath();
if (major !== 10) {
  console.error(
    [
      "This repo requires npm 10 to keep package-lock.json CI-compatible.",
      "Use npm 10 for installs, e.g. `npx npm@10 install`.",
      "Then commit the updated package-lock.json.",
    ].join("\n"),
  );
  process.exit(1);
}
