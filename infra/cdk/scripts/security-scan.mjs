import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const packageRoot = process.cwd();
const scanRoots = ["src", "test", "cdk.json", "package.json", "../../apps", "../../.github"];
const forbidden = [
  /password\s*[:=]\s*["'`][^"'`]+["'`]/i,
  /secretValue\s*[:=]\s*["'`][^"'`]+["'`]/i,
  /unsafePlainText\s*\(/i,
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/i,
];

async function collectFiles(path) {
  const absolutePath = join(packageRoot, path);
  const entries = await readdir(absolutePath, { withFileTypes: true }).catch(() => undefined);
  if (!entries) {
    return [absolutePath];
  }

  const nested = await Promise.all(entries.map((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? collectFiles(child) : [join(packageRoot, child)];
  }));
  return nested.flat();
}

const files = (await Promise.all(scanRoots.map(collectFiles)))
  .flat()
  .filter((file) => [".ts", ".mjs", ".js", ".json", ".yml", ".yaml"].includes(extname(file)));

for (const file of files) {
  const contents = await readFile(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(contents)) {
      throw new Error(`Potential secret literal detected in ${relative(packageRoot, file)}`);
    }
  }
}

console.log("Static secret-literal scan passed.");
