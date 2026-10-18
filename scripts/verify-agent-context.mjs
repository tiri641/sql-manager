import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from "node:path";

export const MAX_AGENT_LINES = 100;
export const MAX_STATUS_LINES = 100;

export const REQUIRED_AGENT_RULES = [
  "SAFE-NO-AWS-DB-SQL",
  "SAFE-NO-SENSITIVE-DATA",
  "SAFE-UNKNOWN-FAIL-CLOSED",
  "GATE-PLAN-REVIEW",
  "GATE-PRE-PR-REVIEW",
  "STATE-STATUS-ADR"
];

export const REQUIRED_STATUS_HEADINGS = [
  "Current phase",
  "Gate status",
  "In progress",
  "Completed",
  "Next actions",
  "Blockers / limitations",
  "Latest verification",
  "Active decisions",
  "Session handoff"
];

export const REQUIRED_SOURCE_RULE_IDS = [
  "SAFE-NO-AWS-DB-SQL",
  "SAFE-NO-SENSITIVE-DATA",
  "SAFE-UNKNOWN-FAIL-CLOSED",
  "GATE-PLAN-REVIEW",
  "GATE-PRE-PR-REVIEW",
  "STATE-STATUS-ADR"
];

export const ROOT_SAFETY_RULE_IDS = [
  "SAFE-NO-AWS-DB-SQL",
  "SAFE-NO-SENSITIVE-DATA",
  "SAFE-UNKNOWN-FAIL-CLOSED",
  "STATE-STATUS-ADR"
];

export const REQUIRED_STATUS_ARCHIVE_MIGRATIONS = [
  "Current phase",
  "Completed",
  "Current session update",
  "Next actions",
  "Blockers / limitations",
  "Latest validation evidence",
  "Validation evidence",
  "Active decisions",
  "Session handoff",
  "Historical review notes"
];

const CONTEXT_PATH_ALLOWLIST = new Set([
  "AGENTS.md",
  "README.md",
  "CONTRIBUTING.md",
  "status.md",
  "docs/agent-rules/README.md",
  "docs/agent-rules/context-policy.md",
  "docs/agent-rules/context-manifest.schema.json",
  "docs/agent-rules/source-of-truth.json",
  "docs/agent-rules/source-of-truth.schema.json",
  "docs/engineering-loop.md",
  "docs/security-design.md",
  "docs/adr/README.md",
  "docs/reviews/README.md",
  "docs/status-history/README.md",
  "scripts/create-context-manifest.mjs",
  "scripts/create-context-manifest.test.mjs",
  "scripts/verify-context-manifest.mjs",
  "scripts/verify-context-manifest.test.mjs",
  "scripts/run-concise.mjs",
  "scripts/run-concise.test.mjs",
  "scripts/context-git.mjs",
  "scripts/verify-agent-context.mjs",
  "scripts/verify-agent-context.test.mjs"
]);

const CONTEXT_PATH_PATTERNS = [
  /^\.github\/agents\/(?:README\.md|[a-z0-9-]+\.agent\.md)$/,
  /^\.github\/workflows\/[a-z0-9-]+\.yml$/
];

export function isAllowedContextPath(path) {
  const rawPath = String(path).replaceAll("\\", "/");
  const normalizedPath = normalize(rawPath).replaceAll("\\", "/");
  const rawSegments = rawPath.split("/");
  if (isAbsolute(path) || rawSegments.includes("..")) return false;
  if (normalizedPath.startsWith(".git/") || normalizedPath.startsWith("node_modules/")) return false;
  if (rawSegments.includes("secrets") || normalizedPath.includes("/.env") || normalizedPath.startsWith(".env")) return false;
  if ([".sql", ".pem", ".key", ".p12", ".pfx"].includes(extname(normalizedPath).toLowerCase())) return false;
  return CONTEXT_PATH_ALLOWLIST.has(normalizedPath) || CONTEXT_PATH_PATTERNS.some((pattern) => pattern.test(normalizedPath));
}

export function canonicalizeText(value) {
  return String(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

export function lineCount(value) {
  const normalized = canonicalizeText(value);
  return normalized === "" ? 0 : normalized.split("\n").length - (normalized.endsWith("\n") ? 1 : 0);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function computeWorkingTreeDigest(entries) {
  const paths = Object.keys(entries).sort();
  for (const path of paths) {
    if (!isAllowedContextPath(path)) {
      throw new Error(`context path is not allowed for digest: ${path}`);
    }
  }
  const canonicalInput = paths
    .map((path) => `${path}\0${canonicalizeText(entries[path])}\0`)
    .join("");
  return sha256(canonicalInput);
}

export function findRepositoryRoot(start = process.cwd()) {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, "AGENTS.md")) && existsSync(join(current, "status.md"))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error("repository root with AGENTS.md and status.md was not found");
    current = parent;
  }
}

async function readText(root, path) {
  return readFile(join(root, path), "utf8");
}

function headingExists(text, heading) {
  return text.split("\n").some((line) => line.trim() === `## ${heading}` || line.trim() === `# ${heading}`);
}

function extractLocalMarkdownLinks(text) {
  return [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1].trim().replace(/^<|>$/g, ""));
}

function headingAnchor(text, anchor) {
  const normalizedAnchor = anchor.toLowerCase().replace(/[<>`*_]/g, "").replace(/[^\p{Letter}\p{Number}\s-]/gu, "").trim().replace(/\s+/g, "-");
  return text.split("\n").some((line) => {
    if (!/^#{1,6}\s+/.test(line)) return false;
    const heading = line.replace(/^#{1,6}\s+/, "").replace(/\s+#+\s*$/, "");
    return heading.toLowerCase().replace(/[<>`*_]/g, "").replace(/[^\p{Letter}\p{Number}\s-]/gu, "").trim().replace(/\s+/g, "-") === normalizedAnchor;
  });
}

async function verifyLinks(root, sourcePath, text, errors) {
  for (const link of extractLocalMarkdownLinks(text)) {
    if (/^(https?:|mailto:|#)/.test(link)) {
      if (link.startsWith("#") && !headingAnchor(text, link.slice(1))) errors.push(`${sourcePath}: missing anchor ${link}`);
      continue;
    }
    const [target, anchor] = link.split("#", 2);
    const targetPath = normalize(join(dirname(join(root, sourcePath)), target));
    const rootRelative = relative(root, targetPath);
    if (rootRelative.startsWith("..") || isAbsolute(rootRelative) || !existsSync(targetPath)) {
      errors.push(`${sourcePath}: missing link target ${link}`);
      continue;
    }
    if (anchor) {
      const targetText = await readFile(targetPath, "utf8");
      if (!headingAnchor(targetText, anchor)) errors.push(`${sourcePath}: missing anchor ${link}`);
    }
  }
}

async function verifySourceOfTruth(root, errors) {
  const sourcePath = "docs/agent-rules/source-of-truth.json";
  const schemaPath = "docs/agent-rules/source-of-truth.schema.json";
  if (!existsSync(join(root, sourcePath)) || !existsSync(join(root, schemaPath))) {
    errors.push("source-of-truth manifest or schema is missing");
    return;
  }
  let manifest;
  let schema;
  try {
    manifest = JSON.parse(await readText(root, sourcePath));
    schema = JSON.parse(await readText(root, schemaPath));
  } catch (error) {
    errors.push(`source-of-truth is not valid JSON: ${error.message}`);
    return;
  }
  if (schema.type !== "object" || schema.additionalProperties !== false || schema.properties?.version?.const !== 1 || schema.properties?.rules?.type !== "array") {
    errors.push("source-of-truth schema is invalid or incomplete");
  }
  for (const required of ["version", "rules"]) {
    if (!schema.required?.includes(required)) errors.push(`source-of-truth schema missing required field: ${required}`);
  }
  const ruleSchema = schema.properties?.rules?.items;
  const ruleFields = ["id", "canonicalPath", "scope", "priority", "when", "requiredSections", "validationRule", "allowedReferences", "overridePolicy"];
  if (ruleSchema?.type !== "object" || ruleSchema?.additionalProperties !== false) errors.push("source-of-truth rule schema must be a closed object");
  for (const field of ruleFields) if (!ruleSchema?.required?.includes(field)) errors.push(`source-of-truth schema missing rule field: ${field}`);
  if (manifest.version !== 1) errors.push("source-of-truth.version must be 1");
  if (!Array.isArray(manifest.rules) || manifest.rules.length === 0) {
    errors.push("source-of-truth.rules must be a non-empty array");
    return;
  }
  const seen = new Set();
  for (const rule of manifest.rules) {
    for (const field of Object.keys(rule)) if (!ruleFields.includes(field)) errors.push(`source-of-truth rule has unknown field: ${field}`);
    for (const field of ruleFields) {
      if (!(field in rule)) errors.push(`source-of-truth rule missing ${field}`);
    }
    if (seen.has(rule.id)) errors.push(`duplicate source-of-truth rule id: ${rule.id}`);
    seen.add(rule.id);
    if (typeof rule.id !== "string" || !/^[A-Z0-9-]+$/.test(rule.id)) errors.push(`invalid source-of-truth rule id: ${rule.id}`);
    if (typeof rule.canonicalPath !== "string" || isAbsolute(rule.canonicalPath) || rule.canonicalPath.split("/").includes("..") || !existsSync(join(root, rule.canonicalPath))) errors.push(`invalid source-of-truth canonicalPath: ${rule.id}`);
    if (typeof rule.scope !== "string" || !rule.scope.startsWith("/")) errors.push(`invalid source-of-truth scope: ${rule.id}`);
    if (!Number.isInteger(rule.priority) || rule.priority < 0) errors.push(`invalid source-of-truth priority: ${rule.id}`);
    if (typeof rule.when !== "string" || rule.when.length === 0 || !Array.isArray(rule.requiredSections) || !Array.isArray(rule.allowedReferences) || typeof rule.validationRule !== "string") errors.push(`invalid source-of-truth rule fields: ${rule.id}`);
    if (!ruleSchema?.properties?.overridePolicy?.enum?.includes(rule.overridePolicy)) errors.push(`invalid source-of-truth overridePolicy: ${rule.id}`);
    if (ROOT_SAFETY_RULE_IDS.includes(rule.id) && rule.overridePolicy !== "root-safety-non-overridable") errors.push(`root safety overridePolicy may not be weakened: ${rule.id}`);
  }
  for (const requiredId of REQUIRED_SOURCE_RULE_IDS) if (!seen.has(requiredId)) errors.push(`source-of-truth missing required rule: ${requiredId}`);
}

async function verifyArchive(root, statusText, errors) {
  const archivePath = "docs/status-history/2026-10-18-status-pre-context-reduction.md";
  const metadataPath = "docs/status-history/2026-10-18-status-pre-context-reduction.json";
  if (!existsSync(join(root, archivePath)) || !existsSync(join(root, metadataPath))) {
    errors.push("status archive or archive metadata is missing");
    return;
  }
  const archiveText = await readText(root, archivePath);
  let metadata;
  try {
    metadata = JSON.parse(await readText(root, metadataPath));
  } catch (error) {
    errors.push(`status archive metadata is not valid JSON: ${error.message}`);
    return;
  }
  if (metadata.sourcePath !== "status.md" || metadata.archivePath !== archivePath) errors.push("status archive metadata paths are invalid");
  if (metadata.sourceLineCount !== metadata.archiveLineCount || metadata.archiveLineCount !== lineCount(archiveText)) errors.push("status archive line count mismatch");
  if (!/^[a-f0-9]{64}$/.test(metadata.sourceSha256 ?? "") || !/^[a-f0-9]{64}$/.test(metadata.archiveSha256 ?? "") || metadata.archiveSha256 !== sha256(Buffer.from(canonicalizeText(archiveText), "utf8"))) errors.push("status archive SHA-256 mismatch");
  if (!Array.isArray(metadata.migrations) || metadata.migrations.length === 0) errors.push("status archive migration map is missing");
  const migrationSources = new Set();
  for (const migration of metadata.migrations ?? []) {
    if (!REQUIRED_STATUS_ARCHIVE_MIGRATIONS.includes(migration.from)) errors.push(`status archive has unexpected migration source: ${migration.from}`);
    if (migrationSources.has(migration.from)) errors.push(`status archive has duplicate migration source: ${migration.from}`);
    migrationSources.add(migration.from);
    if (typeof migration.to !== "string" || migration.to.length === 0) errors.push(`status archive migration target is missing: ${migration.from}`);
    else if (!migration.to.includes("status.md") && !migration.to.includes("docs/") && !migration.to.includes("archive")) errors.push(`status archive migration target is not a repository reference: ${migration.from}`);
  }
  for (const requiredMigration of REQUIRED_STATUS_ARCHIVE_MIGRATIONS) if (!migrationSources.has(requiredMigration)) errors.push(`status archive migration is missing: ${requiredMigration}`);
  for (const heading of ["Current phase", "Historical review notes", "Validation evidence"]) {
    if (!archiveText.includes(heading)) errors.push(`status archive missing legacy heading: ${heading}`);
  }
  if (!statusText.includes(archivePath)) errors.push("status.md does not link to the status archive");
  await verifyLinks(root, archivePath, archiveText, errors);
}

export async function analyzeContext(root) {
  const errors = [];
  const agentsPath = "AGENTS.md";
  const statusPath = "status.md";
  const agents = await readText(root, agentsPath).catch(() => "");
  const status = await readText(root, statusPath).catch(() => "");
  if (!agents) errors.push("AGENTS.md is missing or empty");
  if (!status) errors.push("status.md is missing or empty");
  if (lineCount(agents) > MAX_AGENT_LINES) errors.push(`AGENTS.md exceeds ${MAX_AGENT_LINES} lines`);
  if (lineCount(status) > MAX_STATUS_LINES) errors.push(`status.md exceeds ${MAX_STATUS_LINES} lines`);
  for (const rule of REQUIRED_AGENT_RULES) if (!agents.includes(rule)) errors.push(`AGENTS.md missing required invariant: ${rule}`);
  for (const heading of REQUIRED_STATUS_HEADINGS) if (!headingExists(status, heading)) errors.push(`status.md missing required heading: ${heading}`);
  for (const legacyHeading of ["Historical review notes", "Validation evidence"]) if (headingExists(status, legacyHeading)) errors.push(`status.md contains legacy history heading: ${legacyHeading}`);
  await verifyLinks(root, agentsPath, agents, errors);
  await verifyLinks(root, statusPath, status, errors);
  await verifySourceOfTruth(root, errors);
  await verifyArchive(root, status, errors);
  return { ok: errors.length === 0, errors, lineCounts: { agents: lineCount(agents), status: lineCount(status) } };
}

async function main() {
  let root;
  try {
    root = findRepositoryRoot();
  } catch (error) {
    console.error(`context verification failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const result = await analyzeContext(root);
  if (!result.ok) {
    const maxErrors = 20;
    for (const error of result.errors.slice(0, maxErrors)) console.error(`context verification failed: ${error}`);
    if (result.errors.length > maxErrors) console.error(`context verification failed: ${result.errors.length - maxErrors} more errors omitted`);
    process.exitCode = 1;
    return;
  }
  console.log(`Agent context verification passed (AGENTS.md ${result.lineCounts.agents} lines, status.md ${result.lineCounts.status} lines).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
