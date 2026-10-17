import { Duration, Stack } from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { EnvironmentConfig, stackEnvironment } from "../config.js";
import { ControlPlaneStack } from "./control-plane-stack.js";
import { DatabaseStack } from "./database-stack.js";
import { NetworkStack } from "./network-stack.js";
import { StorageStack } from "./storage-stack.js";

export interface ExecutionStackProps {
  readonly config: EnvironmentConfig;
  readonly network: NetworkStack;
  readonly storage: StorageStack;
  readonly database: DatabaseStack;
  readonly controlPlane: ControlPlaneStack;
}

export class ExecutionStack extends Stack {
  public readonly project: codebuild.Project;
  public readonly buildRole: iam.Role;
  public readonly dispatcherRole: iam.Role;

  public constructor(scope: Construct, id: string, props: ExecutionStackProps) {
    super(scope, id, stackEnvironment(props.config));

    this.buildRole = new iam.Role(this, "CodeBuildExecutionRole", {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
      description: `Least-privilege SQL executor role for ${props.config.name}`,
    });
    this.addVpcNetworkInterfacePermissions(this.buildRole, props.network.vpc);
    this.addStoragePermissions(this.buildRole, props.storage, props.config.name);
    props.database.databaseSecret.grantRead(this.buildRole);
    props.storage.encryptionKey?.grantEncryptDecrypt(this.buildRole);
    this.addExecutionTablePermissions(this.buildRole, props.controlPlane.stateTable);

    this.project = new codebuild.Project(this, "SqlExecutorProject", {
      source: codebuild.Source.s3({
        bucket: props.storage.sqlBucket,
        path: "phase2-placeholder.zip",
      }),
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          build: {
            commands: [
              'echo "SQL execution is disabled in Phase 2"',
              "exit 1",
            ],
          },
        },
      }),
      role: this.buildRole,
      artifacts: codebuild.Artifacts.s3({
        bucket: props.storage.logBucket,
        path: `artifacts/${props.config.name}`,
        includeBuildId: true,
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: false,
        environmentVariables: {
          ENVIRONMENT: { value: props.config.name, type: codebuild.BuildEnvironmentVariableType.PLAINTEXT },
          SQL_EXECUTION_ENABLED: { value: "false", type: codebuild.BuildEnvironmentVariableType.PLAINTEXT },
        },
      },
      vpc: props.network.vpc,
      subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.network.codeBuildSecurityGroup],
      timeout: Duration.minutes(props.config.codeBuildTimeoutMinutes),
      queuedTimeout: Duration.minutes(props.config.codeBuildQueuedTimeoutMinutes),
      concurrentBuildLimit: 1,
      autoRetryLimit: 0,
      logging: {
        cloudWatch: { enabled: false },
        s3: {
          enabled: true,
          bucket: props.storage.logBucket,
          prefix: `codebuild/${props.config.name}`,
          encrypted: true,
        },
      },
    });
    this.dispatcherRole = new iam.Role(this, "DispatcherRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: `Starts only the ${props.config.name} SQL executor project`,
    });
    this.dispatcherRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["codebuild:StartBuild"],
        resources: [this.project.projectArn],
      }),
    );

    NagSuppressions.addResourceSuppressions(this.buildRole, [
      {
        id: "AwsSolutions-IAM5",
        appliesTo: [{ regex: "/.*/" }],
        reason: "AWS CodeBuild VPC ENI and service integration APIs require wildcard resource scopes; all data-plane S3, Secret, and DynamoDB resources remain explicitly scoped.",
      },
    ], true);
    NagSuppressions.addResourceSuppressions(this.project, [
      {
        id: "AwsSolutions-CB4",
        reason: "The personal learning profile uses SSE-S3 to avoid a customer-managed KMS key charge; production hardening can enable SSE-KMS through EnvironmentConfig.",
      },
      {
        id: "AwsSolutions-IAM5",
        appliesTo: [{ regex: "/.*/" }],
        reason: "The CodeBuild service integration generates required report/log resource patterns; project data access is restricted to the environment buckets and Secret.",
      },
    ], true);

    this.node.addMetadata("RetryPolicy", "CodeBuild auto retry is disabled; UNKNOWN is never auto-retried.");
    this.node.addMetadata("ExecutionMode", "Phase 2 fail-closed placeholder; SQL runner is Phase 3.");
  }

  private addStoragePermissions(role: iam.Role, storage: StorageStack, environment: string): void {
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:GetObjectVersion"],
        resources: [storage.sqlBucket.arnForObjects("*")],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject", "s3:AbortMultipartUpload"],
        resources: [storage.logBucket.arnForObjects(`codebuild/${environment}/*`)],
      }),
    );
  }

  private addExecutionTablePermissions(role: iam.Role, table: dynamodb.Table): void {
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:ConditionCheckItem", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"],
        resources: [table.tableArn],
      }),
    );
  }

  private addVpcNetworkInterfacePermissions(role: iam.Role, vpc: ec2.Vpc): void {
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ec2:CreateNetworkInterface", "ec2:DeleteNetworkInterface", "ec2:DescribeNetworkInterfaces"],
        resources: ["*"],
        conditions: { StringEquals: { "ec2:Vpc": vpc.vpcId } },
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ec2:DescribeSubnets", "ec2:DescribeSecurityGroups", "ec2:DescribeVpcs"],
        resources: ["*"],
      }),
    );
  }
}
