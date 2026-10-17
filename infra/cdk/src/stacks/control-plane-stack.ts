import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { EnvironmentConfig, stackEnvironment } from "../config.js";
import { StorageStack } from "./storage-stack.js";

export interface ControlPlaneStackProps {
  readonly config: EnvironmentConfig;
  readonly storage: StorageStack;
}

export class ControlPlaneStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly api: apigwv2.HttpApi;
  public readonly stateTable: dynamodb.Table;
  public readonly apiHandler: lambda.Function;

  public constructor(scope: Construct, id: string, props: ControlPlaneStackProps) {
    super(scope, id, stackEnvironment(props.config));

    this.userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: { sms: false, otp: true },
      passwordPolicy: {
        minLength: 14,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      featurePlan: props.config.cognitoFeaturePlan === "plus"
        ? cognito.FeaturePlan.PLUS
        : cognito.FeaturePlan.ESSENTIALS,
      ...(props.config.cognitoFeaturePlan === "plus"
        ? { standardThreatProtectionMode: cognito.StandardThreatProtectionMode.FULL_FUNCTION }
        : {}),
      removalPolicy: RemovalPolicy.RETAIN,
    });
    if (props.config.cognitoFeaturePlan === "essentials") {
      NagSuppressions.addResourceSuppressions(this.userPool.node.defaultChild as cognito.CfnUserPool, [
        {
          id: "AwsSolutions-COG3",
          reason: "The personal learning profile uses Cognito Essentials to avoid Plus MAU cost; company deployment must enable Cognito Plus Threat Protection before real data use.",
        },
      ]);
    }
    this.userPoolClient = this.userPool.addClient("WebClient", {
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.minutes(60),
      idTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(30),
    });

    this.stateTable = new dynamodb.Table(this, "StateTable", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.config.enableDynamoDbPitr },
      timeToLiveAttribute: "ttl",
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    if (!props.config.enableDynamoDbPitr) {
      NagSuppressions.addResourceSuppressions(this.stateTable.node.defaultChild as dynamodb.CfnTable, [
        {
          id: "AwsSolutions-DDB3",
          reason: "The personal learning profile disables DynamoDB PITR to avoid continuous backup cost; company deployment must enable PITR through EnvironmentConfig before real data use.",
        },
      ]);
    }

    for (let index = 1; index <= 6; index += 1) {
      this.stateTable.addGlobalSecondaryIndex({
        indexName: `GSI${index}`,
        partitionKey: { name: `gsi${index}pk`, type: dynamodb.AttributeType.STRING },
        sortKey: { name: `gsi${index}sk`, type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });
    }

    this.apiHandler = new lambda.Function(this, "ApiHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: "index.handler",
      code: lambda.Code.fromInline(
        "exports.handler = async () => ({ statusCode: 501, headers: {'content-type': 'application/json'}, body: JSON.stringify({code: 'NOT_IMPLEMENTED', message: 'Phase 3 API'}) });",
      ),
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        ENVIRONMENT: props.config.name,
        STATE_TABLE_NAME: this.stateTable.tableName,
        SQL_BUCKET_NAME: props.storage.sqlBucket.bucketName,
        LOG_BUCKET_NAME: props.storage.logBucket.bucketName,
      },
    });
    const logGroup = new logs.LogGroup(this, "ApiLogGroup", {
      logGroupName: `/aws/lambda/${this.apiHandler.functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    logGroup.node.addMetadata("ContentPolicy", "Operational metadata only; SQL and secrets are prohibited.");

    const apiAccessLogGroup = new logs.LogGroup(this, "ApiAccessLogGroup", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.api = new apigwv2.HttpApi(this, "ControlApi", {
      createDefaultStage: true,
      disableExecuteApiEndpoint: false,
    });
    const defaultStage = this.api.defaultStage?.node.defaultChild as apigwv2.CfnStage | undefined;
    if (defaultStage) {
      defaultStage.accessLogSettings = {
        destinationArn: apiAccessLogGroup.logGroupArn,
        format: "$context.requestId $context.identity.sourceIp $context.authorizer.jwt.claims.sub $context.routeKey $context.status",
      };
    }

    const issuer = `https://cognito-idp.${Stack.of(this).region}.amazonaws.com/${this.userPool.userPoolId}`;
    new apigwv2.CfnAuthorizer(this, "JwtAuthorizer", {
      apiId: this.api.apiId,
      authorizerType: "JWT",
      identitySource: ["$request.header.Authorization"],
      name: "CognitoJwtAuthorizer",
      jwtConfiguration: {
        audience: [this.userPoolClient.userPoolClientId],
        issuer,
      },
    });

    this.node.addMetadata("AuthorizationBoundary", "API-side authorization is mandatory; UI controls are not authorization.");
    NagSuppressions.addResourceSuppressions(this.apiHandler, [
      {
        id: "AwsSolutions-IAM4",
        appliesTo: ["Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"],
        reason: "Phase 2 uses the AWS-managed Lambda basic logging policy; SQL and secret output is prohibited by handler scope. A customer-managed policy will replace it with the Phase 3 runtime handler.",
      },
    ], true);
  }
}
