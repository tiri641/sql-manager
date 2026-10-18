import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { createManifest, writeManifest } from "./create-context-manifest.mjs";
import { verifyManifest } from "./verify-context-manifest.mjs";

const execFileAsync = promisify(execFile);

async function createGitFixture() {
  const root = await mkdtemp(join(tmpdir(), "sql-patch-manager-git-manifest-"));
  await writeFile(join(root, "status.md"), "# Status\n", "utf8");
  await execFileAsync("git", ["-C", root, "init", "-q"]);
  await execFileAsync("git", ["-C", root, "config", "user.name", "Context Test"]);
  await execFileAsync("git", ["-C", root, "config", "user.email", "context-test@example.invalid"]);
  await execFileAsync("git", ["-C", root, "add", "status.md"]);
  await execFileAsync("git", ["-C", root, "-c", "commit.gpgSign=false", "commit", "-m", "fixture"]);
  const { stdout } = await execFileAsync("git", ["-C", root, "rev-parse", "HEAD"]);
  return { root, head: stdout.trim() };
}

async function writeManifestSchema(root) {
  await mkdir(join(root, "docs", "agent-rules"), { recursive: true });
  await writeFile(join(root, "docs", "agent-rules", "context-manifest.schema.json"), JSON.stringify({
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "revision", "workingTreeDigest", "allowedFiles", "verification", "sensitiveData"],
    properties: {
      schemaVersion: { const: 1 },
      allowedFiles: { items: { additionalProperties: false } },
      verification: { items: { additionalProperties: false } }
    }
  }), "utf8");
}

test("creates a manifest for explicit in-range files", async () => {
  const root = await mkdtemp(join(tmpdir(), "sql-patch-manager-manifest-"));
  await writeFile(join(root, "status.md"), "# Status\n## Handoff\n", "utf8");

  const manifest = await createManifest(root, { files: ["status.md:1-2"], revision: "working-tree" });
  assert.equal(manifest.allowedFiles[0].path, "status.md");
  assert.equal(manifest.allowedFiles[0].lineRanges[0].end, 2);
});

test("rejects a line range beyond the current file", async () => {
  const root = await mkdtemp(join(tmpdir(), "sql-patch-manager-manifest-"));
  await writeFile(join(root, "status.md"), "# Status\n", "utf8");

  await assert.rejects(
    () => createManifest(root, { files: ["status.md:1-2"], revision: "working-tree" }),
    /line range exceeds file length/i
  );
});

test("rejects traversal before reading a normalized path", async () => {
  const root = await mkdtemp(join(tmpdir(), "sql-patch-manager-manifest-"));
  await writeFile(join(root, "status.md"), "# Status\n", "utf8");

  await assert.rejects(
    () => createManifest(root, { files: ["docs/../status.md:1-1"], revision: "working-tree" }),
    /path traversal|not allowed/i
  );
});

test("rejects a symlinked context file", async () => {
  const root = await mkdtemp(join(tmpdir(), "sql-patch-manager-manifest-"));
  await mkdir(join(root, "docs", "agent-rules"), { recursive: true });
  await writeFile(join(root, "status.md"), "# Status\n", "utf8");
  await symlink(join(root, "status.md"), join(root, "docs", "agent-rules", "link.md"));

  await assert.rejects(
    () => createManifest(root, { files: ["docs/agent-rules/link.md:1-1"], revision: "working-tree" }),
    /symbolic link|not allowed/i
  );
});

test("rejects a manifest output outside the repository root", async () => {
  const root = await mkdtemp(join(tmpdir(), "sql-patch-manager-manifest-"));
  await writeFile(join(root, "status.md"), "# Status\n", "utf8");
  const manifest = await createManifest(root, { files: ["status.md:1-1"], revision: "working-tree" });

  await assert.rejects(
    () => writeManifest(root, "../manifest.json", manifest),
    /inside repository root/i
  );
});

test("refuses to overwrite an existing manifest output", async () => {
  const root = await mkdtemp(join(tmpdir(), "sql-patch-manager-manifest-"));
  await writeFile(join(root, "status.md"), "# Status\n", "utf8");
  const manifest = await createManifest(root, { files: ["status.md:1-1"], revision: "working-tree" });
  await writeManifest(root, "manifest.json", manifest);
  await assert.rejects(
    () => writeManifest(root, "manifest.json", manifest),
    /refusing overwrite/i
  );
});

test("verifies a generated manifest and rejects a digest mismatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "sql-patch-manager-manifest-"));
  await writeFile(join(root, "status.md"), "# Status\n", "utf8");
  await writeManifestSchema(root);
  const manifest = await createManifest(root, { files: ["status.md:1-1"], revision: "working-tree" });

  const valid = await verifyManifest(root, manifest);
  assert.equal(valid.ok, true, valid.errors.join("\n"));
  const tampered = { ...manifest, workingTreeDigest: "0".repeat(64) };
  const invalid = await verifyManifest(root, tampered);
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join("\n"), /digest/i);
  const unknown = await verifyManifest(root, { ...manifest, unknown: true });
  assert.equal(unknown.ok, false);
  assert.match(unknown.errors.join("\n"), /unknown field/i);
  const fakeRevision = await verifyManifest(root, { ...manifest, revision: "UNVERIFIED-REVISION" });
  assert.equal(fakeRevision.ok, false);
  assert.match(fakeRevision.errors.join("\n"), /revision/i);
});

test("rejects an arbitrary revision when Git is unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "sql-patch-manager-manifest-"));
  await writeFile(join(root, "status.md"), "# Status\n", "utf8");

  await assert.rejects(
    () => createManifest(root, { files: ["status.md:1-1"], revision: "FAKE-COMMIT" }),
    /revision must match Git HEAD/i
  );
});

test("requires the current Git HEAD and records clean state", async () => {
  const fixture = await createGitFixture();
  const manifest = await createManifest(fixture.root, { files: ["status.md:1-1"], revision: fixture.head });
  assert.equal(manifest.revision, fixture.head);
  assert.equal(manifest.dirty, false);
  assert.equal(manifest.untracked, false);
  await assert.rejects(
    () => createManifest(fixture.root, { files: ["status.md:1-1"], revision: "0".repeat(40) }),
    /revision must match Git HEAD/i
  );
});

test("records dirty and untracked Git state in the manifest", async () => {
  const fixture = await createGitFixture();
  await writeFile(join(fixture.root, "status.md"), "# Changed\n", "utf8");
  await writeFile(join(fixture.root, "notes.txt"), "untracked\n", "utf8");
  const manifest = await createManifest(fixture.root, { files: ["status.md:1-1"], revision: fixture.head });
  assert.equal(manifest.dirty, true);
  assert.equal(manifest.untracked, true);
});

test("verifies Git HEAD and working tree metadata", async () => {
  const fixture = await createGitFixture();
  await writeManifestSchema(fixture.root);
  const manifest = await createManifest(fixture.root, { files: ["status.md:1-1"], revision: fixture.head });
  const valid = await verifyManifest(fixture.root, manifest);
  assert.equal(valid.ok, true, valid.errors.join("\n"));

  const staleRevision = await verifyManifest(fixture.root, { ...manifest, revision: "0".repeat(40) });
  assert.equal(staleRevision.ok, false);
  assert.match(staleRevision.errors.join("\n"), /Git HEAD/i);

  await writeFile(join(fixture.root, "status.md"), "# Changed\n", "utf8");
  await writeFile(join(fixture.root, "notes.txt"), "untracked\n", "utf8");
  const staleState = await verifyManifest(fixture.root, { ...manifest, dirty: false, untracked: false });
  assert.equal(staleState.ok, false);
  assert.match(staleState.errors.join("\n"), /dirty|untracked/i);
});
