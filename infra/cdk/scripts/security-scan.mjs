import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(process.cwd(), "src");
const files = ["config.ts", "stacks/database-stack.ts", "stacks/storage-stack.ts"];
const forbidden = [
  /password\s*[:=]\s*["'`][^"'`]+["'`]/i,
  /secretValue\s*[:=]\s*["'`][^"'`]+["'`]/i,
  /unsafePlainText\s*\(/i,
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/i,
];

for (const file of files) {
  const contents = await readFile(join(root, file), "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(contents)) {
      throw new Error(`Potential secret literal detected in ${file}`);
    }
  }
}

console.log("Static secret-literal scan passed.");
