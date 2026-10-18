import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, normalize, relative, resolve } from "node:path";

import { computeWorkingTreeDigest, isAllowedContextPath, lineCount, sha256 } from "./verify-agent-context.mjs";
import { readGitState } from "./context-git.mjs";

function usage() {
  console.error("Usage: node scripts/create-context-manifest.mjs --files path:start-end,path:start-end [--revision value] [--out path]");
  process.exitCode = 2;
}

function parseArgs(argv) {
  const options = { files: [], revision: "working-tree", out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--files") options.files = argv[++index]?.split(",").filter(Boolean) ?? [];
    else if (argument === "--revision") options.revision = argv[++index] ?? "";
    else if (argument === "--out") options.out = argv[++index] ?? null;
    else return null;
  }
  return options;
}

export function parseFileSpec(spec) {
  const separator = spec.lastIndexOf(":");
  if (separator < 1) throw new Error(`invalid file spec: ${spec}`);
  const rawPath = spec.slice(0, separator).replaceAll("\\", "/");
  if (isAbsolute(rawPath) || rawPath.split("/").includes("..")) throw new Error(`path traversal is not allowed: ${rawPath}`);
  const path = normalize(rawPath).replaceAll("\\", "/");
  if (!isAllowedContextPath(path)) throw new Error(`context path is not allowed: ${path}`);
  const [startText, endText = startText] = spec.slice(separator + 1).split("-");
  const start = Number(startText);
  const end = Number(endText);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) throw new Error(`invalid line range: ${spec}`);
  return { path, lineRanges: [{ start, end }] };
}

async function resolveInsideRoot(root, candidate, label) {
  const rootPath = await realpath(root);
  const absolute = resolve(rootPath, candidate);
  const relativePath = relative(rootPath, absolute);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) throw new Error(`${label} must remain inside repository root`);
  return { rootPath, absolute };
}

export async function createManifest(root, options) {
  const rootPath = await realpath(root);
  const gitState = await readGitState(rootPath);
  if (gitState && (options.revision === "working-tree" || options.revision !== gitState.head)) {
    throw new Error("revision must match Git HEAD; working-tree is only allowed when Git state is unavailable");
  }
  if (!gitState && options.revision !== "working-tree") {
    throw new Error("revision must match Git HEAD; use working-tree only when Git state is unavailable");
  }
  const allowedFiles = options.files.map(parseFileSpec);
  const entries = {};
  for (const file of allowedFiles) {
    const { absolute } = await resolveInsideRoot(rootPath, file.path, `context file ${file.path}`);
    if (!existsSync(absolute)) throw new Error(`context file does not exist: ${file.path}`);
    const fileStats = await lstat(absolute);
    if (fileStats.isSymbolicLink()) throw new Error(`symbolic links are not allowed: ${file.path}`);
    if (!fileStats.isFile()) throw new Error(`context path is not a regular file: ${file.path}`);
    const realFile = await realpath(absolute);
    const realRelative = relative(rootPath, realFile);
    if (realRelative.startsWith("..") || isAbsolute(realRelative)) throw new Error(`context file escapes repository root: ${file.path}`);
    const contents = await readFile(absolute, "utf8");
    if (file.lineRanges.some((range) => range.end > lineCount(contents))) {
      throw new Error(`line range exceeds file length: ${file.path}`);
    }
    entries[file.path] = contents;
  }
  const manifest = {
    schemaVersion: 1,
    revision: gitState ? gitState.head : "working-tree",
    workingTreeDigest: computeWorkingTreeDigest(entries),
    allowedFiles,
    verification: [{
      command: "node scripts/verify-agent-context.mjs",
      status: "not-run",
      digest: sha256("not-run")
    }],
    sensitiveData: false
  };
  if (gitState) {
    manifest.dirty = gitState.dirty;
    manifest.untracked = gitState.untracked;
  }
  return manifest;
}

export async function writeManifest(root, outputPath, manifest) {
  const output = `${JSON.stringify(manifest, null, 2)}\n`;
  const { rootPath, absolute } = await resolveInsideRoot(root, outputPath, "manifest output");
  const parent = await realpath(dirname(absolute));
  const parentRelative = relative(rootPath, parent);
  if (parentRelative.startsWith("..") || isAbsolute(parentRelative)) throw new Error("manifest output parent escapes repository root");
  if (existsSync(absolute) && (await lstat(absolute)).isSymbolicLink()) throw new Error("manifest output cannot be a symbolic link");
  await writeFile(absolute, output, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options || options.files.length === 0) return usage();
  const root = process.cwd();
  const manifest = await createManifest(root, options);
  if (options.out) {
    await writeManifest(root, options.out, manifest);
  } else process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`context manifest creation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
