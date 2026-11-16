// PreToolUse hook for the backend-engineer, frontend-engineer and test-verifier subagents.
// Usage: node scope-guard.mjs <backend|frontend|test>
// Blocks Edit/Write outside the scope's paths, and state-destroying Bash commands.
// Exit code 2 = block the tool call; stderr is shown to the agent as the reason.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const SHARED_BLOCKED_COMMANDS = [
  { pattern: /\bgit\s+(commit|push|checkout|switch|reset|rebase|merge)\b/, reason: "git state changes are for the lead, not the engineer agents" },
  { pattern: /\bprisma\s+migrate\s+reset\b/, reason: "prisma migrate reset drops the database" },
  { pattern: /\bprisma\s+db\s+push\b/, reason: "schema changes must go through `pnpm prisma migrate dev`" },
  { pattern: /(^|[\s;&|])(npm|yarn|bun|npx)\s/, reason: "this project uses pnpm only" },
  { pattern: /\bdocker\s+compose\s+down\s+.*-v\b|\bdocker\s+volume\s+rm\b/, reason: "this would delete database volumes" },
];

const SCOPES = {
  backend: {
    allowedPaths: [
      /^features\/[^/]+\/(schema|data-access|actions)\.ts$/,
      /^features\/[^/]+\/(__tests__\/)?[^/]+\.test\.ts$/,
      /^lib\/.+\.ts$/,
      /^prisma\/schema\.prisma$/,
      /^prisma\/seed\.ts$/,
      /^prisma\/migrations\/.+$/, // new files only, see below
      /^app\/api\/.+\/route\.ts$/,
      /^tests\/(?!e2e\/).+\.ts$/,
      /^\.env\.example$/,
    ],
    blockedCommands: [],
  },
  frontend: {
    allowedPaths: [
      /^app\/(?!api\/).+\.(tsx|ts|css)$/,
      /^features\/[^/]+\/components\/.+\.(tsx|ts)$/,
      /^components\/.+\.(tsx|ts)$/,
    ],
    blockedCommands: [
      { pattern: /\bprisma\s+(migrate|db)\b/, reason: "migrations and database changes belong to the backend engineer" },
    ],
  },
  test: {
    // The test-verifier writes Playwright acceptance specs only. Never app code.
    allowedPaths: [/^tests\/e2e\/[^/]+\.spec\.ts$/],
    blockedCommands: [
      { pattern: /\bprisma\s+migrate\b/, reason: "migrations belong to the backend engineer" },
    ],
  },
};

function block(reason) {
  process.stderr.write(`Blocked by scope-guard: ${reason}\n`);
  process.exit(2);
}

function toRelative(filePath, projectDir) {
  const absolute = path.resolve(projectDir, filePath);
  return path.relative(projectDir, absolute).split(path.sep).join("/");
}

const scopeName = process.argv[2];
const scope = SCOPES[scopeName];
if (!scope) block(`unknown scope "${scopeName}". Expected one of: ${Object.keys(SCOPES).join(", ")}.`);

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  // Fail closed: if we cannot read the tool call, we cannot prove it is in scope.
  block("could not parse the hook input.");
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const toolInput = input.tool_input ?? {};

if (input.tool_name === "Edit" || input.tool_name === "Write") {
  const relative = toRelative(toolInput.file_path ?? "", projectDir);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    block(`${toolInput.file_path} is outside the project.`);
  }
  if (!scope.allowedPaths.some((pattern) => pattern.test(relative))) {
    block(`${relative} is outside the ${scopeName} scope. Stop and report it instead of working around this.`);
  }
  if (relative.startsWith("prisma/migrations/") && existsSync(path.join(projectDir, relative))) {
    block(`${relative} is an existing migration. Never edit migrations; create a new one with \`pnpm prisma migrate dev\`.`);
  }
}

if (input.tool_name === "Bash") {
  const command = toolInput.command ?? "";
  for (const { pattern, reason } of [...SHARED_BLOCKED_COMMANDS, ...scope.blockedCommands]) {
    if (pattern.test(command)) block(reason);
  }
}

process.exit(0);
