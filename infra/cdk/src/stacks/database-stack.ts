import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as kms from "aws-cdk-lib/aws-kms";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { EnvironmentConfig, stackEnvironment } from "../config.js";
import { NetworkStack } from "./network-stack.js";

export interface DatabaseStackProps {
  readonly config: EnvironmentConfig;
  readonly network: NetworkStack;
  readonly encryptionKey?: kms.IKey;
}

export class DatabaseStack extends Stack {
  public readonly databaseSecret: secretsmanager.ISecret;
  public readonly databaseInstance?: rds.DatabaseInstance;

  public constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, stackEnvironment(props.config));

    if (props.config.targetDatabaseMode === "managed-dummy") {
      const secret = new secretsmanager.Secret(this, "DummyDatabaseSecret", {
        description: "Generated only when the personal development dummy RDS is deployed.",
        generateSecretString: {
          secretStringTemplate: JSON.stringify({ username: "sql_patch_manager_executor" }),
          generateStringKey: "password",
          excludePunctuation: true,
          passwordLength: 32,
        },
        removalPolicy: RemovalPolicy.RETAIN,
      });
      this.databaseSecret = secret;

      this.databaseInstance = new rds.DatabaseInstance(this, "DummyPostgres", {
        engine: rds.DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.of(
            props.config.rdsEngineVersion,
            props.config.rdsEngineVersion.split(".")[0] ?? props.config.rdsEngineVersion,
          ),
        }),
        credentials: rds.Credentials.fromSecret(secret, "sql_patch_manager_executor"),
        databaseName: "sql_patch_manager_dev",
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
        allocatedStorage: 20,
        maxAllocatedStorage: 50,
        storageType: rds.StorageType.GP3,
        storageEncrypted: true,
        storageEncryptionKey: props.encryptionKey,
        vpc: props.network.vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [props.network.rdsSecurityGroup],
        publiclyAccessible: false,
        port: 5432,
        backupRetention: Duration.days(props.config.backupRetentionDays),
        deletionProtection: false,
        removalPolicy: RemovalPolicy.RETAIN,
        autoMinorVersionUpgrade: false,
        cloudwatchLogsExports: [],
      });

      NagSuppressions.addResourceSuppressions(this.databaseInstance, [
        { id: "AwsSolutions-RDS3", reason: "The managed dummy RDS is a low-cost personal development target; production Multi-AZ is a separate deployment decision." },
        { id: "AwsSolutions-RDS10", reason: "The personal development dummy RDS is disposable by explicit operator action; production deletion protection is required in the production configuration." },
        { id: "AwsSolutions-RDS11", reason: "PostgreSQL uses the standard port required by the documented CodeBuild-to-RDS security-group contract; network access is restricted to the CodeBuild security group." },
      ]);
      NagSuppressions.addResourceSuppressions(secret, [
        { id: "AwsSolutions-SMG4", reason: "This secret belongs only to the optional personal development dummy RDS. External test/prod secrets require rotation policy before deployment." },
      ]);
    } else {
      // External RDS ownership is intentionally represented by a stable name
      // reference. The actual ARN and secret value are supplied only in a
      // future deployment environment, never through source or CDK context.
      this.databaseSecret = secretsmanager.Secret.fromSecretNameV2(
        this,
        "ExternalDatabaseSecret",
        props.config.databaseSecretName,
      );
    }

    this.node.addMetadata("DatabaseOwnership", props.config.targetDatabaseMode);
    this.node.addMetadata("PublicAccess", "disabled");
  }
}
