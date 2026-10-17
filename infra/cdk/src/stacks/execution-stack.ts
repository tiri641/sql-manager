import { Stack } from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
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
  public readonly project: codebuild.CfnProject;
  public readonly buildRole: iam.Role;
  public readonly dispatcherRole: iam.Role;

  public constructor(scope: Construct, id: string, props: ExecutionStackProps) {
    super(scope, id, stackEnvironment(props.config));

    this.buildRole = new iam.Role(this, "CodeBuildExecutionRole", {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
      description: `Least-privilege SQL executor role for ${props.config.name}`,
    });
    this.addVpcNetworkInterfacePermissions(this.buildRole, props.network.vpc);

    const buildSpec = codebuild.BuildSpec.fromObject({
      version: "0.2",
      phases: {
        build: {
          commands: [
            'echo "SQL execution is disabled in Phase 2"',
            "exit 1",
          ],
        },
      },
    }).toBuildSpec();

    // The CodeBuild L2 adds CloudWatch Logs permissions to the service role
    // even when both log destinations are disabled. Use the L1 resource so
    // Phase 2 cannot create a standard-log data path at all.
    this.project = new codebuild.CfnProject(this, "SqlExecutorProject", {
      artifacts: { type: "NO_ARTIFACTS" },
      autoRetryLimit: 0,
      concurrentBuildLimit: 1,
      description: `Fail-closed SQL executor placeholder for ${props.config.name}`,
      environment: {
        computeType: "BUILD_GENERAL1_SMALL",
        image: "aws/codebuild/standard:7.0",
        type: "LINUX_CONTAINER",
        privilegedMode: false,
        environmentVariables: [
          { name: "ENVIRONMENT", value: props.config.name, type: "PLAINTEXT" },
          { name: "SQL_EXECUTION_ENABLED", value: "false", type: "PLAINTEXT" },
        ],
      },
      logsConfig: {
        cloudWatchLogs: { status: "DISABLED" },
        s3Logs: { status: "DISABLED" },
      },
      queuedTimeoutInMinutes: props.config.codeBuildQueuedTimeoutMinutes,
      serviceRole: this.buildRole.roleArn,
      source: { type: "NO_SOURCE", buildSpec },
      timeoutInMinutes: props.config.codeBuildTimeoutMinutes,
      vpcConfig: {
        vpcId: props.network.vpc.vpcId,
        subnets: props.network.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
        securityGroupIds: [props.network.codeBuildSecurityGroup.securityGroupId],
      },
    });
    this.dispatcherRole = new iam.Role(this, "DispatcherRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: `Starts only the ${props.config.name} SQL executor project`,
    });
    this.dispatcherRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["codebuild:StartBuild"],
        resources: [this.project.attrArn],
      }),
    );

    NagSuppressions.addResourceSuppressions(this.buildRole, [
      {
        id: "AwsSolutions-IAM5",
        appliesTo: [
          "Resource::*",
          `Resource::arn:<AWS::Partition>:ec2:${props.config.region}:<AWS::AccountId>:network-interface/*`,
        ],
        reason: "Phase 2 only grants CodeBuild VPC/service-integration permissions. The wildcard is required by AWS APIs and no SQL, Log S3, DynamoDB, or Secret data-plane permission is attached.",
      },
    ], true);
    const executionSuppressions: Array<{ id: string; reason: string; appliesTo?: string[] }> = [];
    if (props.config.encryptionMode === "sse-s3") {
      executionSuppressions.push({
        id: "AwsSolutions-CB4",
        reason: "The personal learning profile uses SSE-S3 to avoid a customer-managed KMS key charge; production hardening can enable SSE-KMS through EnvironmentConfig.",
      });
    }
    NagSuppressions.addResourceSuppressions(this.project, executionSuppressions, true);

    this.node.addMetadata("RetryPolicy", "CodeBuild auto retry is disabled; UNKNOWN is never auto-retried.");
    this.node.addMetadata("ExecutionMode", "Phase 2 fail-closed placeholder; SQL runner is Phase 3.");
  }

  private addVpcNetworkInterfacePermissions(role: iam.Role, vpc: ec2.Vpc): void {
    const isolatedSubnetArns = vpc
      .selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED })
      .subnetIds
      .map((subnetId) => this.formatArn({ service: "ec2", resource: "subnet", resourceName: subnetId }));

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeDhcpOptions",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeVpcs",
        ],
        resources: ["*"],
        conditions: { StringEquals: { "ec2:Vpc": vpc.vpcId } },
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ec2:CreateNetworkInterfacePermission"],
        resources: [this.formatArn({ service: "ec2", resource: "network-interface", resourceName: "*" })],
        conditions: {
          StringEquals: { "ec2:AuthorizedService": "codebuild.amazonaws.com" },
          ArnEquals: { "ec2:Subnet": isolatedSubnetArns },
        },
      }),
    );
  }
}
