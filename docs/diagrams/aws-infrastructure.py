"""SQL Patch Manager の論理AWS構成図を生成する。

このスクリプトは図を描くだけで、AWS SDK、CDK、AWS APIを呼び出さない。
実行例:
    python3 docs/diagrams/aws-infrastructure.py

出力:
    docs/diagrams/aws-infrastructure.png
"""

from diagrams import Cluster, Diagram, Edge
from diagrams.aws.compute import Lambda
from diagrams.aws.database import Dynamodb, RDS
from diagrams.aws.devtools import Codebuild
from diagrams.aws.general import GenericFirewall
from diagrams.aws.integration import Eventbridge
from diagrams.aws.network import APIGateway, CloudFront, Endpoint, PrivateSubnet, VPC
from diagrams.aws.security import Cognito, IAM, KMS, SecretsManager
from diagrams.aws.storage import S3


GRAPH_ATTR = {
    "bgcolor": "white",
    "pad": "0.4",
    "nodesep": "0.55",
    "ranksep": "0.9",
    "splines": "ortho",
}

NODE_ATTR = {"fontsize": "10"}


with Diagram(
    "AWS SQL Patch Manager - Logical Infrastructure",
    filename="docs/diagrams/aws-infrastructure",
    outformat="png",
    show=False,
    direction="LR",
    graph_attr=GRAPH_ATTR,
    node_attr=NODE_ATTR,
):
    with Cluster("Control plane\n個人開発: 1 account / 社内導入: Tools account"):
        cloudfront = CloudFront("CloudFront")
        ui_bucket = S3("UI bucket\nOAC + Block Public Access")
        cognito = Cognito("Cognito\nUser Pool")
        api_gateway = APIGateway("API Gateway\nJWT")
        api_lambda = Lambda("API Lambda\n認可・状態遷移")
        dispatcher = Lambda("Dispatcher / Reconciler\nPhase 3 planned")
        eventbridge = Eventbridge("EventBridge\nPhase 3 planned\n定期確認・起動漏れ検知のみ")
        patch_table = Dynamodb("DynamoDB\nPatch/File/Execution/Approval/Audit/Outbox")
        sql_bucket = S3("SQL bucket\nVersioning + SSE")
        log_bucket = S3("Log bucket\nVersioning + SSE")
        kms = KMS("KMS\n社内導入時のみ")
        iam = IAM("IAM\n最小権限・環境境界")

    cloudfront >> Edge(label="OAC") >> ui_bucket
    cognito >> Edge(label="JWT") >> api_gateway
    api_gateway >> Edge(label="認証済みAPI") >> api_lambda
    api_lambda >> Edge(label="状態・監査") >> patch_table
    api_lambda >> Edge(label="署名URL") >> sql_bucket
    api_lambda >> Edge(label="署名URL") >> log_bucket
    eventbridge >> Edge(label="Phase 3 planned\nSQL再実行なし") >> dispatcher
    patch_table >> Edge(label="Phase 3 planned\nOutbox poll + lease") >> dispatcher
    dispatcher >> Edge(label="Phase 3 planned\nStartBuild") >> iam
    sql_bucket >> Edge(style="dashed", label="SSE") >> kms
    log_bucket >> Edge(style="dashed", label="SSE") >> kms
    iam >> Edge(style="dashed", label="権限付与") >> api_lambda

    with Cluster("Development environment\n同一アカウント内またはDev account"):
        dev_build = Codebuild("CodeBuild-dev managed service\nVPC build ENI・専用IAM role")
        with Cluster("VPC: dev-execution-vpc"):
            dev_private = PrivateSubnet("Private Subnets\nNo public IP")
            dev_vpc = VPC("VPC")
            dev_secret = SecretsManager("Secret-dev")
            dev_db = RDS("RDS PostgreSQL-dev\nPrivate Subnet")
            dev_endpoint = Endpoint("S3/DDB Gateway\nSecrets Manager Interface")
            dev_sg = GenericFirewall("Security Group\nCodeBuild -> RDS:5432")
            dev_private >> dev_vpc
            dev_build >> Edge(label="Phase 3 planned\nGetSecretValue") >> dev_secret
            dev_build >> Edge(label="Phase 3 planned\nS3/DDB") >> dev_endpoint
            dev_sg >> Edge(style="dashed", label="Inbound only from CodeBuild") >> dev_db
        dev_build >> Edge(label="VPC build ENI / TLS 5432") >> dev_db

    with Cluster("Verification environment\nTest account推奨"):
        test_build = Codebuild("CodeBuild-test managed service\nVPC build ENI・専用IAM role")
        with Cluster("VPC: test-execution-vpc"):
            test_private = PrivateSubnet("Private Subnets")
            test_vpc = VPC("VPC")
            test_secret = SecretsManager("Secret-test")
            test_endpoint = Endpoint("S3/DDB Gateway\nSecrets Manager Interface")
            test_build >> Edge(label="Phase 3 planned\nSecret") >> test_secret
            test_build >> Edge(label="Phase 3 planned\nS3/DDB") >> test_endpoint
            test_private >> test_vpc
        test_db = RDS("外部RDS-test\n別管理・別VPC等\nPhase 3接続方式未確定")
        test_build >> Edge(label="将来の承認済みPrivate接続") >> test_db

    with Cluster("Production environment\nProduction account推奨"):
        prod_build = Codebuild("CodeBuild-prod managed service\nVPC build ENI・厳格なIAM role")
        with Cluster("VPC: prod-execution-vpc"):
            prod_private = PrivateSubnet("Private Subnet\n個人開発: 1 AZ")
            prod_vpc = VPC("VPC")
            prod_secret = SecretsManager("Secret-prod")
            prod_endpoint = Endpoint("S3/DDB Gateway\nSecrets Manager Interface")
            prod_build >> Edge(label="Phase 3 planned\nSecret") >> prod_secret
            prod_build >> Edge(label="Phase 3 planned\nS3/DDB") >> prod_endpoint
            prod_private >> prod_vpc
        prod_db = RDS("外部RDS-prod\n別管理・別VPC等\nPhase 3接続方式未確定")
        prod_build >> Edge(label="将来の厳格なPrivate接続") >> prod_db

    dispatcher >> Edge(label="環境別AssumeRoleまたは同一アカウント権限") >> dev_build
    dispatcher >> Edge(label="環境別AssumeRole") >> test_build
    dispatcher >> Edge(label="強い承認後のみ") >> prod_build
    dev_build >> Edge(style="dashed", label="Phase 3 planned\n結果Put") >> log_bucket
    test_build >> Edge(style="dashed", label="Phase 3 planned\n結果Put") >> log_bucket
    prod_build >> Edge(style="dashed", label="Phase 3 planned\n結果Put") >> log_bucket
