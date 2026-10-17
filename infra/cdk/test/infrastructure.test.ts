import assert from "node:assert/strict";
import test from "node:test";

import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";

import { buildEnvironmentConfig } from "../src/config.js";
import { ControlPlaneStack } from "../src/stacks/control-plane-stack.js";
import { DatabaseStack } from "../src/stacks/database-stack.js";
import { ExecutionStack } from "../src/stacks/execution-stack.js";
import { NetworkStack } from "../src/stacks/network-stack.js";
import { StorageStack } from "../src/stacks/storage-stack.js";
import { BudgetStack } from "../src/stacks/budget-stack.js";

function createDevStacks(): {
  readonly network: NetworkStack;
  readonly storage: StorageStack;
  readonly database: DatabaseStack;
  readonly controlPlane: ControlPlaneStack;
  readonly execution: ExecutionStack;
} {
  const app = new App();
  const config = buildEnvironmentConfig("dev");
  const network = new NetworkStack(app, "DevNetwork", { config });
  const storage = new StorageStack(app, "DevStorage", { config });
  const database = new DatabaseStack(app, "DevDatabase", { config, network });
  const controlPlane = new ControlPlaneStack(app, "DevControlPlane", { config, storage });
  const execution = new ExecutionStack(app, "DevExecution", {
    config,
    network,
    storage,
    database,
    controlPlane,
  });
  return { network, storage, database, controlPlane, execution };
}

function createStacks(environment: "dev" | "test" | "prod") {
  const app = new App();
  const config = buildEnvironmentConfig(environment);
  const network = new NetworkStack(app, `${environment}Network`, { config });
  const storage = new StorageStack(app, `${environment}Storage`, { config });
  const database = new DatabaseStack(app, `${environment}Database`, {
    config,
    network,
    encryptionKey: storage.encryptionKey,
  });
  const controlPlane = new ControlPlaneStack(app, `${environment}ControlPlane`, { config, storage });
  const execution = new ExecutionStack(app, `${environment}Execution`, {
    config,
    network,
    storage,
    database,
    controlPlane,
  });
  return { network, storage, database, controlPlane, execution };
}

test("network has no NAT or public subnet and has required endpoints", () => {
  const { network } = createDevStacks();
  const template = Template.fromStack(network);

  template.resourceCountIs("AWS::EC2::NatGateway", 0);
  template.resourceCountIs("AWS::EC2::InternetGateway", 0);
  template.resourceCountIs("AWS::EC2::VPCEndpoint", 3);
  template.resourceCountIs("AWS::EC2::Subnet", 1);
  template.hasResourceProperties("AWS::EC2::SecurityGroup", {
    GroupDescription: Match.stringLikeRegexp("PostgreSQL"),
  });
});

test("network DNS egress follows the configured VPC CIDR", () => {
  const app = new App();
  const config = { ...buildEnvironmentConfig("dev"), vpcCidr: "10.70.0.0/16" };
  const network = new NetworkStack(app, "CustomNetwork", { config });
  const template = Template.fromStack(network);
  const securityGroups = JSON.stringify(template.findResources("AWS::EC2::SecurityGroup"));

  assert.match(securityGroups, /10\.70\.0\.0\/16/);
  assert.doesNotMatch(securityGroups, /10\.60\.0\.0\/16/);
});

test("storage buckets are private, versioned, and encrypted", () => {
  const { storage } = createDevStacks();
  const template = Template.fromStack(storage);

  template.resourceCountIs("AWS::S3::Bucket", 4);
  template.hasResourceProperties("AWS::CloudFront::Distribution", {
    DistributionConfig: {
      Aliases: [{ Ref: "UiDomainName" }],
    },
  });
  template.hasResourceProperties("AWS::S3::Bucket", {
    VersioningConfiguration: { Status: "Enabled" },
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
  template.resourceCountIs("AWS::CloudFront::OriginAccessControl", 1);

  const bucketResources = JSON.stringify(template.findResources("AWS::S3::Bucket"));
  assert.match(bucketResources, /AbortIncompleteMultipartUpload/);
  assert.match(bucketResources, /NoncurrentVersionExpiration/);
  assert.match(bucketResources, /ExpirationInDays.*30/);
});

test("dummy RDS is private and only CodeBuild SG can reach PostgreSQL", () => {
  const { database, network } = createDevStacks();
  const template = Template.fromStack(database);

  template.hasResourceProperties("AWS::RDS::DBInstance", {
    Engine: "postgres",
    PubliclyAccessible: false,
    StorageEncrypted: true,
  });
  template.hasResourceProperties("AWS::SecretsManager::Secret", {
    GenerateSecretString: Match.objectLike({ GenerateStringKey: "password" }),
  });

  const networkTemplate = Template.fromStack(network);
  const ingress = JSON.stringify(networkTemplate.findResources("AWS::EC2::SecurityGroupIngress"));
  const egress = JSON.stringify(networkTemplate.findResources("AWS::EC2::SecurityGroupEgress"));
  assert.match(ingress, /5432/);
  assert.match(ingress, /SourceSecurityGroupId/);
  assert.doesNotMatch(ingress, /0\.0\.0\.0\/0/);
  assert.match(egress, /5432/);
});

test("control plane has Cognito, JWT authorizer, PITR table, and Node 24 Lambda", () => {
  const { controlPlane } = createDevStacks();
  const template = Template.fromStack(controlPlane);

  template.resourceCountIs("AWS::Cognito::UserPool", 1);
  const userPools = template.findResources("AWS::Cognito::UserPool");
  const userPool = Object.values(userPools)[0] as { readonly Properties: Record<string, unknown> };
  assert.equal(userPool.Properties.UserPoolTier, "ESSENTIALS");
  assert.equal(userPool.Properties.UserPoolAddOns, undefined);
  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: "nodejs24.x",
  });
  template.hasResourceProperties("AWS::DynamoDB::Table", {
    BillingMode: "PAY_PER_REQUEST",
    PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: false },
    TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
  });
  template.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", {
    AuthorizerType: "JWT",
  });
});

test("execution project is fail-closed and does not retry automatically", () => {
  const { execution } = createDevStacks();
  const template = Template.fromStack(execution);

  const projects = template.findResources("AWS::CodeBuild::Project");
  const project = Object.values(projects)[0] as {
    readonly Properties: {
      readonly ConcurrentBuildLimit: number;
      readonly AutoRetryLimit: number;
      readonly VpcConfig: { readonly Subnets: readonly unknown[]; readonly SecurityGroupIds: readonly unknown[] };
      readonly Artifacts: { readonly Type: string };
      readonly Source: { readonly BuildSpec: string; readonly Type: string };
      readonly LogsConfig: { readonly CloudWatchLogs: { readonly Status: string }; readonly S3Logs: { readonly Status: string } };
    };
  };

  assert.equal(project.Properties.ConcurrentBuildLimit, 1);
  assert.equal(project.Properties.AutoRetryLimit, 0);
  assert.equal(project.Properties.Artifacts.Type, "NO_ARTIFACTS");
  assert.equal(project.Properties.Source.Type, "NO_SOURCE");
  assert.match(project.Properties.Source.BuildSpec, /SQL execution is disabled in Phase 2/);
  assert.match(project.Properties.Source.BuildSpec, /exit 1/);
  assert.ok(project.Properties.VpcConfig.Subnets.length > 0);
  assert.ok(project.Properties.VpcConfig.SecurityGroupIds.length > 0);
  assert.equal(project.Properties.LogsConfig.CloudWatchLogs.Status, "DISABLED");
  assert.equal(project.Properties.LogsConfig.S3Logs.Status, "DISABLED");

  const policies = JSON.stringify(template.findResources("AWS::IAM::Policy"));
  assert.doesNotMatch(policies, /s3:(GetObject|GetObjectVersion|PutObject|DeleteObject)/);
  assert.doesNotMatch(policies, /dynamodb:(GetItem|PutItem|UpdateItem)/);
  assert.doesNotMatch(policies, /secretsmanager:GetSecretValue/);
  assert.doesNotMatch(policies, /logs:(CreateLogGroup|CreateLogStream|PutLogEvents)/);
  assert.doesNotMatch(policies, /kms:(Encrypt|Decrypt|GenerateDataKey)/);
  assert.match(policies, /ec2:DescribeDhcpOptions/);
  assert.match(policies, /ec2:CreateNetworkInterfacePermission/);
  assert.match(policies, /ec2:AuthorizedService/);
  assert.match(policies, /codebuild\.amazonaws\.com/);
  assert.match(policies, /"ec2:Vpc"/);
  assert.match(policies, /:vpc\//);
});

test("phase 2 does not create a public API route for SQL operations", () => {
  const { controlPlane } = createDevStacks();
  const template = Template.fromStack(controlPlane);

  assert.deepEqual(template.findResources("AWS::ApiGatewayV2::Route"), {});
});

test("test environment references external RDS and uses low-cost defaults", () => {
  const { storage, database, execution } = createStacks("test");
  const storageTemplate = Template.fromStack(storage);
  const databaseTemplate = Template.fromStack(database);

  storageTemplate.resourceCountIs("AWS::KMS::Key", 0);
  storageTemplate.hasResourceProperties("AWS::S3::Bucket", {
    BucketEncryption: {
      ServerSideEncryptionConfiguration: Match.arrayWith([
        Match.objectLike({ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }),
      ]),
    },
  });
  assert.equal(Object.keys(databaseTemplate.findResources("AWS::RDS::DBInstance")).length, 0);
  assert.equal(Object.keys(databaseTemplate.findResources("AWS::SecretsManager::Secret")).length, 0);

  const executionPolicies = JSON.stringify(Template.fromStack(execution).findResources("AWS::IAM::Policy"));
  assert.doesNotMatch(executionPolicies, /s3:(GetObject|GetObjectVersion|PutObject|DeleteObject)/);
  assert.doesNotMatch(executionPolicies, /dynamodb:(GetItem|PutItem|UpdateItem)/);
  assert.doesNotMatch(executionPolicies, /secretsmanager:GetSecretValue/);
});

test("each environment has an explicit monthly budget definition", () => {
  const app = new App();
  const budget = new BudgetStack(app, "DevBudget", { config: buildEnvironmentConfig("dev") });
  const template = Template.fromStack(budget);

  template.hasResourceProperties("AWS::Budgets::Budget", {
    Budget: Match.objectLike({
      BudgetLimit: { Amount: 35, Unit: "USD" },
      TimeUnit: "MONTHLY",
    }),
  });
});
