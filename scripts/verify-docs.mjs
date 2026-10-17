import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";

const repositoryRoot = resolve(process.cwd());
const mermaidFiles = [
  "docs/diagrams/system-architecture.mmd",
  "docs/diagrams/sql-execution-flow.mmd",
  "docs/diagrams/access-control.mmd",
];
const requiredFiles = [
  "README.md",
  "docs/architecture.md",
  "docs/security-design.md",
  "docs/data-model.md",
  "docs/adr/0007-phase2-codebuild-fail-closed-boundary.md",
  "docs/adr/0008-eventbridge-scheduler-and-dispatch-queue-boundary.md",
];

for (const file of requiredFiles) {
  await access(join(repositoryRoot, file));
}

for (const file of mermaidFiles) {
  const contents = await readFile(join(repositoryRoot, file), "utf8");
  if (!/^flowchart\s+/m.test(contents)) {
    throw new Error(`${file}: flowchart declaration is missing`);
  }
  if (/[<]script|javascript:|file:/i.test(contents)) {
    throw new Error(`${file}: unsafe script or URI found`);
  }
}

const ast = spawnSync("python3", ["-m", "ast", "docs/diagrams/aws-infrastructure.py"], {
  cwd: repositoryRoot,
  encoding: "utf8",
});
if (ast.status !== 0) {
  throw new Error(`Python diagram syntax check failed: ${ast.stderr}`);
}

console.log(`Documentation and diagram checks passed (${dirname(mermaidFiles[0])}).`);
