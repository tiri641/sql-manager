import assert from "node:assert/strict";
import test from "node:test";

import { handler } from "../src/handler.js";

test("Phase 2 Lambda skeleton does not process SQL or secrets", async () => {
  const response = await handler();

  assert.equal(response.statusCode, 501);
  assert.match(response.body, /NOT_IMPLEMENTED/);
  assert.doesNotMatch(response.body, /password|secret|sql/i);
});
