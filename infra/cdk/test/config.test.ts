import assert from "node:assert/strict";
import test from "node:test";

import { buildEnvironmentConfig } from "../src/config.js";

test("dev uses a managed dummy database and SSE-S3", () => {
  const config = buildEnvironmentConfig("dev");

  assert.equal(config.targetDatabaseMode, "managed-dummy");
  assert.equal(config.encryptionMode, "sse-s3");
  assert.equal(config.name, "dev");
});

test("all environments use low-cost learning defaults", () => {
  for (const environment of ["test", "prod"] as const) {
    const config = buildEnvironmentConfig(environment);
    assert.equal(config.targetDatabaseMode, "external");
    assert.equal(config.encryptionMode, "sse-s3");
    assert.equal(config.maxAzs, 1);
    assert.equal(config.enableVpcFlowLogs, false);
    assert.equal(config.enableDynamoDbPitr, false);
    assert.equal(config.cognitoFeaturePlan, "essentials");
  }
});

test("dev budget accounts for the optional always-on dummy RDS", () => {
  assert.equal(buildEnvironmentConfig("dev").monthlyBudgetUsd, 35);
  assert.equal(buildEnvironmentConfig("test").monthlyBudgetUsd, 15);
  assert.equal(buildEnvironmentConfig("prod").monthlyBudgetUsd, 15);
});

test("unknown environments fail closed", () => {
  assert.throws(() => buildEnvironmentConfig("production"));
});
