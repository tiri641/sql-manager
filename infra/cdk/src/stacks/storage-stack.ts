import { Annotations, CfnParameter, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as kms from "aws-cdk-lib/aws-kms";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { EnvironmentConfig, stackEnvironment } from "../config.js";

export interface StorageStackProps {
  readonly config: EnvironmentConfig;
}

export class StorageStack extends Stack {
  public readonly accessLogBucket: s3.Bucket;
  public readonly uiBucket: s3.Bucket;
  public readonly sqlBucket: s3.Bucket;
  public readonly logBucket: s3.Bucket;
  public readonly encryptionKey?: kms.Key;

  public constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, stackEnvironment(props.config));

    if (props.config.encryptionMode === "sse-kms") {
      this.encryptionKey = new kms.Key(this, "DataKey", {
        enableKeyRotation: true,
        description: `SQL Patch Manager ${props.config.name} data encryption key`,
        pendingWindow: Duration.days(7),
        removalPolicy: RemovalPolicy.RETAIN,
      });
      this.encryptionKey.addAlias(`alias/sql-patch-manager-${props.config.name}`);
    }

    this.accessLogBucket = new s3.Bucket(this, "AccessLogBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      // CloudFront standard access-log delivery is kept on SSE-S3. This
      // bucket contains request metadata only; SQL and execution output use
      // the dedicated encrypted SQL/Log buckets below.
      encryption: s3.BucketEncryption.S3_MANAGED,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      lifecycleRules: [{ id: "access-log-retention", expiration: Duration.days(configuredAccessLogRetentionDays(props.config)) }],
    });

    this.uiBucket = this.createBucket("UiBucket", "ui", props.config);
    this.sqlBucket = this.createBucket("SqlBucket", "sql", props.config);
    this.logBucket = this.createBucket("LogBucket", "logs", props.config);

    const certificateArn = new CfnParameter(this, "UiCertificateArn", {
      type: "String",
      description: "ACM certificate ARN in us-east-1 required for a future CloudFront deployment.",
    });
    certificateArn.overrideLogicalId("UiCertificateArn");
    const domainName = new CfnParameter(this, "UiDomainName", {
      type: "String",
      description: "CloudFront alternate domain name covered by UiCertificateArn.",
      allowedPattern: "^[a-zA-Z0-9.-]+$",
      constraintDescription: "Provide a DNS name without a scheme, path, or wildcard.",
    });
    domainName.overrideLogicalId("UiDomainName");

    const distribution = new cloudfront.Distribution(this, "UiDistribution", {
      domainNames: [domainName.valueAsString],
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.uiBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      enableLogging: true,
      logBucket: this.accessLogBucket,
      logFilePrefix: `cloudfront/${props.config.name}/`,
      certificate: acm.Certificate.fromCertificateArn(this, "UiCertificate", certificateArn.valueAsString),
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.minutes(5) },
      ],
    });

    // CDK intentionally uses a wildcard Distribution ID in the initial KMS
    // key policy to avoid a KMS key/bucket/distribution circular dependency.
    // The deploy runbook narrows it to the created Distribution ID afterwards.
    Annotations.of(this).acknowledgeWarning(
      "@aws-cdk/aws-cloudfront-origins:wildcardKeyPolicyForOac",
      "Accepted for the initial deployment only; narrow the KMS key policy to the CloudFront Distribution ID before production use.",
    );
    NagSuppressions.addResourceSuppressions(distribution, [
      {
        id: "AwsSolutions-CFR1",
        reason: "The UI is an internal static frontend; geographic access policy is an organization deployment decision and must be set before external exposure.",
      },
      {
        id: "AwsSolutions-CFR2",
        reason: "The UI distribution serves static assets only and the API is separately protected by API Gateway and Cognito; WAF is a required gate before external exposure.",
      },
    ], true);
    distribution.node.addMetadata("SecurityBoundary", "CloudFront OAC is the only UI bucket reader.");
  }

  private createBucket(id: string, purpose: string, config: EnvironmentConfig): s3.Bucket {
    const bucket = new s3.Bucket(this, id, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      encryption: this.encryptionKey ? s3.BucketEncryption.KMS : s3.BucketEncryption.S3_MANAGED,
      encryptionKey: this.encryptionKey,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      serverAccessLogsBucket: this.accessLogBucket,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      lifecycleRules: [
        {
          id: `${purpose}-noncurrent-retention`,
          noncurrentVersionExpiration: Duration.days(config.logRetentionDays),
          abortIncompleteMultipartUploadAfter: Duration.days(7),
          ...(purpose === "logs" ? { expiration: Duration.days(config.logRetentionDays) } : {}),
        },
      ],
    });

    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "DenyInsecureTransport",
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:*"] ,
        resources: [bucket.bucketArn, bucket.arnForObjects("*")],
        conditions: { Bool: { "aws:SecureTransport": "false" } },
      }),
    );

    bucket.node.addMetadata("DataClassification", purpose === "ui" ? "static-ui" : "confidential");
    return bucket;
  }
}

function configuredAccessLogRetentionDays(config: EnvironmentConfig): number {
  return Math.max(30, Math.min(config.logRetentionDays, 365));
}
