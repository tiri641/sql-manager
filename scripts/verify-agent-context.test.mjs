import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { analyzeContext, canonicalizeText, computeWorkingTreeDigest, EXPECTED_SOURCE_RULES, lineCount, REQUIRED_AGENT_RULE_MARKERS, REQUIRED_STATUS_ARCHIVE_MIGRATIONS, sha256 } from "./verify-agent-context.mjs";

const requiredAgentRules = [
  "SAFE-NO-AWS-DB-SQL",
  "SAFE-NO-SENSITIVE-DATA",
  "SAFE-UNKNOWN-FAIL-CLOSED",
  "GATE-PLAN-REVIEW",
  "GATE-PRE-PR-REVIEW",
  "STATE-STATUS-ADR"
];

async function createFixture({ agentRules = requiredAgentRules, statusLines = 12, archive = "# Old status\n## Current phase\nCompleted\nCurrent session update\nNext actions\nBlockers / limitations\nLatest validation evidence\nValidation evidence\nActive decisions\nHistorical review notes\nSession handoff\n" } = {}) {
  const root = await mkdtemp(join(tmpdir(), "sql-patch-manager-context-"));
  await mkdir(join(root, ".github", "agents"), { recursive: true });
  await mkdir(join(root, "docs", "agent-rules"), { recursive: true });
  await mkdir(join(root, "docs", "status-history"), { recursive: true });
  const agents = [
    "# Agent rules",
    "## Safety invariants",
    ...agentRules.map((rule) => REQUIRED_AGENT_RULE_MARKERS[rule] ?? rule),
    "## References",
    "[Engineering loop](docs/engineering-loop.md)",
    "[Agent rules](docs/agent-rules/README.md)"
  ].join("\n") + "\n";
  const status = [
    "# Status",
    "## Current phase",
    "Phase 3a",
    "## Gate status",
    "PHASE_3A_PR_NOT_ALLOWED",
    "## In progress",
    "Context harness",
    "## Completed",
    "None",
    "## Next actions",
    "Verify",
    "## Blockers / limitations",
    "None",
    "## Latest verification",
    "Not run",
    "## Active decisions",
    "None",
    "## Session handoff",
    ...Array.from({ length: Math.max(0, statusLines - 17) }, (_, index) => `line ${index}`),
    "[Status archive](docs/status-history/2026-10-18-status-pre-context-reduction.md)"
  ].join("\n") + "\n";
  await writeFile(join(root, "AGENTS.md"), agents);
  await writeFile(join(root, "status.md"), status);
  await writeFile(join(root, "docs", "engineering-loop.md"), "# Engineering loop\n");
  await writeFile(join(root, ".github", "agents", "README.md"), "# Review agents\n");
  await writeFile(join(root, "docs", "agent-rules", "README.md"), "# Agent rules\n");
  await writeFile(join(root, "docs", "status-history", "2026-10-18-status-pre-context-reduction.md"), archive);
  const sourceRuleIds = [
    "SAFE-NO-AWS-DB-SQL",
    "SAFE-NO-SENSITIVE-DATA",
    "SAFE-UNKNOWN-FAIL-CLOSED",
    "GATE-PLAN-REVIEW",
    "GATE-PRE-PR-REVIEW",
    "STATE-STATUS-ADR"
  ];
  await writeFile(join(root, "docs", "agent-rules", "source-of-truth.json"), JSON.stringify({
    version: 1,
    rules: sourceRuleIds.map((id, priority) => ({
      ...EXPECTED_SOURCE_RULES[id],
      id,
      scope: "/",
      priority,
      when: id === "GATE-PLAN-REVIEW" ? "plan" : id === "GATE-PRE-PR-REVIEW" ? "pr" : "always"
    }))
  }, null, 2) + "\n");
  await writeFile(join(root, "docs", "agent-rules", "source-of-truth.schema.json"), JSON.stringify({
    type: "object",
    additionalProperties: false,
    required: ["version", "rules"],
    properties: {
      version: { const: 1 },
      rules: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "canonicalPath", "scope", "priority", "when", "requiredSections", "validationRule", "allowedReferences", "overridePolicy"], properties: { overridePolicy: { enum: ["root-safety-non-overridable", "scoped-additive-only"] } } } }
    }
  }, null, 2) + "\n");
  await writeFile(join(root, "docs", "status-history", "2026-10-18-status-pre-context-reduction.json"), JSON.stringify({
    sourcePath: "status.md",
    archivePath: "docs/status-history/2026-10-18-status-pre-context-reduction.md",
    sourceLineCount: lineCount(archive),
    archiveLineCount: lineCount(archive),
    sourceSha256: sha256(Buffer.from(canonicalizeText(archive), "utf8")),
    archiveSha256: sha256(Buffer.from(canonicalizeText(archive), "utf8")),
    migrations: REQUIRED_STATUS_ARCHIVE_MIGRATIONS.map((from) => ({ from, to: "status.md" }))
  }, null, 2) + "\n");
  return { root, archive, status };
}

test("accepts a compact context with required safety and handoff sections", async () => {
  const fixture = await createFixture();
  const result = await analyzeContext(fixture.root);
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("rejects missing safety invariant", async () => {
  const fixture = await createFixture({ agentRules: requiredAgentRules.slice(1) });
  const result = await analyzeContext(fixture.root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /SAFE-NO-AWS-DB-SQL/);
});

test("rejects status over the hard line limit", async () => {
  const fixture = await createFixture({ statusLines: 120 });
  const result = await analyzeContext(fixture.root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /status\.md.*100/);
});

test("rejects an incomplete status archive", async () => {
  const fixture = await createFixture();
  await writeFile(join(fixture.root, "docs", "status-history", "2026-10-18-status-pre-context-reduction.md"), "bad archive\n");
  const result = await analyzeContext(fixture.root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /archive/i);
});

test("rejects an invalid source-of-truth schema", async () => {
  const fixture = await createFixture();
  await writeFile(join(fixture.root, "docs", "agent-rules", "source-of-truth.schema.json"), "{}\n");
  const result = await analyzeContext(fixture.root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /source-of-truth schema/i);
});

test("rejects an open nested source-of-truth rule schema", async () => {
  const fixture = await createFixture();
  const schemaPath = join(fixture.root, "docs", "agent-rules", "source-of-truth.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  schema.properties.rules.items.additionalProperties = true;
  await writeFile(schemaPath, JSON.stringify(schema) + "\n");
  const result = await analyzeContext(fixture.root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /closed object/i);
});

test("rejects unknown source-of-truth rule fields", async () => {
  const fixture = await createFixture();
  const sourcePath = join(fixture.root, "docs", "agent-rules", "source-of-truth.json");
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  source.rules[0].unexpected = true;
  await writeFile(sourcePath, JSON.stringify(source) + "\n");
  const result = await analyzeContext(fixture.root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /unknown field/i);
});

test("rejects broken status links and anchors", async () => {
  const brokenTarget = await createFixture();
  await writeFile(join(brokenTarget.root, "status.md"), brokenTarget.status.replace("docs/status-history/2026-10-18-status-pre-context-reduction.md", "docs/status-history/missing.md"));
  const targetResult = await analyzeContext(brokenTarget.root);
  assert.equal(targetResult.ok, false);
  assert.match(targetResult.errors.join("\n"), /missing link target/i);

  const brokenAnchor = await createFixture();
  await writeFile(join(brokenAnchor.root, "status.md"), brokenAnchor.status.replace("docs/status-history/2026-10-18-status-pre-context-reduction.md", "docs/status-history/2026-10-18-status-pre-context-reduction.md#missing"));
  const anchorResult = await analyzeContext(brokenAnchor.root);
  assert.equal(anchorResult.ok, false);
  assert.match(anchorResult.errors.join("\n"), /missing anchor/i);
});

test("rejects an incomplete status migration map", async () => {
  const fixture = await createFixture();
  const metadataPath = join(fixture.root, "docs", "status-history", "2026-10-18-status-pre-context-reduction.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  metadata.migrations = metadata.migrations.filter((migration) => migration.from !== "Validation evidence");
  await writeFile(metadataPath, JSON.stringify(metadata) + "\n");
  const result = await analyzeContext(fixture.root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /migration is missing/i);
});

test("rejects weakening a root safety rule override policy", async () => {
  const fixture = await createFixture();
  const sourcePath = join(fixture.root, "docs", "agent-rules", "source-of-truth.json");
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  source.rules.find((rule) => rule.id === "STATE-STATUS-ADR").overridePolicy = "scoped-additive-only";
  await writeFile(sourcePath, JSON.stringify(source) + "\n");
  const result = await analyzeContext(fixture.root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /root safety overridePolicy/i);
});

test("canonicalizes CRLF and rejects secret or SQL paths from digest input", async () => {
  assert.equal(canonicalizeText("a\r\nb\r\n"), "a\nb\n");
  assert.throws(
    () => computeWorkingTreeDigest({ "docs/agent-rules/context-policy.md": "safe\n", "secrets/password.txt": "secret\n" }),
    /not allowed/i
  );
  assert.throws(
    () => computeWorkingTreeDigest({ "docs/query.sql": "SELECT 1;\n" }),
    /not allowed/i
  );
  assert.throws(
    () => computeWorkingTreeDigest({ "docs/../status.md": "unsafe path\n" }),
    /not allowed/i
  );
  assert.throws(
    () => computeWorkingTreeDigest({ "docs/secrets/example.txt": "secret\n" }),
    /not allowed/i
  );
  assert.throws(
    () => computeWorkingTreeDigest({ "docs/credentials.json": "{\"token\":\"redacted\"}\n" }),
    /not allowed/i
  );
});
