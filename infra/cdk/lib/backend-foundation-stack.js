"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendFoundationStack = void 0;
const cdk = require("aws-cdk-lib");
const cognito = require("aws-cdk-lib/aws-cognito");
const apigwv2 = require("aws-cdk-lib/aws-apigatewayv2");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const iam = require("aws-cdk-lib/aws-iam");
const lambda = require("aws-cdk-lib/aws-lambda");
const s3 = require("aws-cdk-lib/aws-s3");
const path = require("node:path");
class BackendFoundationStack extends cdk.Stack {
    constructor(scope, id, props) {
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
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
            ],
            description: "Lambda role for Diet Tracker backend CRUD handlers.",
        });
        const presignLambdaRole = new iam.Role(this, "PresignLambdaRole", {
            roleName: `${this.stackName}-presign-lambda-role`,
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
            ],
            description: "Lambda role for generating S3 presigned upload/download URLs.",
        });
        entriesTable.grantReadWriteData(backendLambdaRole);
        settingsTable.grantReadWriteData(backendLambdaRole);
        photosBucket.grantReadWrite(backendLambdaRole);
        photosBucket.grantReadWrite(presignLambdaRole);
        backendLambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ["cognito-idp:ListUsers"],
            resources: [userPool.userPoolArn],
        }));
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
                USER_POOL_ID: userPool.userPoolId,
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
        const securedRoutes = [
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
exports.BackendFoundationStack = BackendFoundationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2VuZC1mb3VuZGF0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmFja2VuZC1mb3VuZGF0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyxtREFBbUQ7QUFDbkQsd0RBQXdEO0FBQ3hELHFEQUFxRDtBQUNyRCwyQ0FBMkM7QUFDM0MsaURBQWlEO0FBQ2pELHlDQUF5QztBQUN6QyxrQ0FBa0M7QUFFbEMsTUFBYSxzQkFBdUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNuRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sUUFBUSxHQUFHLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ3RELFlBQVksRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLFFBQVE7WUFDdkMsaUJBQWlCLEVBQUUsSUFBSTtZQUN2QixhQUFhLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1lBQzlCLFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7WUFDM0IsY0FBYyxFQUFFO2dCQUNkLFNBQVMsRUFBRSxDQUFDO2dCQUNaLGFBQWEsRUFBRSxJQUFJO2dCQUNuQixnQkFBZ0IsRUFBRSxJQUFJO2dCQUN0QixnQkFBZ0IsRUFBRSxJQUFJO2dCQUN0QixjQUFjLEVBQUUsS0FBSzthQUN0QjtZQUNELGVBQWUsRUFBRSxPQUFPLENBQUMsZUFBZSxDQUFDLFVBQVU7WUFDbkQsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtTQUN4QyxDQUFDLENBQUM7UUFFSCxNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsU0FBUyxDQUFDLGdCQUFnQixFQUFFO1lBQzFELGtCQUFrQixFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsTUFB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RSxHQUFHLElBQUksQ0FBQyxTQUFTLGVBQWU7U0FDN0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUMxQyxLQUFLLEVBQUUsY0FBYyxDQUFDLGdCQUFnQjtZQUN0QyxVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyxzQkFBc0I7U0FDcEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDcEMsS0FBSyxFQUFFLFlBQVksQ0FBQyxVQUFVO1lBQzlCLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLGNBQWM7U0FDNUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBbkxELHdEQW1MQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY29nbml0b1wiO1xuaW1wb3J0ICogYXMgYXBpZ3d2MiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2MlwiO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1keW5hbW9kYlwiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGFcIjtcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcIm5vZGU6cGF0aFwiO1xuXG5leHBvcnQgY2xhc3MgQmFja2VuZEZvdW5kYXRpb25TdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgXCJVc2VyUG9vbFwiLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS11c2Vyc2AsXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHsgZW1haWw6IHRydWUgfSxcbiAgICAgIGF1dG9WZXJpZnk6IHsgZW1haWw6IHRydWUgfSxcbiAgICAgIHBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgIG1pbkxlbmd0aDogOCxcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGFjY291bnRSZWNvdmVyeTogY29nbml0by5BY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gdXNlclBvb2wuYWRkQ2xpZW50KFwiVXNlclBvb2xDbGllbnRcIiwge1xuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0td2ViYCxcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgIHVzZXJTcnA6IHRydWUsXG4gICAgICB9LFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgY29uc3QgaHR0cEFwaSA9IG5ldyBhcGlnd3YyLkh0dHBBcGkodGhpcywgXCJIdHRwQXBpXCIsIHtcbiAgICAgIGFwaU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1odHRwLWFwaWAsXG4gICAgfSk7XG5cbiAgICBjb25zdCBlbnRyaWVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJFbnRyaWVzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkVudHJpZXNcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInVzZXJJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcImRhdGVcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2V0dGluZ3NUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIlNldHRpbmdzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIlNldHRpbmdzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcGhvdG9zQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcIlBob3Rvc0J1Y2tldFwiLCB7XG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgZW5mb3JjZVNTTDogdHJ1ZSxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IGJhY2tlbmRMYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiQmFja2VuZExhbWJkYVJvbGVcIiwge1xuICAgICAgcm9sZU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1iYWNrZW5kLWxhbWJkYS1yb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwibGFtYmRhLmFtYXpvbmF3cy5jb21cIiksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFxuICAgICAgICAgIFwic2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZVwiLFxuICAgICAgICApLFxuICAgICAgXSxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkxhbWJkYSByb2xlIGZvciBEaWV0IFRyYWNrZXIgYmFja2VuZCBDUlVEIGhhbmRsZXJzLlwiLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcHJlc2lnbkxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJQcmVzaWduTGFtYmRhUm9sZVwiLCB7XG4gICAgICByb2xlTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LXByZXNpZ24tbGFtYmRhLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJsYW1iZGEuYW1hem9uYXdzLmNvbVwiKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXG4gICAgICAgICAgXCJzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlXCIsXG4gICAgICAgICksXG4gICAgICBdLFxuICAgICAgZGVzY3JpcHRpb246IFwiTGFtYmRhIHJvbGUgZm9yIGdlbmVyYXRpbmcgUzMgcHJlc2lnbmVkIHVwbG9hZC9kb3dubG9hZCBVUkxzLlwiLFxuICAgIH0pO1xuXG4gICAgZW50cmllc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgc2V0dGluZ3NUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYmFja2VuZExhbWJkYVJvbGUpO1xuICAgIHBob3Rvc0J1Y2tldC5ncmFudFJlYWRXcml0ZShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgcGhvdG9zQnVja2V0LmdyYW50UmVhZFdyaXRlKHByZXNpZ25MYW1iZGFSb2xlKTtcbiAgICBiYWNrZW5kTGFtYmRhUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1wiY29nbml0by1pZHA6TGlzdFVzZXJzXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFt1c2VyUG9vbC51c2VyUG9vbEFybl0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc3QgYXBpTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIkJhY2tlbmRBcGlMYW1iZGFcIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYmFja2VuZC1hcGlgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBoYW5kbGVyOiBcImh0dHAtYXBpLWhhbmRsZXIuaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi5cIiwgXCJsYW1iZGFcIikpLFxuICAgICAgcm9sZTogYmFja2VuZExhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxNSksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBFTlRSSUVTX1RBQkxFX05BTUU6IGVudHJpZXNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFNFVFRJTkdTX1RBQkxFX05BTUU6IHNldHRpbmdzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBQSE9UT19CVUNLRVRfTkFNRTogcGhvdG9zQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFVQTE9BRF9VUkxfVFRMX1NFQ09ORFM6IFwiOTAwXCIsXG4gICAgICAgIFVTRVJfUE9PTF9JRDogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBpbnRlZ3JhdGlvbiA9IG5ldyBhcGlnd3YyLkNmbkludGVncmF0aW9uKHRoaXMsIFwiQmFja2VuZEFwaUxhbWJkYUludGVncmF0aW9uXCIsIHtcbiAgICAgIGFwaUlkOiBodHRwQXBpLmFwaUlkLFxuICAgICAgaW50ZWdyYXRpb25UeXBlOiBcIkFXU19QUk9YWVwiLFxuICAgICAgaW50ZWdyYXRpb25Vcmk6IGFwaUxhbWJkYS5mdW5jdGlvbkFybixcbiAgICAgIGludGVncmF0aW9uTWV0aG9kOiBcIlBPU1RcIixcbiAgICAgIHBheWxvYWRGb3JtYXRWZXJzaW9uOiBcIjIuMFwiLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgand0QXV0aG9yaXplciA9IG5ldyBhcGlnd3YyLkNmbkF1dGhvcml6ZXIodGhpcywgXCJDb2duaXRvSnd0QXV0aG9yaXplclwiLCB7XG4gICAgICBhcGlJZDogaHR0cEFwaS5hcGlJZCxcbiAgICAgIGF1dGhvcml6ZXJUeXBlOiBcIkpXVFwiLFxuICAgICAgbmFtZTogXCJjb2duaXRvLWp3dC1hdXRob3JpemVyXCIsXG4gICAgICBpZGVudGl0eVNvdXJjZTogW1wiJHJlcXVlc3QuaGVhZGVyLkF1dGhvcml6YXRpb25cIl0sXG4gICAgICBqd3RDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIGF1ZGllbmNlOiBbdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZF0sXG4gICAgICAgIGlzc3VlcjogYGh0dHBzOi8vY29nbml0by1pZHAuJHt0aGlzLnJlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke3VzZXJQb29sLnVzZXJQb29sSWR9YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBzZWN1cmVkUm91dGVzOiBBcnJheTx7IHJvdXRlS2V5OiBzdHJpbmc7IGlkOiBzdHJpbmcgfT4gPSBbXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvZW50cmllc1wiLCBpZDogXCJFbnRyaWVzR2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQVVQgL2VudHJpZXNcIiwgaWQ6IFwiRW50cmllc1B1dFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC9zZXR0aW5nc1wiLCBpZDogXCJTZXR0aW5nc0dldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUEFUQ0ggL3NldHRpbmdzXCIsIGlkOiBcIlNldHRpbmdzUGF0Y2hSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvc3RhdHNcIiwgaWQ6IFwiU3RhdHNHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBPU1QgL21ldHJpY3MvcGFnZS12aWV3XCIsIGlkOiBcIlBhZ2VWaWV3UG9zdFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvcGhvdG9zL3VwbG9hZC11cmxcIiwgaWQ6IFwiUGhvdG9VcGxvYWRVcmxSb3V0ZVwiIH0sXG4gICAgXTtcblxuICAgIGZvciAoY29uc3Qgcm91dGUgb2Ygc2VjdXJlZFJvdXRlcykge1xuICAgICAgbmV3IGFwaWd3djIuQ2ZuUm91dGUodGhpcywgcm91dGUuaWQsIHtcbiAgICAgICAgYXBpSWQ6IGh0dHBBcGkuYXBpSWQsXG4gICAgICAgIHJvdXRlS2V5OiByb3V0ZS5yb3V0ZUtleSxcbiAgICAgICAgdGFyZ2V0OiBgaW50ZWdyYXRpb25zLyR7aW50ZWdyYXRpb24ucmVmfWAsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBcIkpXVFwiLFxuICAgICAgICBhdXRob3JpemVySWQ6IGp3dEF1dGhvcml6ZXIucmVmLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgbmV3IGxhbWJkYS5DZm5QZXJtaXNzaW9uKHRoaXMsIFwiQXBpR2F0ZXdheUludm9rZVBlcm1pc3Npb25cIiwge1xuICAgICAgYWN0aW9uOiBcImxhbWJkYTpJbnZva2VGdW5jdGlvblwiLFxuICAgICAgZnVuY3Rpb25OYW1lOiBhcGlMYW1iZGEuZnVuY3Rpb25OYW1lLFxuICAgICAgcHJpbmNpcGFsOiBcImFwaWdhdGV3YXkuYW1hem9uYXdzLmNvbVwiLFxuICAgICAgc291cmNlQXJuOiBgYXJuOmF3czpleGVjdXRlLWFwaToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06JHtodHRwQXBpLmFwaUlkfS8qLyovKmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlJlZ2lvblwiLCB7XG4gICAgICB2YWx1ZTogY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1yZWdpb25gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJBcGlVcmxcIiwge1xuICAgICAgdmFsdWU6IGh0dHBBcGkudXJsID8/IFwiTi9BXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYXBpLXVybGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlVzZXJQb29sSWRcIiwge1xuICAgICAgdmFsdWU6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tdXNlci1wb29sLWlkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVXNlclBvb2xDbGllbnRJZFwiLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS11c2VyLXBvb2wtY2xpZW50LWlkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiQnVja2V0TmFtZVwiLCB7XG4gICAgICB2YWx1ZTogcGhvdG9zQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYnVja2V0LW5hbWVgLFxuICAgIH0pO1xuICB9XG59XG4iXX0=