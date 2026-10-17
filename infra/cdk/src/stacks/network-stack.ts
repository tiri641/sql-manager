import { Duration, Stack } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as logs from "aws-cdk-lib/aws-logs";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { EnvironmentConfig, stackEnvironment } from "../config.js";

export interface NetworkStackProps {
  readonly config: EnvironmentConfig;
}

export class NetworkStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly rdsSecurityGroup: ec2.SecurityGroup;
  public readonly codeBuildSecurityGroup: ec2.SecurityGroup;
  public readonly endpointSecurityGroup: ec2.SecurityGroup;

  public constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, stackEnvironment(props.config));

    this.vpc = new ec2.Vpc(this, "ExecutionVpc", {
      ipAddresses: ec2.IpAddresses.cidr(props.config.vpcCidr),
      maxAzs: props.config.maxAzs,
      natGateways: 0,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          name: "private-isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });
    if (props.config.enableVpcFlowLogs) {
      const flowLogGroup = new logs.LogGroup(this, "VpcFlowLogGroup", {
        retention: logs.RetentionDays.ONE_MONTH,
      });
      this.vpc.addFlowLog("VpcFlowLog", {
        trafficType: ec2.FlowLogTrafficType.ALL,
        destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
      });
    }
    if (!props.config.enableVpcFlowLogs) {
      NagSuppressions.addResourceSuppressions(this.vpc.node.defaultChild as ec2.CfnVPC, [
        {
          id: "AwsSolutions-VPC7",
          reason: "The personal learning profile disables VPC Flow Logs to avoid CloudWatch ingestion and retention cost; company deployment must enable them through EnvironmentConfig before real data use.",
        },
      ], true);
    }

    this.rdsSecurityGroup = new ec2.SecurityGroup(this, "RdsSecurityGroup", {
      vpc: this.vpc,
      description: "Only the environment CodeBuild security group may reach PostgreSQL.",
      allowAllOutbound: false,
    });
    this.codeBuildSecurityGroup = new ec2.SecurityGroup(this, "CodeBuildSecurityGroup", {
      vpc: this.vpc,
      description: "VPC build ENI for the environment SQL executor.",
      allowAllOutbound: false,
    });
    this.endpointSecurityGroup = new ec2.SecurityGroup(this, "EndpointSecurityGroup", {
      vpc: this.vpc,
      description: "Private interface endpoint ingress from CodeBuild.",
      allowAllOutbound: false,
    });

    this.rdsSecurityGroup.addIngressRule(
      this.codeBuildSecurityGroup,
      ec2.Port.tcp(5432),
      "CodeBuild executor to PostgreSQL only",
    );
    this.codeBuildSecurityGroup.addEgressRule(
      this.rdsSecurityGroup,
      ec2.Port.tcp(5432),
      "PostgreSQL execution connection",
    );
    this.codeBuildSecurityGroup.addEgressRule(
      this.endpointSecurityGroup,
      ec2.Port.tcp(443),
      "Secrets Manager interface endpoint",
    );
    this.endpointSecurityGroup.addIngressRule(
      this.codeBuildSecurityGroup,
      ec2.Port.tcp(443),
      "CodeBuild to Secrets Manager interface endpoint",
    );
    NagSuppressions.addResourceSuppressions(this.endpointSecurityGroup, [
      {
        id: "CdkNagValidationFailure",
        appliesTo: ["AwsSolutions-EC23"],
        reason: "The endpoint Security Group is intentionally non-egress; cdk-nag cannot resolve the VPC CIDR token emitted by the CDK-managed endpoint resource. CodeBuild initiates the only HTTPS flow and no internet route exists.",
      },
    ]);

    this.vpc.addGatewayEndpoint("S3GatewayEndpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
    });
    this.vpc.addGatewayEndpoint("DynamoDbGatewayEndpoint", {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
    });
    this.vpc.addInterfaceEndpoint("SecretsManagerInterfaceEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      privateDnsEnabled: true,
      securityGroups: [this.endpointSecurityGroup],
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    // Keep the connection boundary explicit without introducing an internet
    // route or NAT dependency into the execution subnet.
    this.codeBuildSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(props.config.vpcCidr),
      ec2.Port.udp(53),
      "VPC DNS resolution",
    );
    this.codeBuildSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(props.config.vpcCidr),
      ec2.Port.tcp(53),
      "VPC DNS TCP fallback",
    );

    this.addMetadata("DesignNote", {
      natGateway: "not-adopted",
      publicSubnets: "not-adopted",
      codeBuildTimeout: Duration.minutes(props.config.codeBuildTimeoutMinutes).toSeconds(),
    });
  }
}
