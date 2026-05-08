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
        const mealNlParseLambdaRole = new iam.Role(this, "MealNlParseLambdaRole", {
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            description: "Natural-language meal parse (read library, invalidate insight cache)",
        });
        mealNlParseLambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));
        mealsTable.grantReadData(mealNlParseLambdaRole);
        insightCacheTable.grantReadWriteData(mealNlParseLambdaRole);
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
        /** Opt-out: enabled unless deploy explicitly sets FF_* to "false" (test portal friendly). */
        const photoFoodLogEnv = process.env.FF_PHOTO_FOOD_LOG === "false" ? "false" : "true";
        const mealLibraryEnv = process.env.FF_MEAL_LIBRARY === "false" ? "false" : "true";
        const nlMealParseEnv = process.env.FF_NL_MEAL_PARSE === "false" ? "false" : "true";
        /** Set on the machine that runs `cdk deploy` (never commit). Omitted empty string still keeps the env slot so food vision can be enabled without the console. */
        const anthropicApiKeyDeploy = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
        const anthropicFoodVisionModel = process.env.ANTHROPIC_FOOD_VISION_MODEL?.trim() ?? "";
        const mealNlParseLambda = new aws_lambda_nodejs_1.NodejsFunction(this, "MealNlParseLambda", {
            functionName: `${this.stackName}-meal-nl-parse`,
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: path.join(__dirname, "..", "lambda", "meal-nl-parse.ts"),
            handler: "handler",
            role: mealNlParseLambdaRole,
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            environment: {
                MEALS_TABLE_NAME: mealsTable.tableName,
                INSIGHT_CACHE_TABLE_NAME: insightCacheTable.tableName,
                FF_MEAL_LIBRARY: mealLibraryEnv,
                FF_NL_MEAL_PARSE: nlMealParseEnv,
                ANTHROPIC_API_KEY: anthropicApiKeyDeploy,
                ...(process.env.ANTHROPIC_NL_MEAL_MODEL?.trim()
                    ? { ANTHROPIC_NL_MEAL_MODEL: process.env.ANTHROPIC_NL_MEAL_MODEL.trim() }
                    : {}),
            },
            bundling: {
                minify: true,
                sourceMap: false,
                target: "node20",
                forceDockerBundling: false,
            },
        });
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
                FF_NL_MEAL_PARSE: nlMealParseEnv,
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
        const mealNlParseIntegration = new apigwv2.CfnIntegration(this, "MealNlParseLambdaIntegration", {
            apiId: httpApi.apiId,
            integrationType: "AWS_PROXY",
            integrationUri: mealNlParseLambda.functionArn,
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
            { routeKey: "POST /v2/activity/estimate-burn", id: "ActivityEstimateBurnPostRoute" },
            { routeKey: "POST /v2/activity/log", id: "ActivityLogPostRoute" },
            { routeKey: "PATCH /v2/activity/calibration", id: "ActivityCalibrationPatchRoute" },
            { routeKey: "GET /v2/activity/energy-weekly-summary", id: "EnergyWeeklySummaryGetRoute" },
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
        new apigwv2.CfnRoute(this, "MealNlParsePostRoute", {
            apiId: httpApi.apiId,
            routeKey: "POST /v2/meals/nl-parse",
            target: `integrations/${mealNlParseIntegration.ref}`,
            authorizationType: "JWT",
            authorizerId: jwtAuthorizer.ref,
        });
        new apigwv2.CfnRoute(this, "MealNlParseInvalidatePostRoute", {
            apiId: httpApi.apiId,
            routeKey: "POST /v2/meals/nl-parse/invalidate-insights",
            target: `integrations/${mealNlParseIntegration.ref}`,
            authorizationType: "JWT",
            authorizerId: jwtAuthorizer.ref,
        });
        new lambda.CfnPermission(this, "ApiGatewayInvokePermission", {
            action: "lambda:InvokeFunction",
            functionName: apiLambda.functionName,
            principal: "apigateway.amazonaws.com",
            sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${httpApi.apiId}/*/*/*`,
        });
        new lambda.CfnPermission(this, "ApiGatewayInvokeMealNlParsePermission", {
            action: "lambda:InvokeFunction",
            functionName: mealNlParseLambda.functionName,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2VuZC1mb3VuZGF0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmFja2VuZC1mb3VuZGF0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyxtREFBbUQ7QUFDbkQsd0RBQXdEO0FBQ3hELHFEQUFxRDtBQUNyRCwyQ0FBMkM7QUFDM0MsaURBQWlEO0FBQ2pELHFFQUErRDtBQUMvRCx5Q0FBeUM7QUFDekMsa0NBQWtDO0FBRWxDLE1BQWEsc0JBQXVCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDbkQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLFFBQVEsR0FBRyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUN0RCxZQUFZLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyxRQUFRO1lBQ3ZDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsYUFBYSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtZQUM5QixVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1lBQzNCLGNBQWMsRUFBRTtnQkFDZCxTQUFTLEVBQUUsQ0FBQztnQkFDWixhQUFhLEVBQUUsSUFBSTtnQkFDbkIsZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsY0FBYyxFQUFFLEtBQUs7YUFDdEI7WUFDRCxlQUFlLEVBQUUsT0FBTyxDQUFDLGVBQWUsQ0FBQyxVQUFVO1lBQ25ELGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU07U0FDeEMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRTtZQUMxRCxrQkFBa0IsRUFBRSxHQUFHLElBQUks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LEVBQUUsUUFBUSxFQUFFO1lBQ2hDLEtBQUssRUFBRSxPQUFPLENBQUMsR0FBRyxJQUFJLEtBQUs7WUFDM0IsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsVUFBVTtTQUN4QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsUUFBUSxDQUFDLFVBQVU7WUFDMUIsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsZUFBZTtTQUM3QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzFDLEtBQUssRUFBRSxjQUFjLENBQUMsZ0JBQWdCO1lBQ3RDLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLHNCQUFzQjtTQUNwRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsWUFBWSxDQUFDLFVBQVU7WUFDOUIsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsY0FBYztTQUM1QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF4YUQsd0RBd2FDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSBcImF3cy1jZGstbGliL2F3cy1jb2duaXRvXCI7XG5pbXBvcnQgKiBhcyBhcGlnd3YyIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheXYyXCI7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYVwiO1xuaW1wb3J0IHsgTm9kZWpzRnVuY3Rpb24gfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ub2RlanNcIjtcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcIm5vZGU6cGF0aFwiO1xuXG5leHBvcnQgY2xhc3MgQmFja2VuZEZvdW5kYXRpb25TdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgXCJVc2VyUG9vbFwiLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS11c2Vyc2AsXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHsgZW1haWw6IHRydWUgfSxcbiAgICAgIGF1dG9WZXJpZnk6IHsgZW1haWw6IHRydWUgfSxcbiAgICAgIHBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgIG1pbkxlbmd0aDogOCxcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGFjY291bnRSZWNvdmVyeTogY29nbml0by5BY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gdXNlclBvb2wuYWRkQ2xpZW50KFwiVXNlclBvb2xDbGllbnRcIiwge1xuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0td2ViYCxcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgIHVzZXJTcnA6IHRydWUsXG4gICAgICB9LFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgY29uc3QgaHR0cEFwaSA9IG5ldyBhcGlnd3YyLkh0dHBBcGkodGhpcywgXCJIdHRwQXBpXCIsIHtcbiAgICAgIGFwaU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1odHRwLWFwaWAsXG4gICAgICBjb3JzUHJlZmxpZ2h0OiB7XG4gICAgICAgIGFsbG93SGVhZGVyczogW1wiQXV0aG9yaXphdGlvblwiLCBcIkNvbnRlbnQtVHlwZVwiLCBcIngtY29nbml0by1hY2Nlc3MtdG9rZW5cIl0sXG4gICAgICAgIGFsbG93TWV0aG9kczogW1xuICAgICAgICAgIGFwaWd3djIuQ29yc0h0dHBNZXRob2QuR0VULFxuICAgICAgICAgIGFwaWd3djIuQ29yc0h0dHBNZXRob2QuUE9TVCxcbiAgICAgICAgICBhcGlnd3YyLkNvcnNIdHRwTWV0aG9kLlBVVCxcbiAgICAgICAgICBhcGlnd3YyLkNvcnNIdHRwTWV0aG9kLkRFTEVURSxcbiAgICAgICAgICBhcGlnd3YyLkNvcnNIdHRwTWV0aG9kLlBBVENILFxuICAgICAgICAgIGFwaWd3djIuQ29yc0h0dHBNZXRob2QuT1BUSU9OUyxcbiAgICAgICAgXSxcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBbXCIqXCJdLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGVudHJpZXNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkVudHJpZXNUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiRW50cmllc1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwidXNlcklkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwiZGF0ZVwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7IHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICBjb25zdCBzZXR0aW5nc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiU2V0dGluZ3NUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiU2V0dGluZ3NcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInVzZXJJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7IHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICBjb25zdCBpbnNpZ2h0RmVlZGJhY2tUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkluc2lnaHRGZWVkYmFja1RhYmxlXCIsIHtcbiAgICAgIHRhYmxlTmFtZTogXCJJbnNpZ2h0RmVlZGJhY2tcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInVzZXJJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcImluc2lnaHRUc1wiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7IHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG4gICAgY29uc3QgaW5zaWdodENhY2hlVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJJbnNpZ2h0Q2FjaGVUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiSW5zaWdodENhY2hlXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJjYWNoZUtleVwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7IHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICBjb25zdCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiRmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiRmVhdHVyZUZsYWdPdmVycmlkZXNcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInVzZXJJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcImZsYWdcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiU3Vic2NyaXB0aW9uc1RhYmxlXCIsIHtcbiAgICAgIHRhYmxlTmFtZTogXCJTdWJzY3JpcHRpb25zXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYmlsbGluZ0V2ZW50c1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiQmlsbGluZ0V2ZW50c1RhYmxlXCIsIHtcbiAgICAgIHRhYmxlTmFtZTogXCJCaWxsaW5nRXZlbnRzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJpZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7IHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICBjb25zdCBmb29kTG9nRW50cmllc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiRm9vZExvZ0VudHJpZXNUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiRm9vZExvZ0VudHJpZXNcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInVzZXJJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcImZvb2RMb2dJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7IHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICBjb25zdCBtZWFsc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiTWVhbHNUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiTWVhbHNcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInVzZXJJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcIm1lYWxJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7IHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG4gICAgbWVhbHNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6IFwiTmFtZUxvb2t1cEtleUluZGV4XCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJuYW1lTG9va3VwS2V5XCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwibWVhbElkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZGF5TWVhbEVudHJpZXNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkRheU1lYWxFbnRyaWVzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkRheU1lYWxFbnRyaWVzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJkYXlLZXlcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJlbnRyeUlkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcbiAgICBkYXlNZWFsRW50cmllc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogXCJNZWFsSGlzdG9yeUluZGV4XCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJsaWJyYXJ5TWVhbElkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwibWVhbEhpc3RvcnlTa1wiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgICB9KTtcblxuICAgIGNvbnN0IHBob3Rvc0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgXCJQaG90b3NCdWNrZXRcIiwge1xuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW3MzLkh0dHBNZXRob2RzLlBVVCwgczMuSHR0cE1ldGhvZHMuR0VULCBzMy5IdHRwTWV0aG9kcy5IRUFEXSxcbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogW1xuICAgICAgICAgICAgXCJodHRwczovL29qYXMtaGVhbHRoLmNvbVwiLFxuICAgICAgICAgICAgXCJodHRwczovL3d3dy5vamFzLWhlYWx0aC5jb21cIixcbiAgICAgICAgICAgIFwiaHR0cDovL2xvY2FsaG9zdDozMDAwXCIsXG4gICAgICAgICAgICBcImh0dHA6Ly8xMjcuMC4wLjE6MzAwMFwiLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFtcIipcIl0sXG4gICAgICAgICAgZXhwb3NlZEhlYWRlcnM6IFtcIkVUYWdcIiwgXCJ4LWFtei1yZXF1ZXN0LWlkXCIsIFwieC1hbXotaWQtMlwiXSxcbiAgICAgICAgICBtYXhBZ2U6IDM2MDAsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYmFja2VuZExhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJCYWNrZW5kTGFtYmRhUm9sZVwiLCB7XG4gICAgICByb2xlTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWJhY2tlbmQtbGFtYmRhLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJsYW1iZGEuYW1hem9uYXdzLmNvbVwiKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXG4gICAgICAgICAgXCJzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlXCIsXG4gICAgICAgICksXG4gICAgICBdLFxuICAgICAgZGVzY3JpcHRpb246IFwiTGFtYmRhIHJvbGUgZm9yIERpZXQgVHJhY2tlciBiYWNrZW5kIENSVUQgaGFuZGxlcnMuXCIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBwcmVzaWduTGFtYmRhUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCBcIlByZXNpZ25MYW1iZGFSb2xlXCIsIHtcbiAgICAgIHJvbGVOYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tcHJlc2lnbi1sYW1iZGEtcm9sZWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbChcImxhbWJkYS5hbWF6b25hd3MuY29tXCIpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcbiAgICAgICAgICBcInNlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGVcIixcbiAgICAgICAgKSxcbiAgICAgIF0sXG4gICAgICBkZXNjcmlwdGlvbjogXCJMYW1iZGEgcm9sZSBmb3IgZ2VuZXJhdGluZyBTMyBwcmVzaWduZWQgdXBsb2FkL2Rvd25sb2FkIFVSTHMuXCIsXG4gICAgfSk7XG5cbiAgICBlbnRyaWVzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBzZXR0aW5nc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgaW5zaWdodEZlZWRiYWNrVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBpbnNpZ2h0Q2FjaGVUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYmFja2VuZExhbWJkYVJvbGUpO1xuICAgIGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBzdWJzY3JpcHRpb25zVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBiaWxsaW5nRXZlbnRzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBmb29kTG9nRW50cmllc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgbWVhbHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYmFja2VuZExhbWJkYVJvbGUpO1xuICAgIGRheU1lYWxFbnRyaWVzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcblxuICAgIGNvbnN0IG1lYWxObFBhcnNlTGFtYmRhUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCBcIk1lYWxObFBhcnNlTGFtYmRhUm9sZVwiLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbChcImxhbWJkYS5hbWF6b25hd3MuY29tXCIpLFxuICAgICAgZGVzY3JpcHRpb246IFwiTmF0dXJhbC1sYW5ndWFnZSBtZWFsIHBhcnNlIChyZWFkIGxpYnJhcnksIGludmFsaWRhdGUgaW5zaWdodCBjYWNoZSlcIixcbiAgICB9KTtcbiAgICBtZWFsTmxQYXJzZUxhbWJkYVJvbGUuYWRkTWFuYWdlZFBvbGljeShcbiAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcInNlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGVcIiksXG4gICAgKTtcbiAgICBtZWFsc1RhYmxlLmdyYW50UmVhZERhdGEobWVhbE5sUGFyc2VMYW1iZGFSb2xlKTtcbiAgICBpbnNpZ2h0Q2FjaGVUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEobWVhbE5sUGFyc2VMYW1iZGFSb2xlKTtcbiAgICBwaG90b3NCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoYmFja2VuZExhbWJkYVJvbGUpO1xuICAgIHBob3Rvc0J1Y2tldC5ncmFudFJlYWRXcml0ZShwcmVzaWduTGFtYmRhUm9sZSk7XG5cbiAgICBiYWNrZW5kTGFtYmRhUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1wiY29nbml0by1pZHA6TGlzdFVzZXJzXCIsIFwiY29nbml0by1pZHA6R2V0VXNlclwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbdXNlclBvb2wudXNlclBvb2xBcm5dLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIERlZmF1bHQgbWF0Y2hlcyBhcHAgb3duZXI7IG92ZXJyaWRlIHdpdGggQURNSU5fRU1BSUxTPS4uLiBhdCBkZXBsb3kgdGltZSBpZiBuZWVkZWQuXG4gICAgY29uc3QgYWRtaW5FbWFpbHNEZXBsb3kgPVxuICAgICAgcHJvY2Vzcy5lbnYuQURNSU5fRU1BSUxTPy50cmltKCkgfHwgXCJ2aWhhcm5hckBnbWFpbC5jb21cIjtcbiAgICAvKiogU2V0IHRvIFwiZmFsc2VcIiBvbiBkZXBsb3kgbWFjaGluZSB0byBzaGlwIExhbWJkYSB3aXRoIExMTSByZWZpbmUgZGlzYWJsZWQuIEtleSBtdXN0IGJlIHNldCBvbiB0aGUgZnVuY3Rpb24gaW4gQVdTIChub3QgaGVyZSkgc28gaXQgbmV2ZXIgYXBwZWFycyBpbiBDbG91ZEZvcm1hdGlvbi4gKi9cbiAgICBjb25zdCBpbnNpZ2h0c0xsbVJlZmluZUVudiA9IHByb2Nlc3MuZW52LklOU0lHSFRTX0xMTV9SRUZJTkUgPT09IFwiZmFsc2VcIiA/IFwiZmFsc2VcIiA6IFwidHJ1ZVwiO1xuICAgIC8qKiBPcHQtb3V0OiBlbmFibGVkIHVubGVzcyBkZXBsb3kgZXhwbGljaXRseSBzZXRzIEZGXyogdG8gXCJmYWxzZVwiICh0ZXN0IHBvcnRhbCBmcmllbmRseSkuICovXG4gICAgY29uc3QgcGhvdG9Gb29kTG9nRW52ID0gcHJvY2Vzcy5lbnYuRkZfUEhPVE9fRk9PRF9MT0cgPT09IFwiZmFsc2VcIiA/IFwiZmFsc2VcIiA6IFwidHJ1ZVwiO1xuICAgIGNvbnN0IG1lYWxMaWJyYXJ5RW52ID0gcHJvY2Vzcy5lbnYuRkZfTUVBTF9MSUJSQVJZID09PSBcImZhbHNlXCIgPyBcImZhbHNlXCIgOiBcInRydWVcIjtcbiAgICBjb25zdCBubE1lYWxQYXJzZUVudiA9IHByb2Nlc3MuZW52LkZGX05MX01FQUxfUEFSU0UgPT09IFwiZmFsc2VcIiA/IFwiZmFsc2VcIiA6IFwidHJ1ZVwiO1xuICAgIC8qKiBTZXQgb24gdGhlIG1hY2hpbmUgdGhhdCBydW5zIGBjZGsgZGVwbG95YCAobmV2ZXIgY29tbWl0KS4gT21pdHRlZCBlbXB0eSBzdHJpbmcgc3RpbGwga2VlcHMgdGhlIGVudiBzbG90IHNvIGZvb2QgdmlzaW9uIGNhbiBiZSBlbmFibGVkIHdpdGhvdXQgdGhlIGNvbnNvbGUuICovXG4gICAgY29uc3QgYW50aHJvcGljQXBpS2V5RGVwbG95ID0gcHJvY2Vzcy5lbnYuQU5USFJPUElDX0FQSV9LRVk/LnRyaW0oKSA/PyBcIlwiO1xuICAgIGNvbnN0IGFudGhyb3BpY0Zvb2RWaXNpb25Nb2RlbCA9IHByb2Nlc3MuZW52LkFOVEhST1BJQ19GT09EX1ZJU0lPTl9NT0RFTD8udHJpbSgpID8/IFwiXCI7XG4gICAgY29uc3QgbWVhbE5sUGFyc2VMYW1iZGEgPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgXCJNZWFsTmxQYXJzZUxhbWJkYVwiLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1tZWFsLW5sLXBhcnNlYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi5cIiwgXCJsYW1iZGFcIiwgXCJtZWFsLW5sLXBhcnNlLnRzXCIpLFxuICAgICAgaGFuZGxlcjogXCJoYW5kbGVyXCIsXG4gICAgICByb2xlOiBtZWFsTmxQYXJzZUxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxNSksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBNRUFMU19UQUJMRV9OQU1FOiBtZWFsc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgSU5TSUdIVF9DQUNIRV9UQUJMRV9OQU1FOiBpbnNpZ2h0Q2FjaGVUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEZGX01FQUxfTElCUkFSWTogbWVhbExpYnJhcnlFbnYsXG4gICAgICAgIEZGX05MX01FQUxfUEFSU0U6IG5sTWVhbFBhcnNlRW52LFxuICAgICAgICBBTlRIUk9QSUNfQVBJX0tFWTogYW50aHJvcGljQXBpS2V5RGVwbG95LFxuICAgICAgICAuLi4ocHJvY2Vzcy5lbnYuQU5USFJPUElDX05MX01FQUxfTU9ERUw/LnRyaW0oKVxuICAgICAgICAgID8geyBBTlRIUk9QSUNfTkxfTUVBTF9NT0RFTDogcHJvY2Vzcy5lbnYuQU5USFJPUElDX05MX01FQUxfTU9ERUwudHJpbSgpIH1cbiAgICAgICAgICA6IHt9KSxcbiAgICAgIH0sXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBtaW5pZnk6IHRydWUsXG4gICAgICAgIHNvdXJjZU1hcDogZmFsc2UsXG4gICAgICAgIHRhcmdldDogXCJub2RlMjBcIixcbiAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgYXBpTGFtYmRhID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsIFwiQmFja2VuZEFwaUxhbWJkYVwiLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1iYWNrZW5kLWFwaWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uXCIsIFwibGFtYmRhXCIsIFwiaHR0cC1hcGktaGFuZGxlci50c1wiKSxcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlclwiLFxuICAgICAgcm9sZTogYmFja2VuZExhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBFTlRSSUVTX1RBQkxFX05BTUU6IGVudHJpZXNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFNFVFRJTkdTX1RBQkxFX05BTUU6IHNldHRpbmdzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBJTlNJR0hUX0ZFRURCQUNLX1RBQkxFX05BTUU6IGluc2lnaHRGZWVkYmFja1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgSU5TSUdIVF9DQUNIRV9UQUJMRV9OQU1FOiBpbnNpZ2h0Q2FjaGVUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRTogZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFNVQlNDUklQVElPTlNfVEFCTEVfTkFNRTogc3Vic2NyaXB0aW9uc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgQklMTElOR19FVkVOVFNfVEFCTEVfTkFNRTogYmlsbGluZ0V2ZW50c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgRk9PRF9MT0dfRU5UUklFU19UQUJMRV9OQU1FOiBmb29kTG9nRW50cmllc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgTUVBTFNfVEFCTEVfTkFNRTogbWVhbHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIERBWV9NRUFMX0VOVFJJRVNfVEFCTEVfTkFNRTogZGF5TWVhbEVudHJpZXNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFBIT1RPX0JVQ0tFVF9OQU1FOiBwaG90b3NCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgVVNFUl9QT09MX0lEOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgICBBRE1JTl9FTUFJTFM6IGFkbWluRW1haWxzRGVwbG95LFxuICAgICAgICBVUExPQURfVVJMX1RUTF9TRUNPTkRTOiBcIjkwMFwiLFxuICAgICAgICBET1dOTE9BRF9VUkxfVFRMX1NFQ09ORFM6IFwiNjA0ODAwXCIsXG4gICAgICAgIElOU0lHSFRTX0xMTV9SRUZJTkU6IGluc2lnaHRzTGxtUmVmaW5lRW52LFxuICAgICAgICBGRl9QSE9UT19GT09EX0xPRzogcGhvdG9Gb29kTG9nRW52LFxuICAgICAgICBGRl9NRUFMX0xJQlJBUlk6IG1lYWxMaWJyYXJ5RW52LFxuICAgICAgICBGRl9OTF9NRUFMX1BBUlNFOiBubE1lYWxQYXJzZUVudixcbiAgICAgICAgQU5USFJPUElDX0FQSV9LRVk6IGFudGhyb3BpY0FwaUtleURlcGxveSxcbiAgICAgICAgLi4uKGFudGhyb3BpY0Zvb2RWaXNpb25Nb2RlbFxuICAgICAgICAgID8geyBBTlRIUk9QSUNfRk9PRF9WSVNJT05fTU9ERUw6IGFudGhyb3BpY0Zvb2RWaXNpb25Nb2RlbCB9XG4gICAgICAgICAgOiB7fSksXG4gICAgICB9LFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgbWluaWZ5OiB0cnVlLFxuICAgICAgICBzb3VyY2VNYXA6IGZhbHNlLFxuICAgICAgICB0YXJnZXQ6IFwibm9kZTIwXCIsXG4gICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGludGVncmF0aW9uID0gbmV3IGFwaWd3djIuQ2ZuSW50ZWdyYXRpb24odGhpcywgXCJCYWNrZW5kQXBpTGFtYmRhSW50ZWdyYXRpb25cIiwge1xuICAgICAgYXBpSWQ6IGh0dHBBcGkuYXBpSWQsXG4gICAgICBpbnRlZ3JhdGlvblR5cGU6IFwiQVdTX1BST1hZXCIsXG4gICAgICBpbnRlZ3JhdGlvblVyaTogYXBpTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgaW50ZWdyYXRpb25NZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgcGF5bG9hZEZvcm1hdFZlcnNpb246IFwiMi4wXCIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBtZWFsTmxQYXJzZUludGVncmF0aW9uID0gbmV3IGFwaWd3djIuQ2ZuSW50ZWdyYXRpb24odGhpcywgXCJNZWFsTmxQYXJzZUxhbWJkYUludGVncmF0aW9uXCIsIHtcbiAgICAgIGFwaUlkOiBodHRwQXBpLmFwaUlkLFxuICAgICAgaW50ZWdyYXRpb25UeXBlOiBcIkFXU19QUk9YWVwiLFxuICAgICAgaW50ZWdyYXRpb25Vcmk6IG1lYWxObFBhcnNlTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgaW50ZWdyYXRpb25NZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgcGF5bG9hZEZvcm1hdFZlcnNpb246IFwiMi4wXCIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBqd3RBdXRob3JpemVyID0gbmV3IGFwaWd3djIuQ2ZuQXV0aG9yaXplcih0aGlzLCBcIkNvZ25pdG9Kd3RBdXRob3JpemVyXCIsIHtcbiAgICAgIGFwaUlkOiBodHRwQXBpLmFwaUlkLFxuICAgICAgYXV0aG9yaXplclR5cGU6IFwiSldUXCIsXG4gICAgICBuYW1lOiBcImNvZ25pdG8tand0LWF1dGhvcml6ZXJcIixcbiAgICAgIGlkZW50aXR5U291cmNlOiBbXCIkcmVxdWVzdC5oZWFkZXIuQXV0aG9yaXphdGlvblwiXSxcbiAgICAgIGp3dENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgYXVkaWVuY2U6IFt1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkXSxcbiAgICAgICAgaXNzdWVyOiBgaHR0cHM6Ly9jb2duaXRvLWlkcC4ke3RoaXMucmVnaW9ufS5hbWF6b25hd3MuY29tLyR7dXNlclBvb2wudXNlclBvb2xJZH1gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHNlY3VyZWRSb3V0ZXM6IEFycmF5PHsgcm91dGVLZXk6IHN0cmluZzsgaWQ6IHN0cmluZyB9PiA9IFtcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC9lbnRyaWVzXCIsIGlkOiBcIkVudHJpZXNHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBVVCAvZW50cmllc1wiLCBpZDogXCJFbnRyaWVzUHV0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJERUxFVEUgL2VudHJpZXNcIiwgaWQ6IFwiRW50cmllc0RlbGV0ZVJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC9zZXR0aW5nc1wiLCBpZDogXCJTZXR0aW5nc0dldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUEFUQ0ggL3NldHRpbmdzXCIsIGlkOiBcIlNldHRpbmdzUGF0Y2hSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvc3RhdHNcIiwgaWQ6IFwiU3RhdHNHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBPU1QgL21ldHJpY3MvcGFnZS12aWV3XCIsIGlkOiBcIlBhZ2VWaWV3UG9zdFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvcGhvdG9zL3VwbG9hZC11cmxcIiwgaWQ6IFwiUGhvdG9VcGxvYWRVcmxSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvYWRtaW4vdXNlcnNcIiwgaWQ6IFwiQWRtaW5Vc2Vyc0dldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC92Mi9pbnNpZ2h0c1wiLCBpZDogXCJJbnNpZ2h0c1YyR2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9pbnNpZ2h0cy9mZWVkYmFja1wiLCBpZDogXCJJbnNpZ2h0c1YyRmVlZGJhY2tQb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9mb29kL2VzdGltYXRlXCIsIGlkOiBcIkZvb2RFc3RpbWF0ZVBvc3RSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBPU1QgL3YyL2Zvb2QvbG9nLWNvbmZpcm1cIiwgaWQ6IFwiRm9vZExvZ0NvbmZpcm1Qb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9hY3Rpdml0eS9lc3RpbWF0ZS1idXJuXCIsIGlkOiBcIkFjdGl2aXR5RXN0aW1hdGVCdXJuUG9zdFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvYWN0aXZpdHkvbG9nXCIsIGlkOiBcIkFjdGl2aXR5TG9nUG9zdFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUEFUQ0ggL3YyL2FjdGl2aXR5L2NhbGlicmF0aW9uXCIsIGlkOiBcIkFjdGl2aXR5Q2FsaWJyYXRpb25QYXRjaFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC92Mi9hY3Rpdml0eS9lbmVyZ3ktd2Vla2x5LXN1bW1hcnlcIiwgaWQ6IFwiRW5lcmd5V2Vla2x5U3VtbWFyeUdldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvZm9vZC9tZWFsLWNvbXBsZXRlXCIsIGlkOiBcIkZvb2RNZWFsQ29tcGxldGVQb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3YyL21lYWxzXCIsIGlkOiBcIk1lYWxzTGlzdEdldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvbWVhbHNcIiwgaWQ6IFwiTWVhbHNDcmVhdGVQb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3YyL21lYWxzL3N1Z2dlc3QtbWF0Y2hcIiwgaWQ6IFwiTWVhbHNTdWdnZXN0TWF0Y2hHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvdjIvbWVhbHMve21lYWxJZH0vaGlzdG9yeVwiLCBpZDogXCJNZWFsc0hpc3RvcnlHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBBVENIIC92Mi9tZWFscy97bWVhbElkfVwiLCBpZDogXCJNZWFsc1BhdGNoUm91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJERUxFVEUgL3YyL21lYWxzL3ttZWFsSWR9XCIsIGlkOiBcIk1lYWxzRGVsZXRlUm91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3YyL2RheXMve2RheX0vbWVhbC1lbnRyaWVzXCIsIGlkOiBcIkRheU1lYWxFbnRyaWVzTGlzdEdldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvZGF5cy97ZGF5fS9tZWFsLWVudHJpZXNcIiwgaWQ6IFwiRGF5TWVhbEVudHJpZXNDcmVhdGVQb3N0Um91dGVcIiB9LFxuICAgICAge1xuICAgICAgICByb3V0ZUtleTogXCJERUxFVEUgL3YyL2RheXMve2RheX0vbWVhbC1lbnRyaWVzL3tlbnRyeUlkfVwiLFxuICAgICAgICBpZDogXCJEYXlNZWFsRW50cnlEZWxldGVSb3V0ZVwiLFxuICAgICAgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC9mZWF0dXJlLWZsYWdzXCIsIGlkOiBcIkZlYXR1cmVGbGFnc0dldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC9hZG1pbi9mbGFnc1wiLCBpZDogXCJBZG1pbkZsYWdzR2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQVVQgL2FkbWluL2ZsYWdzXCIsIGlkOiBcIkFkbWluRmxhZ3NQdXRSb3V0ZVwiIH0sXG4gICAgXTtcblxuICAgIGZvciAoY29uc3Qgcm91dGUgb2Ygc2VjdXJlZFJvdXRlcykge1xuICAgICAgbmV3IGFwaWd3djIuQ2ZuUm91dGUodGhpcywgcm91dGUuaWQsIHtcbiAgICAgICAgYXBpSWQ6IGh0dHBBcGkuYXBpSWQsXG4gICAgICAgIHJvdXRlS2V5OiByb3V0ZS5yb3V0ZUtleSxcbiAgICAgICAgdGFyZ2V0OiBgaW50ZWdyYXRpb25zLyR7aW50ZWdyYXRpb24ucmVmfWAsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBcIkpXVFwiLFxuICAgICAgICBhdXRob3JpemVySWQ6IGp3dEF1dGhvcml6ZXIucmVmLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgbmV3IGFwaWd3djIuQ2ZuUm91dGUodGhpcywgXCJNZWFsTmxQYXJzZVBvc3RSb3V0ZVwiLCB7XG4gICAgICBhcGlJZDogaHR0cEFwaS5hcGlJZCxcbiAgICAgIHJvdXRlS2V5OiBcIlBPU1QgL3YyL21lYWxzL25sLXBhcnNlXCIsXG4gICAgICB0YXJnZXQ6IGBpbnRlZ3JhdGlvbnMvJHttZWFsTmxQYXJzZUludGVncmF0aW9uLnJlZn1gLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IFwiSldUXCIsXG4gICAgICBhdXRob3JpemVySWQ6IGp3dEF1dGhvcml6ZXIucmVmLFxuICAgIH0pO1xuXG4gICAgbmV3IGFwaWd3djIuQ2ZuUm91dGUodGhpcywgXCJNZWFsTmxQYXJzZUludmFsaWRhdGVQb3N0Um91dGVcIiwge1xuICAgICAgYXBpSWQ6IGh0dHBBcGkuYXBpSWQsXG4gICAgICByb3V0ZUtleTogXCJQT1NUIC92Mi9tZWFscy9ubC1wYXJzZS9pbnZhbGlkYXRlLWluc2lnaHRzXCIsXG4gICAgICB0YXJnZXQ6IGBpbnRlZ3JhdGlvbnMvJHttZWFsTmxQYXJzZUludGVncmF0aW9uLnJlZn1gLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IFwiSldUXCIsXG4gICAgICBhdXRob3JpemVySWQ6IGp3dEF1dGhvcml6ZXIucmVmLFxuICAgIH0pO1xuXG4gICAgbmV3IGxhbWJkYS5DZm5QZXJtaXNzaW9uKHRoaXMsIFwiQXBpR2F0ZXdheUludm9rZVBlcm1pc3Npb25cIiwge1xuICAgICAgYWN0aW9uOiBcImxhbWJkYTpJbnZva2VGdW5jdGlvblwiLFxuICAgICAgZnVuY3Rpb25OYW1lOiBhcGlMYW1iZGEuZnVuY3Rpb25OYW1lLFxuICAgICAgcHJpbmNpcGFsOiBcImFwaWdhdGV3YXkuYW1hem9uYXdzLmNvbVwiLFxuICAgICAgc291cmNlQXJuOiBgYXJuOmF3czpleGVjdXRlLWFwaToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06JHtodHRwQXBpLmFwaUlkfS8qLyovKmAsXG4gICAgfSk7XG5cbiAgICBuZXcgbGFtYmRhLkNmblBlcm1pc3Npb24odGhpcywgXCJBcGlHYXRld2F5SW52b2tlTWVhbE5sUGFyc2VQZXJtaXNzaW9uXCIsIHtcbiAgICAgIGFjdGlvbjogXCJsYW1iZGE6SW52b2tlRnVuY3Rpb25cIixcbiAgICAgIGZ1bmN0aW9uTmFtZTogbWVhbE5sUGFyc2VMYW1iZGEuZnVuY3Rpb25OYW1lLFxuICAgICAgcHJpbmNpcGFsOiBcImFwaWdhdGV3YXkuYW1hem9uYXdzLmNvbVwiLFxuICAgICAgc291cmNlQXJuOiBgYXJuOmF3czpleGVjdXRlLWFwaToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06JHtodHRwQXBpLmFwaUlkfS8qLyovKmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlJlZ2lvblwiLCB7XG4gICAgICB2YWx1ZTogY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1yZWdpb25gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJBcGlVcmxcIiwge1xuICAgICAgdmFsdWU6IGh0dHBBcGkudXJsID8/IFwiTi9BXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYXBpLXVybGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlVzZXJQb29sSWRcIiwge1xuICAgICAgdmFsdWU6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tdXNlci1wb29sLWlkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVXNlclBvb2xDbGllbnRJZFwiLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS11c2VyLXBvb2wtY2xpZW50LWlkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiQnVja2V0TmFtZVwiLCB7XG4gICAgICB2YWx1ZTogcGhvdG9zQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYnVja2V0LW5hbWVgLFxuICAgIH0pO1xuICB9XG59XG4iXX0=