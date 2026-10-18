import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { constants as osConstants } from "node:os";
import { resolve } from "node:path";

export const DEFAULT_MAX_LINES = 80;
export const DEFAULT_MAX_BYTES = 12000;

export function redactText(value) {
  return String(value)
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, "gh[REDACTED]")
    .replace(/(AKIA|ASIA)[A-Z0-9]{16}/g, "$1[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi, "$1[REDACTED]")
    .replace(/((?:["']?(?:password|secret|token|api[_-]?key|AWS_[A-Z0-9_]+)["']?)\s*:\s*)("[^"]*"|'[^']*'|[^,}\s]+)/gi, "$1[REDACTED]")
    .replace(/((?:AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|GITHUB_TOKEN)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi, "$1[REDACTED]")
    .replace(/((?:password|secret|token|api[_-]?key)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s]+)/gi, "$1[REDACTED]");
}

export function signalExitCode(signal) {
  const number = osConstants.signals?.[signal];
  return number ? 128 + number : 1;
}

function truncateUtf8(value, maxBytes) {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.length <= maxBytes) return { text: value, truncated: false };
  return { text: buffer.subarray(0, maxBytes).toString("utf8").replace(/�+$/u, ""), truncated: true };
}

export function summarizeText(value, { maxLines = DEFAULT_MAX_LINES, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const redacted = redactText(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = redacted.split("\n");
  const lineLimited = lines.length > maxLines ? lines.slice(0, maxLines).join("\n") : redacted.replace(/\n$/u, "");
  const lineTruncated = lines.length > maxLines;
  const byteLimited = truncateUtf8(lineLimited, maxBytes);
  return { text: byteLimited.text, truncated: lineTruncated || byteLimited.truncated };
}

export function formatOutput(value, options = {}) {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const initial = summarizeText(value, { maxLines, maxBytes });
  if (!initial.truncated) return initial.text;
  const marker = "[output-truncated]";
  const markerBytes = Buffer.byteLength(marker, "utf8");
  if (maxLines <= 1) return truncateUtf8(marker, maxBytes).text;
  const bodyBytes = Math.max(1, maxBytes - markerBytes - 1);
  const bodyLines = maxLines - 1;
  const body = summarizeText(value, { maxLines: bodyLines, maxBytes: bodyBytes }).text;
  const combined = `${body}\n${marker}`;
  return Buffer.byteLength(combined, "utf8") <= maxBytes ? combined : truncateUtf8(marker, maxBytes).text;
}

function parseArgs(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0) return null;
  const options = { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES };
  for (let index = 0; index < separator; index += 1) {
    if (argv[index] === "--max-lines") options.maxLines = Number(argv[++index]);
    else if (argv[index] === "--max-bytes") options.maxBytes = Number(argv[++index]);
    else return null;
  }
  if (!Number.isInteger(options.maxLines) || options.maxLines < 1 || options.maxLines > DEFAULT_MAX_LINES || !Number.isInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > DEFAULT_MAX_BYTES) return null;
  const command = argv[separator + 1];
  if (!command) return null;
  return { ...options, command, commandArgs: argv.slice(separator + 2) };
}

function usage() {
  console.error("Usage: node scripts/run-concise.mjs [--max-lines N] [--max-bytes N] -- <command> [args...]");
  process.exitCode = 2;
}

function collectLimited(stream, maxBytes) {
  let buffer = Buffer.alloc(0);
  let truncated = false;
  stream.on("data", (chunk) => {
    if (buffer.length >= maxBytes) {
      truncated = true;
      return;
    }
    const next = Buffer.concat([buffer, chunk]);
    if (next.length > maxBytes) truncated = true;
    buffer = next.subarray(0, maxBytes);
  });
  return () => ({ value: buffer.toString("utf8"), truncated });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options) return usage();
  const child = spawn(options.command, options.commandArgs, { stdio: ["inherit", "pipe", "pipe"], shell: false });
  const stdout = collectLimited(child.stdout, options.maxBytes);
  const stderr = collectLimited(child.stderr, options.maxBytes);
  const exitCode = await new Promise((resolveExit) => {
    child.on("close", (code, signal) => resolveExit({ code: code ?? signalExitCode(signal), signal }));
    child.on("error", (error) => {
      process.stderr.write(`command start failed: ${redactText(error.message)}\n`);
      resolveExit({ code: 1, signal: null });
    });
  });
  const stdoutResult = stdout();
  const stderrResult = stderr();
  const stdoutValue = stdoutResult.truncated ? "[stream output omitted after capture limit]" : stdoutResult.value;
  const stderrValue = stderrResult.truncated ? "[stream output omitted after capture limit]" : stderrResult.value;
  const combined = `[stdout]\n${stdoutValue}\n[stderr]\n${stderrValue}\n[exit=${exitCode.code}${exitCode.signal ? `, signal=${exitCode.signal}` : ""}]\n`;
  process.stdout.write(formatOutput(combined, options));
  process.exitCode = exitCode.code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
