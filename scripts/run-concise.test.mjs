import assert from "node:assert/strict";
import test from "node:test";

import { formatOutput, redactText, summarizeText } from "./run-concise.mjs";

test("redacts common credential patterns", () => {
  const result = redactText("Authorization: Bearer abc.def\npassword=secret-value\n{\"AWS_SECRET_ACCESS_KEY\":\"json-secret\"}\nAWS_SECRET_ACCESS_KEY=env-secret\npostgresql://user:pass@example");
  assert.doesNotMatch(result, /abc\.def|secret-value|json-secret|env-secret|user:pass/);
  assert.match(result, /REDACTED/);
});

test("limits output by lines and bytes", () => {
  const result = summarizeText("one\ntwo\nthree\nfour\n", { maxLines: 2, maxBytes: 100 });
  assert.equal(result.truncated, true);
  assert.equal(result.text, "one\ntwo");
});

test("limits output by bytes without returning a partial UTF-8 character", () => {
  const result = summarizeText("あいうえお", { maxLines: 10, maxBytes: 7 });
  assert.equal(result.truncated, true);
  assert.equal(result.text, "あい");
});

test("keeps the truncation marker within the total output budget", () => {
  const result = formatOutput("one\ntwo\nthree\n", { maxLines: 2, maxBytes: 20 });
  assert.ok(Buffer.byteLength(result, "utf8") <= 20);
  assert.match(result, /output-truncated/);
});
