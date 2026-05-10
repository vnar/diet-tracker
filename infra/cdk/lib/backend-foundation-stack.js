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
/** Comma-separated https origins allowed to PUT/GET progress/food photos via presigned URLs (e.g. Amplify https://main.d123.amplifyapp.com). */
function photoCorsExtraOriginsFromEnv() {
    const raw = process.env.PHOTO_CORS_EXTRA_ORIGINS ?? "";
    return raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}
/** Test / internal portals: S3 allows any Origin for presigned PUT/GET (never use in production). */
function photoCorsAllowAllOrigins() {
    return process.env.PHOTO_CORS_ALLOW_ALL_ORIGINS?.trim().toLowerCase() === "true";
}
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
        const progressPhotosTable = new dynamodb.Table(this, "ProgressPhotosTable", {
            tableName: "ProgressPhotos",
            partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
            sortKey: { name: "photoId", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        progressPhotosTable.addGlobalSecondaryIndex({
            indexName: "UserDateIndex",
            partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
            sortKey: { name: "date", type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.ALL,
        });
        const photoCorsOrigins = photoCorsAllowAllOrigins()
            ? ["*"]
            : [
                "https://ojas-health.com",
                "https://www.ojas-health.com",
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "https://localhost:3000",
                "https://127.0.0.1:3000",
                ...photoCorsExtraOriginsFromEnv(),
            ];
        const photosBucket = new s3.Bucket(this, "PhotosBucket", {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            versioned: true,
            cors: [
                {
                    allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
                    allowedOrigins: photoCorsOrigins,
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
        progressPhotosTable.grantReadWriteData(backendLambdaRole);
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
        const bodyCompareAiEnv = process.env.FF_BODY_COMPARE_AI === "false" ? "false" : "true";
        const personalizedAiCoachingEnv =
            process.env.FF_PERSONALIZED_AI_COACHING === "false" ? "false" : "true";
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
                PROGRESS_PHOTOS_TABLE_NAME: progressPhotosTable.tableName,
                PHOTO_BUCKET_NAME: photosBucket.bucketName,
                USER_POOL_ID: userPool.userPoolId,
                ADMIN_EMAILS: adminEmailsDeploy,
                UPLOAD_URL_TTL_SECONDS: "900",
                DOWNLOAD_URL_TTL_SECONDS: "604800",
                INSIGHTS_LLM_REFINE: insightsLlmRefineEnv,
                FF_PHOTO_FOOD_LOG: photoFoodLogEnv,
                FF_MEAL_LIBRARY: mealLibraryEnv,
                FF_NL_MEAL_PARSE: nlMealParseEnv,
                FF_BODY_COMPARE_AI: bodyCompareAiEnv,
                FF_PERSONALIZED_AI_COACHING: personalizedAiCoachingEnv,
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
            { routeKey: "GET /v2/progress-photos", id: "ProgressPhotosListGetRoute" },
            { routeKey: "POST /v2/progress-photos", id: "ProgressPhotosCreatePostRoute" },
            { routeKey: "DELETE /v2/progress-photos/{photoId}", id: "ProgressPhotosDeleteRoute" },
            { routeKey: "POST /v2/progress-photos/assessment", id: "ProgressPhotosAssessmentPostRoute" },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2VuZC1mb3VuZGF0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmFja2VuZC1mb3VuZGF0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyxtREFBbUQ7QUFDbkQsd0RBQXdEO0FBQ3hELHFEQUFxRDtBQUNyRCwyQ0FBMkM7QUFDM0MsaURBQWlEO0FBQ2pELHFFQUErRDtBQUMvRCx5Q0FBeUM7QUFDekMsa0NBQWtDO0FBRWxDLGdKQUFnSjtBQUNoSixTQUFTLDRCQUE0QjtJQUNuQyxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixJQUFJLEVBQUUsQ0FBQztJQUN2RCxPQUFPLEdBQUc7U0FDUCxLQUFLLENBQUMsR0FBRyxDQUFDO1NBQ1YsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7U0FDcEIsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2pDLENBQUM7QUFFRCxxR0FBcUc7QUFDckcsU0FBUyx3QkFBd0I7SUFDL0IsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixFQUFFLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxLQUFLLE1BQU0sQ0FBQztBQUNuRixDQUFDO0FBRUQsTUFBYSxzQkFBdUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNuRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sUUFBUSxHQUFHLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ3RELFlBQVksRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLFFBQVE7WUFDdkMs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QUksRUFBRSxZQUFZLEVBQUU7WUFDcEMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxVQUFVO1lBQzFCLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLGVBQWU7U0FDN0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUMxQyxLQUFLLEVBQUUsY0FBYyxDQUFDLGdCQUFnQjtZQUN0QyxVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyxzQkFBc0I7U0FDcEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDcEMsS0FBSyxFQUFFLFlBQVksQ0FBQyxVQUFVO1lBQzlCLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLGNBQWM7U0FDNUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBcmNELHdEQXFjQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY29nbml0b1wiO1xuaW1wb3J0ICogYXMgYXBpZ3d2MiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2MlwiO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1keW5hbW9kYlwiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGFcIjtcbmltcG9ydCB7IE5vZGVqc0Z1bmN0aW9uIH0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGEtbm9kZWpzXCI7XG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJub2RlOnBhdGhcIjtcblxuLyoqIENvbW1hLXNlcGFyYXRlZCBodHRwcyBvcmlnaW5zIGFsbG93ZWQgdG8gUFVUL0dFVCBwcm9ncmVzcy9mb29kIHBob3RvcyB2aWEgcHJlc2lnbmVkIFVSTHMgKGUuZy4gQW1wbGlmeSBodHRwczovL21haW4uZDEyMy5hbXBsaWZ5YXBwLmNvbSkuICovXG5mdW5jdGlvbiBwaG90b0NvcnNFeHRyYU9yaWdpbnNGcm9tRW52KCk6IHN0cmluZ1tdIHtcbiAgY29uc3QgcmF3ID0gcHJvY2Vzcy5lbnYuUEhPVE9fQ09SU19FWFRSQV9PUklHSU5TID8/IFwiXCI7XG4gIHJldHVybiByYXdcbiAgICAuc3BsaXQoXCIsXCIpXG4gICAgLm1hcCgocykgPT4gcy50cmltKCkpXG4gICAgLmZpbHRlcigocykgPT4gcy5sZW5ndGggPiAwKTtcbn1cblxuLyoqIFRlc3QgLyBpbnRlcm5hbCBwb3J0YWxzOiBTMyBhbGxvd3MgYW55IE9yaWdpbiBmb3IgcHJlc2lnbmVkIFBVVC9HRVQgKG5ldmVyIHVzZSBpbiBwcm9kdWN0aW9uKS4gKi9cbmZ1bmN0aW9uIHBob3RvQ29yc0FsbG93QWxsT3JpZ2lucygpOiBib29sZWFuIHtcbiAgcmV0dXJuIHByb2Nlc3MuZW52LlBIT1RPX0NPUlNfQUxMT1dfQUxMX09SSUdJTlM/LnRyaW0oKS50b0xvd2VyQ2FzZSgpID09PSBcInRydWVcIjtcbn1cblxuZXhwb3J0IGNsYXNzIEJhY2tlbmRGb3VuZGF0aW9uU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB1c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsIFwiVXNlclBvb2xcIiwge1xuICAgICAgdXNlclBvb2xOYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tdXNlcnNgLFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7IGVtYWlsOiB0cnVlIH0sXG4gICAgICBhdXRvVmVyaWZ5OiB7IGVtYWlsOiB0cnVlIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IHVzZXJQb29sLmFkZENsaWVudChcIlVzZXJQb29sQ2xpZW50XCIsIHtcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LXdlYmAsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGh0dHBBcGkgPSBuZXcgYXBpZ3d2Mi5IdHRwQXBpKHRoaXMsIFwiSHR0cEFwaVwiLCB7XG4gICAgICBhcGlOYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0taHR0cC1hcGlgLFxuICAgICAgY29yc1ByZWZsaWdodDoge1xuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcIkF1dGhvcml6YXRpb25cIiwgXCJDb250ZW50LVR5cGVcIiwgXCJ4LWNvZ25pdG8tYWNjZXNzLXRva2VuXCJdLFxuICAgICAgICBhbGxvd01ldGhvZHM6IFtcbiAgICAgICAgICBhcGlnd3YyLkNvcnNIdHRwTWV0aG9kLkdFVCxcbiAgICAgICAgICBhcGlnd3YyLkNvcnNIdHRwTWV0aG9kLlBPU1QsXG4gICAgICAgICAgYXBpZ3d2Mi5Db3JzSHR0cE1ldGhvZC5QVVQsXG4gICAgICAgICAgYXBpZ3d2Mi5Db3JzSHR0cE1ldGhvZC5ERUxFVEUsXG4gICAgICAgICAgYXBpZ3d2Mi5Db3JzSHR0cE1ldGhvZC5QQVRDSCxcbiAgICAgICAgICBhcGlnd3YyLkNvcnNIdHRwTWV0aG9kLk9QVElPTlMsXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93T3JpZ2luczogW1wiKlwiXSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBlbnRyaWVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJFbnRyaWVzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkVudHJpZXNcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInVzZXJJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcImRhdGVcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2V0dGluZ3NUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIlNldHRpbmdzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIlNldHRpbmdzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgaW5zaWdodEZlZWRiYWNrVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJJbnNpZ2h0RmVlZGJhY2tUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiSW5zaWdodEZlZWRiYWNrXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJpbnNpZ2h0VHNcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuICAgIGNvbnN0IGluc2lnaHRDYWNoZVRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiSW5zaWdodENhY2hlVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkluc2lnaHRDYWNoZVwiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwidXNlcklkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwiY2FjaGVLZXlcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkZlYXR1cmVGbGFnT3ZlcnJpZGVzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJmbGFnXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIlN1YnNjcmlwdGlvbnNUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiU3Vic2NyaXB0aW9uc1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwidXNlcklkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IGJpbGxpbmdFdmVudHNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkJpbGxpbmdFdmVudHNUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiQmlsbGluZ0V2ZW50c1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwiaWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZm9vZExvZ0VudHJpZXNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkZvb2RMb2dFbnRyaWVzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkZvb2RMb2dFbnRyaWVzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJmb29kTG9nSWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgbWVhbHNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIk1lYWxzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIk1lYWxzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJtZWFsSWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuICAgIG1lYWxzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiBcIk5hbWVMb29rdXBLZXlJbmRleFwiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwibmFtZUxvb2t1cEtleVwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcIm1lYWxJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgICB9KTtcblxuICAgIGNvbnN0IGRheU1lYWxFbnRyaWVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJEYXlNZWFsRW50cmllc1RhYmxlXCIsIHtcbiAgICAgIHRhYmxlTmFtZTogXCJEYXlNZWFsRW50cmllc1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwiZGF5S2V5XCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwiZW50cnlJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7IHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG4gICAgZGF5TWVhbEVudHJpZXNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6IFwiTWVhbEhpc3RvcnlJbmRleFwiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwibGlicmFyeU1lYWxJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcIm1lYWxIaXN0b3J5U2tcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXG4gICAgfSk7XG4gICAgY29uc3QgcHJvZ3Jlc3NQaG90b3NUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIlByb2dyZXNzUGhvdG9zVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIlByb2dyZXNzUGhvdG9zXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJwaG90b0lkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcbiAgICBwcm9ncmVzc1Bob3Rvc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogXCJVc2VyRGF0ZUluZGV4XCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJkYXRlXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcGhvdG9Db3JzT3JpZ2lucyA9IHBob3RvQ29yc0FsbG93QWxsT3JpZ2lucygpXG4gICAgICA/IFtcIipcIl1cbiAgICAgIDogW1xuICAgICAgICAgIFwiaHR0cHM6Ly9vamFzLWhlYWx0aC5jb21cIixcbiAgICAgICAgICBcImh0dHBzOi8vd3d3Lm9qYXMtaGVhbHRoLmNvbVwiLFxuICAgICAgICAgIFwiaHR0cDovL2xvY2FsaG9zdDozMDAwXCIsXG4gICAgICAgICAgXCJodHRwOi8vMTI3LjAuMC4xOjMwMDBcIixcbiAgICAgICAgICBcImh0dHBzOi8vbG9jYWxob3N0OjMwMDBcIixcbiAgICAgICAgICBcImh0dHBzOi8vMTI3LjAuMC4xOjMwMDBcIixcbiAgICAgICAgICAuLi5waG90b0NvcnNFeHRyYU9yaWdpbnNGcm9tRW52KCksXG4gICAgICAgIF07XG5cbiAgICBjb25zdCBwaG90b3NCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiUGhvdG9zQnVja2V0XCIsIHtcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgY29yczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtzMy5IdHRwTWV0aG9kcy5QVVQsIHMzLkh0dHBNZXRob2RzLkdFVCwgczMuSHR0cE1ldGhvZHMuSEVBRF0sXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IHBob3RvQ29yc09yaWdpbnMsXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFtcIipcIl0sXG4gICAgICAgICAgZXhwb3NlZEhlYWRlcnM6IFtcIkVUYWdcIiwgXCJ4LWFtei1yZXF1ZXN0LWlkXCIsIFwieC1hbXotaWQtMlwiXSxcbiAgICAgICAgICBtYXhBZ2U6IDM2MDAsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYmFja2VuZExhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJCYWNrZW5kTGFtYmRhUm9sZVwiLCB7XG4gICAgICByb2xlTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWJhY2tlbmQtbGFtYmRhLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJsYW1iZGEuYW1hem9uYXdzLmNvbVwiKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXG4gICAgICAgICAgXCJzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlXCIsXG4gICAgICAgICksXG4gICAgICBdLFxuICAgICAgZGVzY3JpcHRpb246IFwiTGFtYmRhIHJvbGUgZm9yIERpZXQgVHJhY2tlciBiYWNrZW5kIENSVUQgaGFuZGxlcnMuXCIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBwcmVzaWduTGFtYmRhUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCBcIlByZXNpZ25MYW1iZGFSb2xlXCIsIHtcbiAgICAgIHJvbGVOYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tcHJlc2lnbi1sYW1iZGEtcm9sZWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbChcImxhbWJkYS5hbWF6b25hd3MuY29tXCIpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcbiAgICAgICAgICBcInNlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGVcIixcbiAgICAgICAgKSxcbiAgICAgIF0sXG4gICAgICBkZXNjcmlwdGlvbjogXCJMYW1iZGEgcm9sZSBmb3IgZ2VuZXJhdGluZyBTMyBwcmVzaWduZWQgdXBsb2FkL2Rvd25sb2FkIFVSTHMuXCIsXG4gICAgfSk7XG5cbiAgICBlbnRyaWVzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBzZXR0aW5nc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgaW5zaWdodEZlZWRiYWNrVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBpbnNpZ2h0Q2FjaGVUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYmFja2VuZExhbWJkYVJvbGUpO1xuICAgIGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBzdWJzY3JpcHRpb25zVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBiaWxsaW5nRXZlbnRzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBmb29kTG9nRW50cmllc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgbWVhbHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYmFja2VuZExhbWJkYVJvbGUpO1xuICAgIGRheU1lYWxFbnRyaWVzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBwcm9ncmVzc1Bob3Rvc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG5cbiAgICBjb25zdCBtZWFsTmxQYXJzZUxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJNZWFsTmxQYXJzZUxhbWJkYVJvbGVcIiwge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJsYW1iZGEuYW1hem9uYXdzLmNvbVwiKSxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIk5hdHVyYWwtbGFuZ3VhZ2UgbWVhbCBwYXJzZSAocmVhZCBsaWJyYXJ5LCBpbnZhbGlkYXRlIGluc2lnaHQgY2FjaGUpXCIsXG4gICAgfSk7XG4gICAgbWVhbE5sUGFyc2VMYW1iZGFSb2xlLmFkZE1hbmFnZWRQb2xpY3koXG4gICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXCJzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlXCIpLFxuICAgICk7XG4gICAgbWVhbHNUYWJsZS5ncmFudFJlYWREYXRhKG1lYWxObFBhcnNlTGFtYmRhUm9sZSk7XG4gICAgaW5zaWdodENhY2hlVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKG1lYWxObFBhcnNlTGFtYmRhUm9sZSk7XG4gICAgcGhvdG9zQnVja2V0LmdyYW50UmVhZFdyaXRlKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBwaG90b3NCdWNrZXQuZ3JhbnRSZWFkV3JpdGUocHJlc2lnbkxhbWJkYVJvbGUpO1xuXG4gICAgYmFja2VuZExhbWJkYVJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcImNvZ25pdG8taWRwOkxpc3RVc2Vyc1wiLCBcImNvZ25pdG8taWRwOkdldFVzZXJcIl0sXG4gICAgICAgIHJlc291cmNlczogW3VzZXJQb29sLnVzZXJQb29sQXJuXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBEZWZhdWx0IG1hdGNoZXMgYXBwIG93bmVyOyBvdmVycmlkZSB3aXRoIEFETUlOX0VNQUlMUz0uLi4gYXQgZGVwbG95IHRpbWUgaWYgbmVlZGVkLlxuICAgIGNvbnN0IGFkbWluRW1haWxzRGVwbG95ID1cbiAgICAgIHByb2Nlc3MuZW52LkFETUlOX0VNQUlMUz8udHJpbSgpIHx8IFwidmloYXJuYXJAZ21haWwuY29tXCI7XG4gICAgLyoqIFNldCB0byBcImZhbHNlXCIgb24gZGVwbG95IG1hY2hpbmUgdG8gc2hpcCBMYW1iZGEgd2l0aCBMTE0gcmVmaW5lIGRpc2FibGVkLiBLZXkgbXVzdCBiZSBzZXQgb24gdGhlIGZ1bmN0aW9uIGluIEFXUyAobm90IGhlcmUpIHNvIGl0IG5ldmVyIGFwcGVhcnMgaW4gQ2xvdWRGb3JtYXRpb24uICovXG4gICAgY29uc3QgaW5zaWdodHNMbG1SZWZpbmVFbnYgPSBwcm9jZXNzLmVudi5JTlNJR0hUU19MTE1fUkVGSU5FID09PSBcImZhbHNlXCIgPyBcImZhbHNlXCIgOiBcInRydWVcIjtcbiAgICAvKiogT3B0LW91dDogZW5hYmxlZCB1bmxlc3MgZGVwbG95IGV4cGxpY2l0bHkgc2V0cyBGRl8qIHRvIFwiZmFsc2VcIiAodGVzdCBwb3J0YWwgZnJpZW5kbHkpLiAqL1xuICAgIGNvbnN0IHBob3RvRm9vZExvZ0VudiA9IHByb2Nlc3MuZW52LkZGX1BIT1RPX0ZPT0RfTE9HID09PSBcImZhbHNlXCIgPyBcImZhbHNlXCIgOiBcInRydWVcIjtcbiAgICBjb25zdCBtZWFsTGlicmFyeUVudiA9IHByb2Nlc3MuZW52LkZGX01FQUxfTElCUkFSWSA9PT0gXCJmYWxzZVwiID8gXCJmYWxzZVwiIDogXCJ0cnVlXCI7XG4gICAgY29uc3QgbmxNZWFsUGFyc2VFbnYgPSBwcm9jZXNzLmVudi5GRl9OTF9NRUFMX1BBUlNFID09PSBcImZhbHNlXCIgPyBcImZhbHNlXCIgOiBcInRydWVcIjtcbiAgICBjb25zdCBib2R5Q29tcGFyZUFpRW52ID0gcHJvY2Vzcy5lbnYuRkZfQk9EWV9DT01QQVJFX0FJID09PSBcImZhbHNlXCIgPyBcImZhbHNlXCIgOiBcInRydWVcIjtcbiAgICAvKiogU2V0IG9uIHRoZSBtYWNoaW5lIHRoYXQgcnVucyBgY2RrIGRlcGxveWAgKG5ldmVyIGNvbW1pdCkuIE9taXR0ZWQgZW1wdHkgc3RyaW5nIHN0aWxsIGtlZXBzIHRoZSBlbnYgc2xvdCBzbyBmb29kIHZpc2lvbiBjYW4gYmUgZW5hYmxlZCB3aXRob3V0IHRoZSBjb25zb2xlLiAqL1xuICAgIGNvbnN0IGFudGhyb3BpY0FwaUtleURlcGxveSA9IHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZPy50cmltKCkgPz8gXCJcIjtcbiAgICBjb25zdCBhbnRocm9waWNGb29kVmlzaW9uTW9kZWwgPSBwcm9jZXNzLmVudi5BTlRIUk9QSUNfRk9PRF9WSVNJT05fTU9ERUw/LnRyaW0oKSA/PyBcIlwiO1xuICAgIGNvbnN0IG1lYWxObFBhcnNlTGFtYmRhID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsIFwiTWVhbE5sUGFyc2VMYW1iZGFcIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tbWVhbC1ubC1wYXJzZWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uXCIsIFwibGFtYmRhXCIsIFwibWVhbC1ubC1wYXJzZS50c1wiKSxcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlclwiLFxuICAgICAgcm9sZTogbWVhbE5sUGFyc2VMYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTUpLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTUVBTFNfVEFCTEVfTkFNRTogbWVhbHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIElOU0lHSFRfQ0FDSEVfVEFCTEVfTkFNRTogaW5zaWdodENhY2hlVGFibGUudGFibGVOYW1lLFxuICAgICAgICBGRl9NRUFMX0xJQlJBUlk6IG1lYWxMaWJyYXJ5RW52LFxuICAgICAgICBGRl9OTF9NRUFMX1BBUlNFOiBubE1lYWxQYXJzZUVudixcbiAgICAgICAgQU5USFJPUElDX0FQSV9LRVk6IGFudGhyb3BpY0FwaUtleURlcGxveSxcbiAgICAgICAgLi4uKHByb2Nlc3MuZW52LkFOVEhST1BJQ19OTF9NRUFMX01PREVMPy50cmltKClcbiAgICAgICAgICA/IHsgQU5USFJPUElDX05MX01FQUxfTU9ERUw6IHByb2Nlc3MuZW52LkFOVEhST1BJQ19OTF9NRUFMX01PREVMLnRyaW0oKSB9XG4gICAgICAgICAgOiB7fSksXG4gICAgICB9LFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgbWluaWZ5OiB0cnVlLFxuICAgICAgICBzb3VyY2VNYXA6IGZhbHNlLFxuICAgICAgICB0YXJnZXQ6IFwibm9kZTIwXCIsXG4gICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGFwaUxhbWJkYSA9IG5ldyBOb2RlanNGdW5jdGlvbih0aGlzLCBcIkJhY2tlbmRBcGlMYW1iZGFcIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYmFja2VuZC1hcGlgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLlwiLCBcImxhbWJkYVwiLCBcImh0dHAtYXBpLWhhbmRsZXIudHNcIiksXG4gICAgICBoYW5kbGVyOiBcImhhbmRsZXJcIixcbiAgICAgIHJvbGU6IGJhY2tlbmRMYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgRU5UUklFU19UQUJMRV9OQU1FOiBlbnRyaWVzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBTRVRUSU5HU19UQUJMRV9OQU1FOiBzZXR0aW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgSU5TSUdIVF9GRUVEQkFDS19UQUJMRV9OQU1FOiBpbnNpZ2h0RmVlZGJhY2tUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIElOU0lHSFRfQ0FDSEVfVEFCTEVfTkFNRTogaW5zaWdodENhY2hlVGFibGUudGFibGVOYW1lLFxuICAgICAgICBGRUFUVVJFX0ZMQUdfT1ZFUlJJREVTX1RBQkxFX05BTUU6IGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBTVUJTQ1JJUFRJT05TX1RBQkxFX05BTUU6IHN1YnNjcmlwdGlvbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEJJTExJTkdfRVZFTlRTX1RBQkxFX05BTUU6IGJpbGxpbmdFdmVudHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEZPT0RfTE9HX0VOVFJJRVNfVEFCTEVfTkFNRTogZm9vZExvZ0VudHJpZXNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIE1FQUxTX1RBQkxFX05BTUU6IG1lYWxzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBEQVlfTUVBTF9FTlRSSUVTX1RBQkxFX05BTUU6IGRheU1lYWxFbnRyaWVzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBQUk9HUkVTU19QSE9UT1NfVEFCTEVfTkFNRTogcHJvZ3Jlc3NQaG90b3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFBIT1RPX0JVQ0tFVF9OQU1FOiBwaG90b3NCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgVVNFUl9QT09MX0lEOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgICBBRE1JTl9FTUFJTFM6IGFkbWluRW1haWxzRGVwbG95LFxuICAgICAgICBVUExPQURfVVJMX1RUTF9TRUNPTkRTOiBcIjkwMFwiLFxuICAgICAgICBET1dOTE9BRF9VUkxfVFRMX1NFQ09ORFM6IFwiNjA0ODAwXCIsXG4gICAgICAgIElOU0lHSFRTX0xMTV9SRUZJTkU6IGluc2lnaHRzTGxtUmVmaW5lRW52LFxuICAgICAgICBGRl9QSE9UT19GT09EX0xPRzogcGhvdG9Gb29kTG9nRW52LFxuICAgICAgICBGRl9NRUFMX0xJQlJBUlk6IG1lYWxMaWJyYXJ5RW52LFxuICAgICAgICBGRl9OTF9NRUFMX1BBUlNFOiBubE1lYWxQYXJzZUVudixcbiAgICAgICAgRkZfQk9EWV9DT01QQVJFX0FJOiBib2R5Q29tcGFyZUFpRW52LFxuICAgICAgICBBTlRIUk9QSUNfQVBJX0tFWTogYW50aHJvcGljQXBpS2V5RGVwbG95LFxuICAgICAgICAuLi4oYW50aHJvcGljRm9vZFZpc2lvbk1vZGVsXG4gICAgICAgICAgPyB7IEFOVEhST1BJQ19GT09EX1ZJU0lPTl9NT0RFTDogYW50aHJvcGljRm9vZFZpc2lvbk1vZGVsIH1cbiAgICAgICAgICA6IHt9KSxcbiAgICAgIH0sXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBtaW5pZnk6IHRydWUsXG4gICAgICAgIHNvdXJjZU1hcDogZmFsc2UsXG4gICAgICAgIHRhcmdldDogXCJub2RlMjBcIixcbiAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgaW50ZWdyYXRpb24gPSBuZXcgYXBpZ3d2Mi5DZm5JbnRlZ3JhdGlvbih0aGlzLCBcIkJhY2tlbmRBcGlMYW1iZGFJbnRlZ3JhdGlvblwiLCB7XG4gICAgICBhcGlJZDogaHR0cEFwaS5hcGlJZCxcbiAgICAgIGludGVncmF0aW9uVHlwZTogXCJBV1NfUFJPWFlcIixcbiAgICAgIGludGVncmF0aW9uVXJpOiBhcGlMYW1iZGEuZnVuY3Rpb25Bcm4sXG4gICAgICBpbnRlZ3JhdGlvbk1ldGhvZDogXCJQT1NUXCIsXG4gICAgICBwYXlsb2FkRm9ybWF0VmVyc2lvbjogXCIyLjBcIixcbiAgICB9KTtcblxuICAgIGNvbnN0IG1lYWxObFBhcnNlSW50ZWdyYXRpb24gPSBuZXcgYXBpZ3d2Mi5DZm5JbnRlZ3JhdGlvbih0aGlzLCBcIk1lYWxObFBhcnNlTGFtYmRhSW50ZWdyYXRpb25cIiwge1xuICAgICAgYXBpSWQ6IGh0dHBBcGkuYXBpSWQsXG4gICAgICBpbnRlZ3JhdGlvblR5cGU6IFwiQVdTX1BST1hZXCIsXG4gICAgICBpbnRlZ3JhdGlvblVyaTogbWVhbE5sUGFyc2VMYW1iZGEuZnVuY3Rpb25Bcm4sXG4gICAgICBpbnRlZ3JhdGlvbk1ldGhvZDogXCJQT1NUXCIsXG4gICAgICBwYXlsb2FkRm9ybWF0VmVyc2lvbjogXCIyLjBcIixcbiAgICB9KTtcblxuICAgIGNvbnN0IGp3dEF1dGhvcml6ZXIgPSBuZXcgYXBpZ3d2Mi5DZm5BdXRob3JpemVyKHRoaXMsIFwiQ29nbml0b0p3dEF1dGhvcml6ZXJcIiwge1xuICAgICAgYXBpSWQ6IGh0dHBBcGkuYXBpSWQsXG4gICAgICBhdXRob3JpemVyVHlwZTogXCJKV1RcIixcbiAgICAgIG5hbWU6IFwiY29nbml0by1qd3QtYXV0aG9yaXplclwiLFxuICAgICAgaWRlbnRpdHlTb3VyY2U6IFtcIiRyZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uXCJdLFxuICAgICAgand0Q29uZmlndXJhdGlvbjoge1xuICAgICAgICBhdWRpZW5jZTogW3VzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWRdLFxuICAgICAgICBpc3N1ZXI6IGBodHRwczovL2NvZ25pdG8taWRwLiR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb20vJHt1c2VyUG9vbC51c2VyUG9vbElkfWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2VjdXJlZFJvdXRlczogQXJyYXk8eyByb3V0ZUtleTogc3RyaW5nOyBpZDogc3RyaW5nIH0+ID0gW1xuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL2VudHJpZXNcIiwgaWQ6IFwiRW50cmllc0dldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUFVUIC9lbnRyaWVzXCIsIGlkOiBcIkVudHJpZXNQdXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkRFTEVURSAvZW50cmllc1wiLCBpZDogXCJFbnRyaWVzRGVsZXRlUm91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3NldHRpbmdzXCIsIGlkOiBcIlNldHRpbmdzR2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQQVRDSCAvc2V0dGluZ3NcIiwgaWQ6IFwiU2V0dGluZ3NQYXRjaFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC9zdGF0c1wiLCBpZDogXCJTdGF0c0dldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvbWV0cmljcy9wYWdlLXZpZXdcIiwgaWQ6IFwiUGFnZVZpZXdQb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC9waG90b3MvdXBsb2FkLXVybFwiLCBpZDogXCJQaG90b1VwbG9hZFVybFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC9hZG1pbi91c2Vyc1wiLCBpZDogXCJBZG1pblVzZXJzR2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3YyL2luc2lnaHRzXCIsIGlkOiBcIkluc2lnaHRzVjJHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBPU1QgL3YyL2luc2lnaHRzL2ZlZWRiYWNrXCIsIGlkOiBcIkluc2lnaHRzVjJGZWVkYmFja1Bvc3RSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBPU1QgL3YyL2Zvb2QvZXN0aW1hdGVcIiwgaWQ6IFwiRm9vZEVzdGltYXRlUG9zdFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvZm9vZC9sb2ctY29uZmlybVwiLCBpZDogXCJGb29kTG9nQ29uZmlybVBvc3RSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBPU1QgL3YyL2FjdGl2aXR5L2VzdGltYXRlLWJ1cm5cIiwgaWQ6IFwiQWN0aXZpdHlFc3RpbWF0ZUJ1cm5Qb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9hY3Rpdml0eS9sb2dcIiwgaWQ6IFwiQWN0aXZpdHlMb2dQb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQQVRDSCAvdjIvYWN0aXZpdHkvY2FsaWJyYXRpb25cIiwgaWQ6IFwiQWN0aXZpdHlDYWxpYnJhdGlvblBhdGNoUm91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3YyL2FjdGl2aXR5L2VuZXJneS13ZWVrbHktc3VtbWFyeVwiLCBpZDogXCJFbmVyZ3lXZWVrbHlTdW1tYXJ5R2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3YyL3Byb2dyZXNzLXBob3Rvc1wiLCBpZDogXCJQcm9ncmVzc1Bob3Rvc0xpc3RHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBPU1QgL3YyL3Byb2dyZXNzLXBob3Rvc1wiLCBpZDogXCJQcm9ncmVzc1Bob3Rvc0NyZWF0ZVBvc3RSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkRFTEVURSAvdjIvcHJvZ3Jlc3MtcGhvdG9zL3twaG90b0lkfVwiLCBpZDogXCJQcm9ncmVzc1Bob3Rvc0RlbGV0ZVJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvcHJvZ3Jlc3MtcGhvdG9zL2Fzc2Vzc21lbnRcIiwgaWQ6IFwiUHJvZ3Jlc3NQaG90b3NBc3Nlc3NtZW50UG9zdFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvZm9vZC9tZWFsLWNvbXBsZXRlXCIsIGlkOiBcIkZvb2RNZWFsQ29tcGxldGVQb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3YyL21lYWxzXCIsIGlkOiBcIk1lYWxzTGlzdEdldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvbWVhbHNcIiwgaWQ6IFwiTWVhbHNDcmVhdGVQb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3YyL21lYWxzL3N1Z2dlc3QtbWF0Y2hcIiwgaWQ6IFwiTWVhbHNTdWdnZXN0TWF0Y2hHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvdjIvbWVhbHMve21lYWxJZH0vaGlzdG9yeVwiLCBpZDogXCJNZWFsc0hpc3RvcnlHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBBVENIIC92Mi9tZWFscy97bWVhbElkfVwiLCBpZDogXCJNZWFsc1BhdGNoUm91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJERUxFVEUgL3YyL21lYWxzL3ttZWFsSWR9XCIsIGlkOiBcIk1lYWxzRGVsZXRlUm91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3YyL2RheXMve2RheX0vbWVhbC1lbnRyaWVzXCIsIGlkOiBcIkRheU1lYWxFbnRyaWVzTGlzdEdldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvZGF5cy97ZGF5fS9tZWFsLWVudHJpZXNcIiwgaWQ6IFwiRGF5TWVhbEVudHJpZXNDcmVhdGVQb3N0Um91dGVcIiB9LFxuICAgICAge1xuICAgICAgICByb3V0ZUtleTogXCJERUxFVEUgL3YyL2RheXMve2RheX0vbWVhbC1lbnRyaWVzL3tlbnRyeUlkfVwiLFxuICAgICAgICBpZDogXCJEYXlNZWFsRW50cnlEZWxldGVSb3V0ZVwiLFxuICAgICAgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC9mZWF0dXJlLWZsYWdzXCIsIGlkOiBcIkZlYXR1cmVGbGFnc0dldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC9hZG1pbi9mbGFnc1wiLCBpZDogXCJBZG1pbkZsYWdzR2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQVVQgL2FkbWluL2ZsYWdzXCIsIGlkOiBcIkFkbWluRmxhZ3NQdXRSb3V0ZVwiIH0sXG4gICAgXTtcblxuICAgIGZvciAoY29uc3Qgcm91dGUgb2Ygc2VjdXJlZFJvdXRlcykge1xuICAgICAgbmV3IGFwaWd3djIuQ2ZuUm91dGUodGhpcywgcm91dGUuaWQsIHtcbiAgICAgICAgYXBpSWQ6IGh0dHBBcGkuYXBpSWQsXG4gICAgICAgIHJvdXRlS2V5OiByb3V0ZS5yb3V0ZUtleSxcbiAgICAgICAgdGFyZ2V0OiBgaW50ZWdyYXRpb25zLyR7aW50ZWdyYXRpb24ucmVmfWAsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBcIkpXVFwiLFxuICAgICAgICBhdXRob3JpemVySWQ6IGp3dEF1dGhvcml6ZXIucmVmLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgbmV3IGFwaWd3djIuQ2ZuUm91dGUodGhpcywgXCJNZWFsTmxQYXJzZVBvc3RSb3V0ZVwiLCB7XG4gICAgICBhcGlJZDogaHR0cEFwaS5hcGlJZCxcbiAgICAgIHJvdXRlS2V5OiBcIlBPU1QgL3YyL21lYWxzL25sLXBhcnNlXCIsXG4gICAgICB0YXJnZXQ6IGBpbnRlZ3JhdGlvbnMvJHttZWFsTmxQYXJzZUludGVncmF0aW9uLnJlZn1gLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IFwiSldUXCIsXG4gICAgICBhdXRob3JpemVySWQ6IGp3dEF1dGhvcml6ZXIucmVmLFxuICAgIH0pO1xuXG4gICAgbmV3IGFwaWd3djIuQ2ZuUm91dGUodGhpcywgXCJNZWFsTmxQYXJzZUludmFsaWRhdGVQb3N0Um91dGVcIiwge1xuICAgICAgYXBpSWQ6IGh0dHBBcGkuYXBpSWQsXG4gICAgICByb3V0ZUtleTogXCJQT1NUIC92Mi9tZWFscy9ubC1wYXJzZS9pbnZhbGlkYXRlLWluc2lnaHRzXCIsXG4gICAgICB0YXJnZXQ6IGBpbnRlZ3JhdGlvbnMvJHttZWFsTmxQYXJzZUludGVncmF0aW9uLnJlZn1gLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IFwiSldUXCIsXG4gICAgICBhdXRob3JpemVySWQ6IGp3dEF1dGhvcml6ZXIucmVmLFxuICAgIH0pO1xuXG4gICAgbmV3IGxhbWJkYS5DZm5QZXJtaXNzaW9uKHRoaXMsIFwiQXBpR2F0ZXdheUludm9rZVBlcm1pc3Npb25cIiwge1xuICAgICAgYWN0aW9uOiBcImxhbWJkYTpJbnZva2VGdW5jdGlvblwiLFxuICAgICAgZnVuY3Rpb25OYW1lOiBhcGlMYW1iZGEuZnVuY3Rpb25OYW1lLFxuICAgICAgcHJpbmNpcGFsOiBcImFwaWdhdGV3YXkuYW1hem9uYXdzLmNvbVwiLFxuICAgICAgc291cmNlQXJuOiBgYXJuOmF3czpleGVjdXRlLWFwaToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06JHtodHRwQXBpLmFwaUlkfS8qLyovKmAsXG4gICAgfSk7XG5cbiAgICBuZXcgbGFtYmRhLkNmblBlcm1pc3Npb24odGhpcywgXCJBcGlHYXRld2F5SW52b2tlTWVhbE5sUGFyc2VQZXJtaXNzaW9uXCIsIHtcbiAgICAgIGFjdGlvbjogXCJsYW1iZGE6SW52b2tlRnVuY3Rpb25cIixcbiAgICAgIGZ1bmN0aW9uTmFtZTogbWVhbE5sUGFyc2VMYW1iZGEuZnVuY3Rpb25OYW1lLFxuICAgICAgcHJpbmNpcGFsOiBcImFwaWdhdGV3YXkuYW1hem9uYXdzLmNvbVwiLFxuICAgICAgc291cmNlQXJuOiBgYXJuOmF3czpleGVjdXRlLWFwaToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06JHtodHRwQXBpLmFwaUlkfS8qLyovKmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlJlZ2lvblwiLCB7XG4gICAgICB2YWx1ZTogY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1yZWdpb25gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJBcGlVcmxcIiwge1xuICAgICAgdmFsdWU6IGh0dHBBcGkudXJsID8/IFwiTi9BXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYXBpLXVybGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlVzZXJQb29sSWRcIiwge1xuICAgICAgdmFsdWU6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tdXNlci1wb29sLWlkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVXNlclBvb2xDbGllbnRJZFwiLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS11c2VyLXBvb2wtY2xpZW50LWlkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiQnVja2V0TmFtZVwiLCB7XG4gICAgICB2YWx1ZTogcGhvdG9zQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYnVja2V0LW5hbWVgLFxuICAgIH0pO1xuICB9XG59XG4iXX0=