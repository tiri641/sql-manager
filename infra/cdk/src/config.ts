import { StackProps } from "aws-cdk-lib";

export const ENVIRONMENT_NAMES = ["dev", "test", "prod"] as const;
export type EnvironmentName = (typeof ENVIRONMENT_NAMES)[number];

export type TargetDatabaseMode = "managed-dummy" | "external";
export type EncryptionMode = "sse-s3" | "sse-kms";
export type CognitoFeaturePlan = "essentials" | "plus";

export interface EnvironmentConfig {
  readonly name: EnvironmentName;
  readonly region: string;
  readonly targetDatabaseMode: TargetDatabaseMode;
  readonly encryptionMode: EncryptionMode;
  readonly databaseSecretName: string;
  readonly rdsEngineVersion: string;
  readonly vpcCidr: string;
  readonly maxAzs: number;
  readonly enableVpcFlowLogs: boolean;
  readonly enableDynamoDbPitr: boolean;
  readonly lambdaRuntime: string;
  readonly cognitoFeaturePlan: CognitoFeaturePlan;
  readonly logRetentionDays: number;
  readonly backupRetentionDays: number;
  readonly codeBuildTimeoutMinutes: number;
  readonly codeBuildQueuedTimeoutMinutes: number;
  readonly monthlyBudgetUsd: number;
}

const BASE_CONFIG: Omit<EnvironmentConfig, "name" | "targetDatabaseMode" | "encryptionMode"> = {
  region: "ap-northeast-1",
  databaseSecretName: "sql-patch-manager/db-connection",
  rdsEngineVersion: "16.15",
  vpcCidr: "10.60.0.0/16",
  maxAzs: 1,
  enableVpcFlowLogs: false,
  enableDynamoDbPitr: false,
  lambdaRuntime: "nodejs24.x",
  logRetentionDays: 30,
  backupRetentionDays: 3,
  codeBuildTimeoutMinutes: 30,
  codeBuildQueuedTimeoutMinutes: 5,
  cognitoFeaturePlan: "essentials",
  monthlyBudgetUsd: 15,
};

export const ENVIRONMENT_CONFIGS: Readonly<Record<EnvironmentName, EnvironmentConfig>> = {
  dev: {
    ...BASE_CONFIG,
    name: "dev",
    targetDatabaseMode: "managed-dummy",
    encryptionMode: "sse-s3",
    databaseSecretName: "sql-patch-manager/dev/db-connection",
    monthlyBudgetUsd: 35,
  },
  test: {
    ...BASE_CONFIG,
    name: "test",
    targetDatabaseMode: "external",
    encryptionMode: "sse-s3",
    databaseSecretName: "sql-patch-manager/test/db-connection",
  },
  prod: {
    ...BASE_CONFIG,
    name: "prod",
    targetDatabaseMode: "external",
    encryptionMode: "sse-s3",
    databaseSecretName: "sql-patch-manager/prod/db-connection",
    codeBuildTimeoutMinutes: 15,
  },
};

export function buildEnvironmentConfig(value: string | undefined): EnvironmentConfig {
  const environment = value ?? "dev";
  if (!ENVIRONMENT_NAMES.includes(environment as EnvironmentName)) {
    throw new Error(`Unsupported environment: ${environment}`);
  }

  return ENVIRONMENT_CONFIGS[environment as EnvironmentName];
}

export function stackEnvironment(config: EnvironmentConfig): StackProps {
  // Account is deliberately not read from context. Deployment credentials and
  // account selection remain an explicit Phase 3+ operation.
  return { env: { region: config.region } };
}
