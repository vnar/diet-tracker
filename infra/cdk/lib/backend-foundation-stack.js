"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendFoundationStack = void 0;
const cdk = require("aws-cdk-lib");
const cognito = require("aws-cdk-lib/aws-cognito");
const apigwv2 = require("aws-cdk-lib/aws-apigatewayv2");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const iam = require("aws-cdk-lib/aws-iam");
const lambda = require("aws-cdk-lib/aws-lambda");
const aws_lambda_nodejs_1 = require("aws-cdk-lib/aws-lambda-nodejs");
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
            corsPreflight: {
                allowHeaders: ["Authorization", "Content-Type", "x-cognito-access-token"],
                allowMethods: [
                    apigwv2.CorsHttpMethod.GET,
                    apigwv2.CorsHttpMethod.POST,
                    apigwv2.CorsHttpMethod.PUT,
                    apigwv2.CorsHttpMethod.DELETE,
                    apigwv2.CorsHttpMethod.PATCH,
                    apigwv2.CorsHttpMethod.OPTIONS,
                ],
                allowOrigins: ["*"],
            },
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
        const insightFeedbackTable = new dynamodb.Table(this, "InsightFeedbackTable", {
            tableName: "InsightFeedback",
            partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
            sortKey: { name: "insightTs", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        const insightCacheTable = new dynamodb.Table(this, "InsightCacheTable", {
            tableName: "InsightCache",
            partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
            sortKey: { name: "cacheKey", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        const featureFlagOverridesTable = new dynamodb.Table(this, "FeatureFlagOverridesTable", {
            tableName: "FeatureFlagOverrides",
            partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
            sortKey: { name: "flag", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        const subscriptionsTable = new dynamodb.Table(this, "SubscriptionsTable", {
            tableName: "Subscriptions",
            partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        const billingEventsTable = new dynamodb.Table(this, "BillingEventsTable", {
            tableName: "BillingEvents",
            partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        const foodLogEntriesTable = new dynamodb.Table(this, "FoodLogEntriesTable", {
            tableName: "FoodLogEntries",
            partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
            sortKey: { name: "foodLogId", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        const mealsTable = new dynamodb.Table(this, "MealsTable", {
            tableName: "Meals",
            partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
            sortKey: { name: "mealId", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        mealsTable.addGlobalSecondaryIndex({
            indexName: "NameLookupKeyIndex",
            partitionKey: { name: "nameLookupKey", type: dynamodb.AttributeType.STRING },
            sortKey: { name: "mealId", type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.ALL,
        });
        const dayMealEntriesTable = new dynamodb.Table(this, "DayMealEntriesTable", {
            tableName: "DayMealEntries",
            partitionKey: { name: "dayKey", type: dynamodb.AttributeType.STRING },
            sortKey: { name: "entryId", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        dayMealEntriesTable.addGlobalSecondaryIndex({
            indexName: "MealHistoryIndex",
            partitionKey: { name: "libraryMealId", type: dynamodb.AttributeType.STRING },
            sortKey: { name: "mealHistorySk", type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.ALL,
        });
        const photosBucket = new s3.Bucket(this, "PhotosBucket", {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            versioned: true,
            cors: [
                {
                    allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
                    allowedOrigins: [
                        "https://ojas-health.com",
                        "https://www.ojas-health.com",
                        "http://localhost:3000",
                        "http://127.0.0.1:3000",
                    ],
                    allowedHeaders: ["*"],
                    exposedHeaders: ["ETag", "x-amz-request-id", "x-amz-id-2"],
                    maxAge: 3600,
                },
            ],
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
        insightFeedbackTable.grantReadWriteData(backendLambdaRole);
        insightCacheTable.grantReadWriteData(backendLambdaRole);
        featureFlagOverridesTable.grantReadWriteData(backendLambdaRole);
        subscriptionsTable.grantReadWriteData(backendLambdaRole);
        billingEventsTable.grantReadWriteData(backendLambdaRole);
        foodLogEntriesTable.grantReadWriteData(backendLambdaRole);
        mealsTable.grantReadWriteData(backendLambdaRole);
        dayMealEntriesTable.grantReadWriteData(backendLambdaRole);
        photosBucket.grantReadWrite(backendLambdaRole);
        photosBucket.grantReadWrite(presignLambdaRole);
        backendLambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ["cognito-idp:ListUsers", "cognito-idp:GetUser"],
            resources: [userPool.userPoolArn],
        }));
        // Default matches app owner; override with ADMIN_EMAILS=... at deploy time if needed.
        const adminEmailsDeploy = process.env.ADMIN_EMAILS?.trim() || "viharnar@gmail.com";
        /** Set to "false" on deploy machine to ship Lambda with LLM refine disabled. Key must be set on the function in AWS (not here) so it never appears in CloudFormation. */
        const insightsLlmRefineEnv = process.env.INSIGHTS_LLM_REFINE === "false" ? "false" : "true";
        const photoFoodLogEnv = process.env.FF_PHOTO_FOOD_LOG === "true" ? "true" : "false";
        const mealLibraryEnv = process.env.FF_MEAL_LIBRARY === "true" ? "true" : "false";
        /** Set on the machine that runs `cdk deploy` (never commit). Omitted empty string still keeps the env slot so food vision can be enabled without the console. */
        const anthropicApiKeyDeploy = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
        const anthropicFoodVisionModel = process.env.ANTHROPIC_FOOD_VISION_MODEL?.trim() ?? "";
        const apiLambda = new aws_lambda_nodejs_1.NodejsFunction(this, "BackendApiLambda", {
            functionName: `${this.stackName}-backend-api`,
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: path.join(__dirname, "..", "lambda", "http-api-handler.ts"),
            handler: "handler",
            role: backendLambdaRole,
            timeout: cdk.Duration.seconds(60),
            memorySize: 512,
            environment: {
                ENTRIES_TABLE_NAME: entriesTable.tableName,
                SETTINGS_TABLE_NAME: settingsTable.tableName,
                INSIGHT_FEEDBACK_TABLE_NAME: insightFeedbackTable.tableName,
                INSIGHT_CACHE_TABLE_NAME: insightCacheTable.tableName,
                FEATURE_FLAG_OVERRIDES_TABLE_NAME: featureFlagOverridesTable.tableName,
                SUBSCRIPTIONS_TABLE_NAME: subscriptionsTable.tableName,
                BILLING_EVENTS_TABLE_NAME: billingEventsTable.tableName,
                FOOD_LOG_ENTRIES_TABLE_NAME: foodLogEntriesTable.tableName,
                MEALS_TABLE_NAME: mealsTable.tableName,
                DAY_MEAL_ENTRIES_TABLE_NAME: dayMealEntriesTable.tableName,
                PHOTO_BUCKET_NAME: photosBucket.bucketName,
                USER_POOL_ID: userPool.userPoolId,
                ADMIN_EMAILS: adminEmailsDeploy,
                UPLOAD_URL_TTL_SECONDS: "900",
                DOWNLOAD_URL_TTL_SECONDS: "604800",
                INSIGHTS_LLM_REFINE: insightsLlmRefineEnv,
                FF_PHOTO_FOOD_LOG: photoFoodLogEnv,
                FF_MEAL_LIBRARY: mealLibraryEnv,
                ANTHROPIC_API_KEY: anthropicApiKeyDeploy,
                ...(anthropicFoodVisionModel
                    ? { ANTHROPIC_FOOD_VISION_MODEL: anthropicFoodVisionModel }
                    : {}),
            },
            bundling: {
                minify: true,
                sourceMap: false,
                target: "node20",
                forceDockerBundling: false,
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
            { routeKey: "DELETE /entries", id: "EntriesDeleteRoute" },
            { routeKey: "GET /settings", id: "SettingsGetRoute" },
            { routeKey: "PATCH /settings", id: "SettingsPatchRoute" },
            { routeKey: "GET /stats", id: "StatsGetRoute" },
            { routeKey: "POST /metrics/page-view", id: "PageViewPostRoute" },
            { routeKey: "POST /photos/upload-url", id: "PhotoUploadUrlRoute" },
            { routeKey: "GET /admin/users", id: "AdminUsersGetRoute" },
            { routeKey: "GET /v2/insights", id: "InsightsV2GetRoute" },
            { routeKey: "POST /v2/insights/feedback", id: "InsightsV2FeedbackPostRoute" },
            { routeKey: "POST /v2/food/estimate", id: "FoodEstimatePostRoute" },
            { routeKey: "POST /v2/food/log-confirm", id: "FoodLogConfirmPostRoute" },
            { routeKey: "POST /v2/food/meal-complete", id: "FoodMealCompletePostRoute" },
            { routeKey: "GET /v2/meals", id: "MealsListGetRoute" },
            { routeKey: "POST /v2/meals", id: "MealsCreatePostRoute" },
            { routeKey: "GET /v2/meals/suggest-match", id: "MealsSuggestMatchGetRoute" },
            { routeKey: "GET /v2/meals/{mealId}/history", id: "MealsHistoryGetRoute" },
            { routeKey: "PATCH /v2/meals/{mealId}", id: "MealsPatchRoute" },
            { routeKey: "DELETE /v2/meals/{mealId}", id: "MealsDeleteRoute" },
            { routeKey: "GET /v2/days/{day}/meal-entries", id: "DayMealEntriesListGetRoute" },
            { routeKey: "POST /v2/days/{day}/meal-entries", id: "DayMealEntriesCreatePostRoute" },
            {
                routeKey: "DELETE /v2/days/{day}/meal-entries/{entryId}",
                id: "DayMealEntryDeleteRoute",
            },
            { routeKey: "GET /feature-flags", id: "FeatureFlagsGetRoute" },
            { routeKey: "GET /admin/flags", id: "AdminFlagsGetRoute" },
            { routeKey: "PUT /admin/flags", id: "AdminFlagsPutRoute" },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2VuZC1mb3VuZGF0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmFja2VuZC1mb3VuZGF0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyxtREFBbUQ7QUFDbkQsd0RBQXdEO0FBQ3hELHFEQUFxRDtBQUNyRCwyQ0FBMkM7QUFDM0MsaURBQWlEO0FBQ2pELHFFQUErRDtBQUMvRCx5Q0FBeUM7QUFDekMsa0NBQWtDO0FBRWxDLE1BQWEsc0JBQXVCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDbkQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLFFBQVEsR0FBRyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUN0RCxZQUFZLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyxRQUFRO1lBQ3ZDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsYUFBYSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtZQUM5QixVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1lBQzNCLGNBQWMsRUFBRTtnQkFDZCxTQUFTLEVBQUUsQ0FBQztnQkFDWixhQUFhLEVBQUUsSUFBSTtnQkFDbkIsZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsY0FBYyxFQUFFLEtBQUs7YUFDdEI7WUFDRCxlQUFlLEVBQUUsT0FBTyxDQUFDLGVBQWUsQ0FBQyxVQUFVO1lBQ25ELGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU07U0FDeEMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRTtZQUMxRCxrQkFBa0IsRUFBRSxHQUFHLElBQUks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ImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY29nbml0b1wiO1xuaW1wb3J0ICogYXMgYXBpZ3d2MiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2MlwiO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1keW5hbW9kYlwiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGFcIjtcbmltcG9ydCB7IE5vZGVqc0Z1bmN0aW9uIH0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGEtbm9kZWpzXCI7XG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJub2RlOnBhdGhcIjtcblxuZXhwb3J0IGNsYXNzIEJhY2tlbmRGb3VuZGF0aW9uU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB1c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsIFwiVXNlclBvb2xcIiwge1xuICAgICAgdXNlclBvb2xOYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tdXNlcnNgLFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7IGVtYWlsOiB0cnVlIH0sXG4gICAgICBhdXRvVmVyaWZ5OiB7IGVtYWlsOiB0cnVlIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IHVzZXJQb29sLmFkZENsaWVudChcIlVzZXJQb29sQ2xpZW50XCIsIHtcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LXdlYmAsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGh0dHBBcGkgPSBuZXcgYXBpZ3d2Mi5IdHRwQXBpKHRoaXMsIFwiSHR0cEFwaVwiLCB7XG4gICAgICBhcGlOYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0taHR0cC1hcGlgLFxuICAgICAgY29yc1ByZWZsaWdodDoge1xuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcIkF1dGhvcml6YXRpb25cIiwgXCJDb250ZW50LVR5cGVcIiwgXCJ4LWNvZ25pdG8tYWNjZXNzLXRva2VuXCJdLFxuICAgICAgICBhbGxvd01ldGhvZHM6IFtcbiAgICAgICAgICBhcGlnd3YyLkNvcnNIdHRwTWV0aG9kLkdFVCxcbiAgICAgICAgICBhcGlnd3YyLkNvcnNIdHRwTWV0aG9kLlBPU1QsXG4gICAgICAgICAgYXBpZ3d2Mi5Db3JzSHR0cE1ldGhvZC5QVVQsXG4gICAgICAgICAgYXBpZ3d2Mi5Db3JzSHR0cE1ldGhvZC5ERUxFVEUsXG4gICAgICAgICAgYXBpZ3d2Mi5Db3JzSHR0cE1ldGhvZC5QQVRDSCxcbiAgICAgICAgICBhcGlnd3YyLkNvcnNIdHRwTWV0aG9kLk9QVElPTlMsXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93T3JpZ2luczogW1wiKlwiXSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBlbnRyaWVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJFbnRyaWVzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkVudHJpZXNcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInVzZXJJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcImRhdGVcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2V0dGluZ3NUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIlNldHRpbmdzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIlNldHRpbmdzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgaW5zaWdodEZlZWRiYWNrVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJJbnNpZ2h0RmVlZGJhY2tUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiSW5zaWdodEZlZWRiYWNrXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJpbnNpZ2h0VHNcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuICAgIGNvbnN0IGluc2lnaHRDYWNoZVRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiSW5zaWdodENhY2hlVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkluc2lnaHRDYWNoZVwiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwidXNlcklkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwiY2FjaGVLZXlcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkZlYXR1cmVGbGFnT3ZlcnJpZGVzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJmbGFnXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIlN1YnNjcmlwdGlvbnNUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiU3Vic2NyaXB0aW9uc1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwidXNlcklkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IGJpbGxpbmdFdmVudHNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkJpbGxpbmdFdmVudHNUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiQmlsbGluZ0V2ZW50c1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwiaWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZm9vZExvZ0VudHJpZXNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkZvb2RMb2dFbnRyaWVzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkZvb2RMb2dFbnRyaWVzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJmb29kTG9nSWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgbWVhbHNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIk1lYWxzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIk1lYWxzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJtZWFsSWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuICAgIG1lYWxzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiBcIk5hbWVMb29rdXBLZXlJbmRleFwiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwibmFtZUxvb2t1cEtleVwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcIm1lYWxJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgICB9KTtcblxuICAgIGNvbnN0IGRheU1lYWxFbnRyaWVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJEYXlNZWFsRW50cmllc1RhYmxlXCIsIHtcbiAgICAgIHRhYmxlTmFtZTogXCJEYXlNZWFsRW50cmllc1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwiZGF5S2V5XCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwiZW50cnlJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7IHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG4gICAgZGF5TWVhbEVudHJpZXNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6IFwiTWVhbEhpc3RvcnlJbmRleFwiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwibGlicmFyeU1lYWxJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcIm1lYWxIaXN0b3J5U2tcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXG4gICAgfSk7XG5cbiAgICBjb25zdCBwaG90b3NCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiUGhvdG9zQnVja2V0XCIsIHtcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgY29yczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtzMy5IdHRwTWV0aG9kcy5QVVQsIHMzLkh0dHBNZXRob2RzLkdFVCwgczMuSHR0cE1ldGhvZHMuSEVBRF0sXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFtcbiAgICAgICAgICAgIFwiaHR0cHM6Ly9vamFzLWhlYWx0aC5jb21cIixcbiAgICAgICAgICAgIFwiaHR0cHM6Ly93d3cub2phcy1oZWFsdGguY29tXCIsXG4gICAgICAgICAgICBcImh0dHA6Ly9sb2NhbGhvc3Q6MzAwMFwiLFxuICAgICAgICAgICAgXCJodHRwOi8vMTI3LjAuMC4xOjMwMDBcIixcbiAgICAgICAgICBdLFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbXCIqXCJdLFxuICAgICAgICAgIGV4cG9zZWRIZWFkZXJzOiBbXCJFVGFnXCIsIFwieC1hbXotcmVxdWVzdC1pZFwiLCBcIngtYW16LWlkLTJcIl0sXG4gICAgICAgICAgbWF4QWdlOiAzNjAwLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IGJhY2tlbmRMYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiQmFja2VuZExhbWJkYVJvbGVcIiwge1xuICAgICAgcm9sZU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1iYWNrZW5kLWxhbWJkYS1yb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwibGFtYmRhLmFtYXpvbmF3cy5jb21cIiksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFxuICAgICAgICAgIFwic2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZVwiLFxuICAgICAgICApLFxuICAgICAgXSxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkxhbWJkYSByb2xlIGZvciBEaWV0IFRyYWNrZXIgYmFja2VuZCBDUlVEIGhhbmRsZXJzLlwiLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcHJlc2lnbkxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJQcmVzaWduTGFtYmRhUm9sZVwiLCB7XG4gICAgICByb2xlTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LXByZXNpZ24tbGFtYmRhLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJsYW1iZGEuYW1hem9uYXdzLmNvbVwiKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXG4gICAgICAgICAgXCJzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlXCIsXG4gICAgICAgICksXG4gICAgICBdLFxuICAgICAgZGVzY3JpcHRpb246IFwiTGFtYmRhIHJvbGUgZm9yIGdlbmVyYXRpbmcgUzMgcHJlc2lnbmVkIHVwbG9hZC9kb3dubG9hZCBVUkxzLlwiLFxuICAgIH0pO1xuXG4gICAgZW50cmllc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgc2V0dGluZ3NUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYmFja2VuZExhbWJkYVJvbGUpO1xuICAgIGluc2lnaHRGZWVkYmFja1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgaW5zaWdodENhY2hlVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgc3Vic2NyaXB0aW9uc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgYmlsbGluZ0V2ZW50c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgZm9vZExvZ0VudHJpZXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYmFja2VuZExhbWJkYVJvbGUpO1xuICAgIG1lYWxzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBkYXlNZWFsRW50cmllc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgcGhvdG9zQnVja2V0LmdyYW50UmVhZFdyaXRlKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBwaG90b3NCdWNrZXQuZ3JhbnRSZWFkV3JpdGUocHJlc2lnbkxhbWJkYVJvbGUpO1xuXG4gICAgYmFja2VuZExhbWJkYVJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcImNvZ25pdG8taWRwOkxpc3RVc2Vyc1wiLCBcImNvZ25pdG8taWRwOkdldFVzZXJcIl0sXG4gICAgICAgIHJlc291cmNlczogW3VzZXJQb29sLnVzZXJQb29sQXJuXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBEZWZhdWx0IG1hdGNoZXMgYXBwIG93bmVyOyBvdmVycmlkZSB3aXRoIEFETUlOX0VNQUlMUz0uLi4gYXQgZGVwbG95IHRpbWUgaWYgbmVlZGVkLlxuICAgIGNvbnN0IGFkbWluRW1haWxzRGVwbG95ID1cbiAgICAgIHByb2Nlc3MuZW52LkFETUlOX0VNQUlMUz8udHJpbSgpIHx8IFwidmloYXJuYXJAZ21haWwuY29tXCI7XG4gICAgLyoqIFNldCB0byBcImZhbHNlXCIgb24gZGVwbG95IG1hY2hpbmUgdG8gc2hpcCBMYW1iZGEgd2l0aCBMTE0gcmVmaW5lIGRpc2FibGVkLiBLZXkgbXVzdCBiZSBzZXQgb24gdGhlIGZ1bmN0aW9uIGluIEFXUyAobm90IGhlcmUpIHNvIGl0IG5ldmVyIGFwcGVhcnMgaW4gQ2xvdWRGb3JtYXRpb24uICovXG4gICAgY29uc3QgaW5zaWdodHNMbG1SZWZpbmVFbnYgPSBwcm9jZXNzLmVudi5JTlNJR0hUU19MTE1fUkVGSU5FID09PSBcImZhbHNlXCIgPyBcImZhbHNlXCIgOiBcInRydWVcIjtcbiAgICBjb25zdCBwaG90b0Zvb2RMb2dFbnYgPSBwcm9jZXNzLmVudi5GRl9QSE9UT19GT09EX0xPRyA9PT0gXCJ0cnVlXCIgPyBcInRydWVcIiA6IFwiZmFsc2VcIjtcbiAgICBjb25zdCBtZWFsTGlicmFyeUVudiA9IHByb2Nlc3MuZW52LkZGX01FQUxfTElCUkFSWSA9PT0gXCJ0cnVlXCIgPyBcInRydWVcIiA6IFwiZmFsc2VcIjtcbiAgICAvKiogU2V0IG9uIHRoZSBtYWNoaW5lIHRoYXQgcnVucyBgY2RrIGRlcGxveWAgKG5ldmVyIGNvbW1pdCkuIE9taXR0ZWQgZW1wdHkgc3RyaW5nIHN0aWxsIGtlZXBzIHRoZSBlbnYgc2xvdCBzbyBmb29kIHZpc2lvbiBjYW4gYmUgZW5hYmxlZCB3aXRob3V0IHRoZSBjb25zb2xlLiAqL1xuICAgIGNvbnN0IGFudGhyb3BpY0FwaUtleURlcGxveSA9IHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZPy50cmltKCkgPz8gXCJcIjtcbiAgICBjb25zdCBhbnRocm9waWNGb29kVmlzaW9uTW9kZWwgPSBwcm9jZXNzLmVudi5BTlRIUk9QSUNfRk9PRF9WSVNJT05fTU9ERUw/LnRyaW0oKSA/PyBcIlwiO1xuICAgIGNvbnN0IGFwaUxhbWJkYSA9IG5ldyBOb2RlanNGdW5jdGlvbih0aGlzLCBcIkJhY2tlbmRBcGlMYW1iZGFcIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYmFja2VuZC1hcGlgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLlwiLCBcImxhbWJkYVwiLCBcImh0dHAtYXBpLWhhbmRsZXIudHNcIiksXG4gICAgICBoYW5kbGVyOiBcImhhbmRsZXJcIixcbiAgICAgIHJvbGU6IGJhY2tlbmRMYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgRU5UUklFU19UQUJMRV9OQU1FOiBlbnRyaWVzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBTRVRUSU5HU19UQUJMRV9OQU1FOiBzZXR0aW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgSU5TSUdIVF9GRUVEQkFDS19UQUJMRV9OQU1FOiBpbnNpZ2h0RmVlZGJhY2tUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIElOU0lHSFRfQ0FDSEVfVEFCTEVfTkFNRTogaW5zaWdodENhY2hlVGFibGUudGFibGVOYW1lLFxuICAgICAgICBGRUFUVVJFX0ZMQUdfT1ZFUlJJREVTX1RBQkxFX05BTUU6IGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBTVUJTQ1JJUFRJT05TX1RBQkxFX05BTUU6IHN1YnNjcmlwdGlvbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEJJTExJTkdfRVZFTlRTX1RBQkxFX05BTUU6IGJpbGxpbmdFdmVudHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEZPT0RfTE9HX0VOVFJJRVNfVEFCTEVfTkFNRTogZm9vZExvZ0VudHJpZXNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIE1FQUxTX1RBQkxFX05BTUU6IG1lYWxzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBEQVlfTUVBTF9FTlRSSUVTX1RBQkxFX05BTUU6IGRheU1lYWxFbnRyaWVzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBQSE9UT19CVUNLRVRfTkFNRTogcGhvdG9zQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFVTRVJfUE9PTF9JRDogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgICAgQURNSU5fRU1BSUxTOiBhZG1pbkVtYWlsc0RlcGxveSxcbiAgICAgICAgVVBMT0FEX1VSTF9UVExfU0VDT05EUzogXCI5MDBcIixcbiAgICAgICAgRE9XTkxPQURfVVJMX1RUTF9TRUNPTkRTOiBcIjYwNDgwMFwiLFxuICAgICAgICBJTlNJR0hUU19MTE1fUkVGSU5FOiBpbnNpZ2h0c0xsbVJlZmluZUVudixcbiAgICAgICAgRkZfUEhPVE9fRk9PRF9MT0c6IHBob3RvRm9vZExvZ0VudixcbiAgICAgICAgRkZfTUVBTF9MSUJSQVJZOiBtZWFsTGlicmFyeUVudixcbiAgICAgICAgQU5USFJPUElDX0FQSV9LRVk6IGFudGhyb3BpY0FwaUtleURlcGxveSxcbiAgICAgICAgLi4uKGFudGhyb3BpY0Zvb2RWaXNpb25Nb2RlbFxuICAgICAgICAgID8geyBBTlRIUk9QSUNfRk9PRF9WSVNJT05fTU9ERUw6IGFudGhyb3BpY0Zvb2RWaXNpb25Nb2RlbCB9XG4gICAgICAgICAgOiB7fSksXG4gICAgICB9LFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgbWluaWZ5OiB0cnVlLFxuICAgICAgICBzb3VyY2VNYXA6IGZhbHNlLFxuICAgICAgICB0YXJnZXQ6IFwibm9kZTIwXCIsXG4gICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGludGVncmF0aW9uID0gbmV3IGFwaWd3djIuQ2ZuSW50ZWdyYXRpb24odGhpcywgXCJCYWNrZW5kQXBpTGFtYmRhSW50ZWdyYXRpb25cIiwge1xuICAgICAgYXBpSWQ6IGh0dHBBcGkuYXBpSWQsXG4gICAgICBpbnRlZ3JhdGlvblR5cGU6IFwiQVdTX1BST1hZXCIsXG4gICAgICBpbnRlZ3JhdGlvblVyaTogYXBpTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgaW50ZWdyYXRpb25NZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgcGF5bG9hZEZvcm1hdFZlcnNpb246IFwiMi4wXCIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBqd3RBdXRob3JpemVyID0gbmV3IGFwaWd3djIuQ2ZuQXV0aG9yaXplcih0aGlzLCBcIkNvZ25pdG9Kd3RBdXRob3JpemVyXCIsIHtcbiAgICAgIGFwaUlkOiBodHRwQXBpLmFwaUlkLFxuICAgICAgYXV0aG9yaXplclR5cGU6IFwiSldUXCIsXG4gICAgICBuYW1lOiBcImNvZ25pdG8tand0LWF1dGhvcml6ZXJcIixcbiAgICAgIGlkZW50aXR5U291cmNlOiBbXCIkcmVxdWVzdC5oZWFkZXIuQXV0aG9yaXphdGlvblwiXSxcbiAgICAgIGp3dENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgYXVkaWVuY2U6IFt1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkXSxcbiAgICAgICAgaXNzdWVyOiBgaHR0cHM6Ly9jb2duaXRvLWlkcC4ke3RoaXMucmVnaW9ufS5hbWF6b25hd3MuY29tLyR7dXNlclBvb2wudXNlclBvb2xJZH1gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHNlY3VyZWRSb3V0ZXM6IEFycmF5PHsgcm91dGVLZXk6IHN0cmluZzsgaWQ6IHN0cmluZyB9PiA9IFtcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC9lbnRyaWVzXCIsIGlkOiBcIkVudHJpZXNHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBVVCAvZW50cmllc1wiLCBpZDogXCJFbnRyaWVzUHV0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJERUxFVEUgL2VudHJpZXNcIiwgaWQ6IFwiRW50cmllc0RlbGV0ZVJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC9zZXR0aW5nc1wiLCBpZDogXCJTZXR0aW5nc0dldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUEFUQ0ggL3NldHRpbmdzXCIsIGlkOiBcIlNldHRpbmdzUGF0Y2hSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvc3RhdHNcIiwgaWQ6IFwiU3RhdHNHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBPU1QgL21ldHJpY3MvcGFnZS12aWV3XCIsIGlkOiBcIlBhZ2VWaWV3UG9zdFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvcGhvdG9zL3VwbG9hZC11cmxcIiwgaWQ6IFwiUGhvdG9VcGxvYWRVcmxSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvYWRtaW4vdXNlcnNcIiwgaWQ6IFwiQWRtaW5Vc2Vyc0dldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC92Mi9pbnNpZ2h0c1wiLCBpZDogXCJJbnNpZ2h0c1YyR2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9pbnNpZ2h0cy9mZWVkYmFja1wiLCBpZDogXCJJbnNpZ2h0c1YyRmVlZGJhY2tQb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9mb29kL2VzdGltYXRlXCIsIGlkOiBcIkZvb2RFc3RpbWF0ZVBvc3RSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBPU1QgL3YyL2Zvb2QvbG9nLWNvbmZpcm1cIiwgaWQ6IFwiRm9vZExvZ0NvbmZpcm1Qb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9mb29kL21lYWwtY29tcGxldGVcIiwgaWQ6IFwiRm9vZE1lYWxDb21wbGV0ZVBvc3RSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvdjIvbWVhbHNcIiwgaWQ6IFwiTWVhbHNMaXN0R2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9tZWFsc1wiLCBpZDogXCJNZWFsc0NyZWF0ZVBvc3RSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvdjIvbWVhbHMvc3VnZ2VzdC1tYXRjaFwiLCBpZDogXCJNZWFsc1N1Z2dlc3RNYXRjaEdldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC92Mi9tZWFscy97bWVhbElkfS9oaXN0b3J5XCIsIGlkOiBcIk1lYWxzSGlzdG9yeUdldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUEFUQ0ggL3YyL21lYWxzL3ttZWFsSWR9XCIsIGlkOiBcIk1lYWxzUGF0Y2hSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkRFTEVURSAvdjIvbWVhbHMve21lYWxJZH1cIiwgaWQ6IFwiTWVhbHNEZWxldGVSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvdjIvZGF5cy97ZGF5fS9tZWFsLWVudHJpZXNcIiwgaWQ6IFwiRGF5TWVhbEVudHJpZXNMaXN0R2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9kYXlzL3tkYXl9L21lYWwtZW50cmllc1wiLCBpZDogXCJEYXlNZWFsRW50cmllc0NyZWF0ZVBvc3RSb3V0ZVwiIH0sXG4gICAgICB7XG4gICAgICAgIHJvdXRlS2V5OiBcIkRFTEVURSAvdjIvZGF5cy97ZGF5fS9tZWFsLWVudHJpZXMve2VudHJ5SWR9XCIsXG4gICAgICAgIGlkOiBcIkRheU1lYWxFbnRyeURlbGV0ZVJvdXRlXCIsXG4gICAgICB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL2ZlYXR1cmUtZmxhZ3NcIiwgaWQ6IFwiRmVhdHVyZUZsYWdzR2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL2FkbWluL2ZsYWdzXCIsIGlkOiBcIkFkbWluRmxhZ3NHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBVVCAvYWRtaW4vZmxhZ3NcIiwgaWQ6IFwiQWRtaW5GbGFnc1B1dFJvdXRlXCIgfSxcbiAgICBdO1xuXG4gICAgZm9yIChjb25zdCByb3V0ZSBvZiBzZWN1cmVkUm91dGVzKSB7XG4gICAgICBuZXcgYXBpZ3d2Mi5DZm5Sb3V0ZSh0aGlzLCByb3V0ZS5pZCwge1xuICAgICAgICBhcGlJZDogaHR0cEFwaS5hcGlJZCxcbiAgICAgICAgcm91dGVLZXk6IHJvdXRlLnJvdXRlS2V5LFxuICAgICAgICB0YXJnZXQ6IGBpbnRlZ3JhdGlvbnMvJHtpbnRlZ3JhdGlvbi5yZWZ9YCxcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IFwiSldUXCIsXG4gICAgICAgIGF1dGhvcml6ZXJJZDogand0QXV0aG9yaXplci5yZWYsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBuZXcgbGFtYmRhLkNmblBlcm1pc3Npb24odGhpcywgXCJBcGlHYXRld2F5SW52b2tlUGVybWlzc2lvblwiLCB7XG4gICAgICBhY3Rpb246IFwibGFtYmRhOkludm9rZUZ1bmN0aW9uXCIsXG4gICAgICBmdW5jdGlvbk5hbWU6IGFwaUxhbWJkYS5mdW5jdGlvbk5hbWUsXG4gICAgICBwcmluY2lwYWw6IFwiYXBpZ2F0ZXdheS5hbWF6b25hd3MuY29tXCIsXG4gICAgICBzb3VyY2VBcm46IGBhcm46YXdzOmV4ZWN1dGUtYXBpOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fToke2h0dHBBcGkuYXBpSWR9LyovKi8qYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiUmVnaW9uXCIsIHtcbiAgICAgIHZhbHVlOiBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uLFxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LXJlZ2lvbmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIkFwaVVybFwiLCB7XG4gICAgICB2YWx1ZTogaHR0cEFwaS51cmwgPz8gXCJOL0FcIixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1hcGktdXJsYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVXNlclBvb2xJZFwiLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS11c2VyLXBvb2wtaWRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJVc2VyUG9vbENsaWVudElkXCIsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LXVzZXItcG9vbC1jbGllbnQtaWRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJCdWNrZXROYW1lXCIsIHtcbiAgICAgIHZhbHVlOiBwaG90b3NCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1idWNrZXQtbmFtZWAsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==