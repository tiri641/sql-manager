import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function readGitState(root) {
  try {
    const { stdout: head } = await execFileAsync("git", ["-C", root, "rev-parse", "HEAD"], { maxBuffer: 1024 * 1024 });
    const { stdout: status } = await execFileAsync("git", ["-C", root, "status", "--porcelain=v1", "--untracked-files=all"], { maxBuffer: 1024 * 1024 });
    const lines = status.split("\n").filter(Boolean);
    return { head: head.trim(), dirty: lines.length > 0, untracked: lines.some((line) => line.startsWith("?? ")) };
  } catch {
    return null;
  }
}
