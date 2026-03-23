import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as path from "node:path";

export class BackendFoundationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${this.stackName}-users`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = userPool.addClient("UserPoolClient", {
      userPoolClientName: `${this.stackName}-web`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
    });

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: `${this.stackName}-http-api`,
    });

    const entriesTable = new dynamodb.Table(this, "EntriesTable", {
      tableName: "Entries",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "date", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const settingsTable = new dynamodb.Table(this, "SettingsTable", {
      tableName: "Settings",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const photosBucket = new s3.Bucket(this, "PhotosBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const backendLambdaRole = new iam.Role(this, "BackendLambdaRole", {
      roleName: `${this.stackName}-backend-lambda-role`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
      description: "Lambda role for Diet Tracker backend CRUD handlers.",
    });

    const presignLambdaRole = new iam.Role(this, "PresignLambdaRole", {
      roleName: `${this.stackName}-presign-lambda-role`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
      description: "Lambda role for generating S3 presigned upload/download URLs.",
    });

    entriesTable.grantReadWriteData(backendLambdaRole);
    settingsTable.grantReadWriteData(backendLambdaRole);
    photosBucket.grantReadWrite(backendLambdaRole);
    photosBucket.grantReadWrite(presignLambdaRole);

    const apiLambda = new lambda.Function(this, "BackendApiLambda", {
      functionName: `${this.stackName}-backend-api`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "http-api-handler.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "..", "lambda")),
      role: backendLambdaRole,
      timeout: cdk.Duration.seconds(15),
      memorySize: 512,
      environment: {
        ENTRIES_TABLE_NAME: entriesTable.tableName,
        SETTINGS_TABLE_NAME: settingsTable.tableName,
        PHOTO_BUCKET_NAME: photosBucket.bucketName,
        UPLOAD_URL_TTL_SECONDS: "900",
      },
    });

    const integration = new apigwv2.CfnIntegration(this, "BackendApiLambdaIntegration", {
      apiId: httpApi.apiId,
      integrationType: "AWS_PROXY",
      integrationUri: apiLambda.functionArn,
      integrationMethod: "POST",
      payloadFormatVersion: "2.0",
    });

    const jwtAuthorizer = new apigwv2.CfnAuthorizer(this, "CognitoJwtAuthorizer", {
      apiId: httpApi.apiId,
      authorizerType: "JWT",
      name: "cognito-jwt-authorizer",
      identitySource: ["$request.header.Authorization"],
      jwtConfiguration: {
        audience: [userPoolClient.userPoolClientId],
        issuer: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      },
    });

    const securedRoutes: Array<{ routeKey: string; id: string }> = [
      { routeKey: "GET /entries", id: "EntriesGetRoute" },
      { routeKey: "PUT /entries", id: "EntriesPutRoute" },
      { routeKey: "GET /settings", id: "SettingsGetRoute" },
      { routeKey: "PATCH /settings", id: "SettingsPatchRoute" },
      { routeKey: "GET /stats", id: "StatsGetRoute" },
      { routeKey: "POST /metrics/page-view", id: "PageViewPostRoute" },
      { routeKey: "POST /photos/upload-url", id: "PhotoUploadUrlRoute" },
    ];

    for (const route of securedRoutes) {
      new apigwv2.CfnRoute(this, route.id, {
        apiId: httpApi.apiId,
        routeKey: route.routeKey,
        target: `integrations/${integration.ref}`,
        authorizationType: "JWT",
        authorizerId: jwtAuthorizer.ref,
      });
    }

    new lambda.CfnPermission(this, "ApiGatewayInvokePermission", {
      action: "lambda:InvokeFunction",
      functionName: apiLambda.functionName,
      principal: "apigateway.amazonaws.com",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${httpApi.apiId}/*/*/*`,
    });

    new cdk.CfnOutput(this, "Region", {
      value: cdk.Stack.of(this).region,
      exportName: `${this.stackName}-region`,
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: httpApi.url ?? "N/A",
      exportName: `${this.stackName}-api-url`,
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      exportName: `${this.stackName}-user-pool-id`,
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
      exportName: `${this.stackName}-user-pool-client-id`,
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: photosBucket.bucketName,
      exportName: `${this.stackName}-bucket-name`,
    });
  }
}
