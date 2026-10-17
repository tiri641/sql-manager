#!/usr/bin/env node
import { App } from "aws-cdk-lib";

import { buildEnvironmentConfig } from "./config.js";
import { applyNagChecks } from "./nag.js";
import { ControlPlaneStack } from "./stacks/control-plane-stack.js";
import { DatabaseStack } from "./stacks/database-stack.js";
import { ExecutionStack } from "./stacks/execution-stack.js";
import { BudgetStack } from "./stacks/budget-stack.js";
import { NetworkStack } from "./stacks/network-stack.js";
import { StorageStack } from "./stacks/storage-stack.js";

const app = new App();
const environment = app.node.tryGetContext("environment") as string | undefined;
const config = buildEnvironmentConfig(environment);

const network = new NetworkStack(app, `${config.name}-Network`, { config });
const storage = new StorageStack(app, `${config.name}-Storage`, { config });
const database = new DatabaseStack(app, `${config.name}-Database`, {
  config,
  network,
  encryptionKey: storage.encryptionKey,
});
const controlPlane = new ControlPlaneStack(app, `${config.name}-ControlPlane`, {
  config,
  storage,
});
new ExecutionStack(app, `${config.name}-Execution`, {
  config,
  network,
  storage,
  database,
  controlPlane,
});
new BudgetStack(app, `${config.name}-Budget`, { config });

if (app.node.tryGetContext("runNag") === true || app.node.tryGetContext("runNag") === "true") {
  applyNagChecks(app);
}

app.synth();
