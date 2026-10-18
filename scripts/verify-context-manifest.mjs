import { lstat, readFile, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";

import { computeWorkingTreeDigest, findRepositoryRoot, isAllowedContextPath, lineCount } from "./verify-agent-context.mjs";
import { readGitState } from "./context-git.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const MANIFEST_FIELDS = new Set(["schemaVersion", "revision", "workingTreeDigest", "dirty", "untracked", "allowedFiles", "verification", "sensitiveData"]);
const FILE_FIELDS = new Set(["path", "lineRanges"]);
const RANGE_FIELDS = new Set(["start", "end"]);
const VERIFICATION_FIELDS = new Set(["command", "status", "digest"]);

function addError(errors, message) {
  errors.push(message);
}

function validateShape(manifest, errors) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    addError(errors, "manifest must be a JSON object");
    return;
  }
  for (const field of Object.keys(manifest ?? {})) if (!MANIFEST_FIELDS.has(field)) addError(errors, `manifest contains unknown field: ${field}`);
  for (const field of ["schemaVersion", "revision", "workingTreeDigest", "allowedFiles", "verification", "sensitiveData"]) {
    if (!(field in manifest)) addError(errors, `manifest is missing ${field}`);
  }
  if (manifest.schemaVersion !== 1) addError(errors, "manifest schemaVersion must be 1");
  if (typeof manifest.revision !== "string" || manifest.revision.length === 0) addError(errors, "manifest revision must be a non-empty string");
  if (!SHA256.test(manifest.workingTreeDigest ?? "")) addError(errors, "manifest workingTreeDigest must be SHA-256");
  if (manifest.sensitiveData !== false) addError(errors, "manifest sensitiveData must be false");
  if ("dirty" in manifest && typeof manifest.dirty !== "boolean") addError(errors, "manifest dirty must be boolean");
  if ("untracked" in manifest && typeof manifest.untracked !== "boolean") addError(errors, "manifest untracked must be boolean");
  if (!Array.isArray(manifest.allowedFiles) || manifest.allowedFiles.length === 0) addError(errors, "manifest allowedFiles must be non-empty");
  if (!Array.isArray(manifest.verification)) addError(errors, "manifest verification must be an array");
  for (const [index, file] of (manifest.allowedFiles ?? []).entries()) {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      addError(errors, `allowedFiles[${index}] must be an object`);
      continue;
    }
    for (const field of Object.keys(file)) if (!FILE_FIELDS.has(field)) addError(errors, `allowedFiles[${index}] contains unknown field: ${field}`);
    if (typeof file.path !== "string" || !Array.isArray(file.lineRanges) || file.lineRanges.length === 0) addError(errors, `allowedFiles[${index}] shape is invalid`);
    for (const [rangeIndex, range] of (file.lineRanges ?? []).entries()) {
      if (!range || typeof range !== "object" || Array.isArray(range)) {
        addError(errors, `allowedFiles[${index}].lineRanges[${rangeIndex}] must be an object`);
        continue;
      }
      for (const field of Object.keys(range)) if (!RANGE_FIELDS.has(field)) addError(errors, `allowedFiles[${index}].lineRanges[${rangeIndex}] contains unknown field: ${field}`);
    }
  }
  for (const [index, verification] of (manifest.verification ?? []).entries()) {
    if (!verification || typeof verification !== "object" || Array.isArray(verification)) {
      addError(errors, `verification[${index}] must be an object`);
      continue;
    }
    for (const field of Object.keys(verification)) if (!VERIFICATION_FIELDS.has(field)) addError(errors, `verification[${index}] contains unknown field: ${field}`);
    if (typeof verification.command !== "string" || verification.command.length === 0) addError(errors, `verification[${index}] command is invalid`);
    if (!["passed", "failed", "not-run"].includes(verification.status)) addError(errors, `verification[${index}] status is invalid`);
    if (!SHA256.test(verification.digest ?? "")) addError(errors, `verification[${index}] digest is invalid`);
  }
}

async function validateSchemaDocument(root, errors) {
  const schemaPath = join(root, "docs/agent-rules/context-manifest.schema.json");
  if (!existsSync(schemaPath)) {
    addError(errors, "context manifest schema is missing");
    return;
  }
  let schema;
  try {
    schema = JSON.parse(await readFile(schemaPath, "utf8"));
  } catch (error) {
    addError(errors, `context manifest schema is invalid JSON: ${error.message}`);
    return;
  }
  if (schema.type !== "object" || schema.additionalProperties !== false || schema.properties?.schemaVersion?.const !== 1) addError(errors, "context manifest schema top-level constraints are invalid");
  for (const required of ["schemaVersion", "revision", "workingTreeDigest", "allowedFiles", "verification", "sensitiveData"]) {
    if (!schema.required?.includes(required)) addError(errors, `context manifest schema missing required field: ${required}`);
  }
  if (schema.properties?.allowedFiles?.items?.additionalProperties !== false || schema.properties?.verification?.items?.additionalProperties !== false) addError(errors, "context manifest schema nested additionalProperties must be false");
}

async function readSafeEntries(root, allowedFiles, errors) {
  const rootPath = await realpath(root);
  const entries = {};
  const seen = new Set();
  for (const [index, file] of (allowedFiles ?? []).entries()) {
    const path = typeof file?.path === "string" ? file.path.replaceAll("\\", "/") : "";
    if (!path || isAbsolute(path) || path.split("/").includes("..") || !isAllowedContextPath(path)) {
      addError(errors, `allowedFiles[${index}] path is not allowed`);
      continue;
    }
    if (seen.has(path)) addError(errors, `allowedFiles contains duplicate path: ${path}`);
    seen.add(path);
    if (!Array.isArray(file.lineRanges) || file.lineRanges.length === 0) {
      addError(errors, `allowedFiles[${index}] lineRanges is invalid`);
      continue;
    }
    const absolute = resolve(rootPath, normalize(path));
    const rootRelative = relative(rootPath, absolute);
    if (rootRelative.startsWith("..") || isAbsolute(rootRelative) || !existsSync(absolute)) {
      addError(errors, `allowedFiles[${index}] is outside or missing: ${path}`);
      continue;
    }
    const fileStats = await lstat(absolute);
    if (fileStats.isSymbolicLink() || !fileStats.isFile()) {
      addError(errors, `allowedFiles[${index}] is not a regular file: ${path}`);
      continue;
    }
    const realFile = await realpath(absolute);
    const realRelative = relative(rootPath, realFile);
    if (realRelative.startsWith("..") || isAbsolute(realRelative)) {
      addError(errors, `allowedFiles[${index}] escapes repository root: ${path}`);
      continue;
    }
    let contents;
    try {
      contents = await readFile(absolute, "utf8");
    } catch (error) {
      addError(errors, `allowedFiles[${index}] cannot be read: ${path}`);
      continue;
    }
    const lines = lineCount(contents);
    for (const [rangeIndex, range] of file.lineRanges.entries()) {
      if (!Number.isInteger(range?.start) || !Number.isInteger(range?.end) || range.start < 1 || range.end < range.start || range.end > lines) {
        addError(errors, `allowedFiles[${index}].lineRanges[${rangeIndex}] is invalid: ${path}`);
      }
    }
    entries[path] = contents;
  }
  return entries;
}

export async function verifyManifest(root, manifest) {
  const errors = [];
  await validateSchemaDocument(root, errors);
  validateShape(manifest, errors);
  const gitState = await readGitState(root);
  if (!gitState) {
    if (manifest?.revision !== "working-tree") addError(errors, "manifest revision must be working-tree when Git state is unavailable");
    if ("dirty" in (manifest ?? {}) || "untracked" in (manifest ?? {})) addError(errors, "manifest dirty/untracked must be omitted when Git state is unavailable");
  } else {
    if (manifest?.revision !== gitState.head) addError(errors, "manifest revision does not match Git HEAD");
    if (manifest?.dirty !== gitState.dirty) addError(errors, "manifest dirty does not match Git status");
    if (manifest?.untracked !== gitState.untracked) addError(errors, "manifest untracked does not match Git status");
  }
  const entries = await readSafeEntries(root, manifest?.allowedFiles, errors);
  if (errors.length === 0) {
    const actualDigest = computeWorkingTreeDigest(entries);
    if (actualDigest !== manifest.workingTreeDigest) addError(errors, "manifest workingTreeDigest does not match allowed files");
  }
  return { ok: errors.length === 0, errors };
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error("Usage: node scripts/verify-context-manifest.mjs <manifest-path>");
    process.exitCode = 2;
    return;
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    console.error(`context manifest verification failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  let root;
  try {
    root = findRepositoryRoot();
  } catch (error) {
    console.error(`context manifest verification failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const result = await verifyManifest(root, manifest);
  if (!result.ok) {
    const maxErrors = 20;
    for (const error of result.errors.slice(0, maxErrors)) console.error(`context manifest verification failed: ${error}`);
    if (result.errors.length > maxErrors) console.error(`context manifest verification failed: ${result.errors.length - maxErrors} more errors omitted`);
    process.exitCode = 1;
    return;
  }
  console.log(`Context manifest verification passed (${manifest.allowedFiles.length} files).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
