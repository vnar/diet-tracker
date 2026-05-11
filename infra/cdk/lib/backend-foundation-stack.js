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
            /** Branded verification email (subject line). From-address still Cognito default unless SES is configured. */
            userVerification: {
                emailSubject: "Ojas Health — verify your email",
                emailBody: "Welcome to Ojas Health.\n\nYour verification code is {####}\n\nOjas Health helps you log weight and habits for personal awareness. This is not medical advice.\n",
            },
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
        /** Opt-out: personalized coaching nudges + Pro gate on `/v2/insights` (same pattern as other FF_*). */
        const personalizedAiCoachingEnv = process.env.FF_PERSONALIZED_AI_COACHING === "false" ? "false" : "true";
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
            { routeKey: "POST /v2/voice-daily-log/parse", id: "VoiceDailyLogParsePostRoute" },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2VuZC1mb3VuZGF0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmFja2VuZC1mb3VuZGF0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyxtREFBbUQ7QUFDbkQsd0RBQXdEO0FBQ3hELHFEQUFxRDtBQUNyRCwyQ0FBMkM7QUFDM0MsaURBQWlEO0FBQ2pELHFFQUErRDtBQUMvRCx5Q0FBeUM7QUFDekMsa0NBQWtDO0FBRWxDLGdKQUFnSjtBQUNoSixTQUFTLDRCQUE0QjtJQUNuQyxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixJQUFJLEVBQUUsQ0FBQztJQUN2RCxPQUFPLEdBQUc7U0FDUCxLQUFLLENBQUMsR0FBRyxDQUFDO1NBQ1YsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7U0FDcEIsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2pDLENBQUM7QUFFRCxxR0FBcUc7QUFDckcsU0FBUyx3QkFBd0I7SUFDL0IsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixFQUFFLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxLQUFLLE1BQU0sQ0FBQztBQUNuRixDQUFDO0FBRUQsTUFBYSxzQkFBdUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNuRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sUUFBUSxHQUFHLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ3RELFlBQVksRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLFFBQVE7WUFDdkMs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RyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTTtZQUNoQyxVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyxTQUFTO1NBQ3ZDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQ2hDLEtBQUssRUFBRSxPQUFPLENBQUMsR0FBRyxJQUFJLEtBQUs7WUFDM0IsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsVUFBVTtTQUN4QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsUUFBUSxDQUFDLFVBQVU7WUFDMUIsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsZUFBZTtTQUM3QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzFDLEtBQUssRUFBRSxjQUFjLENBQUMsZ0JBQWdCO1lBQ3RDLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLHNCQUFzQjtTQUNwRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsWUFBWSxDQUFDLFVBQVU7WUFDOUIsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsY0FBYztTQUM1QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFoZEQsd0RBZ2RDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSBcImF3cy1jZGstbGliL2F3cy1jb2duaXRvXCI7XG5pbXBvcnQgKiBhcyBhcGlnd3YyIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheXYyXCI7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYVwiO1xuaW1wb3J0IHsgTm9kZWpzRnVuY3Rpb24gfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ub2RlanNcIjtcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcIm5vZGU6cGF0aFwiO1xuXG4vKiogQ29tbWEtc2VwYXJhdGVkIGh0dHBzIG9yaWdpbnMgYWxsb3dlZCB0byBQVVQvR0VUIHByb2dyZXNzL2Zvb2QgcGhvdG9zIHZpYSBwcmVzaWduZWQgVVJMcyAoZS5nLiBBbXBsaWZ5IGh0dHBzOi8vbWFpbi5kMTIzLmFtcGxpZnlhcHAuY29tKS4gKi9cbmZ1bmN0aW9uIHBob3RvQ29yc0V4dHJhT3JpZ2luc0Zyb21FbnYoKTogc3RyaW5nW10ge1xuICBjb25zdCByYXcgPSBwcm9jZXNzLmVudi5QSE9UT19DT1JTX0VYVFJBX09SSUdJTlMgPz8gXCJcIjtcbiAgcmV0dXJuIHJhd1xuICAgIC5zcGxpdChcIixcIilcbiAgICAubWFwKChzKSA9PiBzLnRyaW0oKSlcbiAgICAuZmlsdGVyKChzKSA9PiBzLmxlbmd0aCA+IDApO1xufVxuXG4vKiogVGVzdCAvIGludGVybmFsIHBvcnRhbHM6IFMzIGFsbG93cyBhbnkgT3JpZ2luIGZvciBwcmVzaWduZWQgUFVUL0dFVCAobmV2ZXIgdXNlIGluIHByb2R1Y3Rpb24pLiAqL1xuZnVuY3Rpb24gcGhvdG9Db3JzQWxsb3dBbGxPcmlnaW5zKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gcHJvY2Vzcy5lbnYuUEhPVE9fQ09SU19BTExPV19BTExfT1JJR0lOUz8udHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09IFwidHJ1ZVwiO1xufVxuXG5leHBvcnQgY2xhc3MgQmFja2VuZEZvdW5kYXRpb25TdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgXCJVc2VyUG9vbFwiLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS11c2Vyc2AsXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHsgZW1haWw6IHRydWUgfSxcbiAgICAgIGF1dG9WZXJpZnk6IHsgZW1haWw6IHRydWUgfSxcbiAgICAgIC8qKiBCcmFuZGVkIHZlcmlmaWNhdGlvbiBlbWFpbCAoc3ViamVjdCBsaW5lKS4gRnJvbS1hZGRyZXNzIHN0aWxsIENvZ25pdG8gZGVmYXVsdCB1bmxlc3MgU0VTIGlzIGNvbmZpZ3VyZWQuICovXG4gICAgICB1c2VyVmVyaWZpY2F0aW9uOiB7XG4gICAgICAgIGVtYWlsU3ViamVjdDogXCJPamFzIEhlYWx0aCDigJQgdmVyaWZ5IHlvdXIgZW1haWxcIixcbiAgICAgICAgZW1haWxCb2R5OlxuICAgICAgICAgIFwiV2VsY29tZSB0byBPamFzIEhlYWx0aC5cXG5cXG5Zb3VyIHZlcmlmaWNhdGlvbiBjb2RlIGlzIHsjIyMjfVxcblxcbk9qYXMgSGVhbHRoIGhlbHBzIHlvdSBsb2cgd2VpZ2h0IGFuZCBoYWJpdHMgZm9yIHBlcnNvbmFsIGF3YXJlbmVzcy4gVGhpcyBpcyBub3QgbWVkaWNhbCBhZHZpY2UuXFxuXCIsXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogZmFsc2UsXG4gICAgICB9LFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXNlclBvb2xDbGllbnQgPSB1c2VyUG9vbC5hZGRDbGllbnQoXCJVc2VyUG9vbENsaWVudFwiLCB7XG4gICAgICB1c2VyUG9vbENsaWVudE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS13ZWJgLFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgfSk7XG5cbiAgICBjb25zdCBodHRwQXBpID0gbmV3IGFwaWd3djIuSHR0cEFwaSh0aGlzLCBcIkh0dHBBcGlcIiwge1xuICAgICAgYXBpTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWh0dHAtYXBpYCxcbiAgICAgIGNvcnNQcmVmbGlnaHQ6IHtcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXCJBdXRob3JpemF0aW9uXCIsIFwiQ29udGVudC1UeXBlXCIsIFwieC1jb2duaXRvLWFjY2Vzcy10b2tlblwiXSxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBbXG4gICAgICAgICAgYXBpZ3d2Mi5Db3JzSHR0cE1ldGhvZC5HRVQsXG4gICAgICAgICAgYXBpZ3d2Mi5Db3JzSHR0cE1ldGhvZC5QT1NULFxuICAgICAgICAgIGFwaWd3djIuQ29yc0h0dHBNZXRob2QuUFVULFxuICAgICAgICAgIGFwaWd3djIuQ29yc0h0dHBNZXRob2QuREVMRVRFLFxuICAgICAgICAgIGFwaWd3djIuQ29yc0h0dHBNZXRob2QuUEFUQ0gsXG4gICAgICAgICAgYXBpZ3d2Mi5Db3JzSHR0cE1ldGhvZC5PUFRJT05TLFxuICAgICAgICBdLFxuICAgICAgICBhbGxvd09yaWdpbnM6IFtcIipcIl0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgZW50cmllc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiRW50cmllc1RhYmxlXCIsIHtcbiAgICAgIHRhYmxlTmFtZTogXCJFbnRyaWVzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJkYXRlXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IHNldHRpbmdzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJTZXR0aW5nc1RhYmxlXCIsIHtcbiAgICAgIHRhYmxlTmFtZTogXCJTZXR0aW5nc1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwidXNlcklkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IGluc2lnaHRGZWVkYmFja1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiSW5zaWdodEZlZWRiYWNrVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkluc2lnaHRGZWVkYmFja1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwidXNlcklkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwiaW5zaWdodFRzXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcbiAgICBjb25zdCBpbnNpZ2h0Q2FjaGVUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkluc2lnaHRDYWNoZVRhYmxlXCIsIHtcbiAgICAgIHRhYmxlTmFtZTogXCJJbnNpZ2h0Q2FjaGVcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInVzZXJJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcImNhY2hlS2V5XCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJGZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlXCIsIHtcbiAgICAgIHRhYmxlTmFtZTogXCJGZWF0dXJlRmxhZ092ZXJyaWRlc1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwidXNlcklkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwiZmxhZ1wiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7IHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25zVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJTdWJzY3JpcHRpb25zVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIlN1YnNjcmlwdGlvbnNcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInVzZXJJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7IHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICBjb25zdCBiaWxsaW5nRXZlbnRzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJCaWxsaW5nRXZlbnRzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkJpbGxpbmdFdmVudHNcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcImlkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IGZvb2RMb2dFbnRyaWVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJGb29kTG9nRW50cmllc1RhYmxlXCIsIHtcbiAgICAgIHRhYmxlTmFtZTogXCJGb29kTG9nRW50cmllc1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwidXNlcklkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwiZm9vZExvZ0lkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IG1lYWxzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJNZWFsc1RhYmxlXCIsIHtcbiAgICAgIHRhYmxlTmFtZTogXCJNZWFsc1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwidXNlcklkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwibWVhbElkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcbiAgICBtZWFsc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogXCJOYW1lTG9va3VwS2V5SW5kZXhcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcIm5hbWVMb29rdXBLZXlcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJtZWFsSWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXG4gICAgfSk7XG5cbiAgICBjb25zdCBkYXlNZWFsRW50cmllc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiRGF5TWVhbEVudHJpZXNUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiRGF5TWVhbEVudHJpZXNcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcImRheUtleVwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcImVudHJ5SWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuICAgIGRheU1lYWxFbnRyaWVzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiBcIk1lYWxIaXN0b3J5SW5kZXhcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcImxpYnJhcnlNZWFsSWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJtZWFsSGlzdG9yeVNrXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxuICAgIH0pO1xuICAgIGNvbnN0IHByb2dyZXNzUGhvdG9zVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJQcm9ncmVzc1Bob3Rvc1RhYmxlXCIsIHtcbiAgICAgIHRhYmxlTmFtZTogXCJQcm9ncmVzc1Bob3Rvc1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwidXNlcklkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwicGhvdG9JZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7IHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG4gICAgcHJvZ3Jlc3NQaG90b3NUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6IFwiVXNlckRhdGVJbmRleFwiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwidXNlcklkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwiZGF0ZVwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgICB9KTtcblxuICAgIGNvbnN0IHBob3RvQ29yc09yaWdpbnMgPSBwaG90b0NvcnNBbGxvd0FsbE9yaWdpbnMoKVxuICAgICAgPyBbXCIqXCJdXG4gICAgICA6IFtcbiAgICAgICAgICBcImh0dHBzOi8vb2phcy1oZWFsdGguY29tXCIsXG4gICAgICAgICAgXCJodHRwczovL3d3dy5vamFzLWhlYWx0aC5jb21cIixcbiAgICAgICAgICBcImh0dHA6Ly9sb2NhbGhvc3Q6MzAwMFwiLFxuICAgICAgICAgIFwiaHR0cDovLzEyNy4wLjAuMTozMDAwXCIsXG4gICAgICAgICAgXCJodHRwczovL2xvY2FsaG9zdDozMDAwXCIsXG4gICAgICAgICAgXCJodHRwczovLzEyNy4wLjAuMTozMDAwXCIsXG4gICAgICAgICAgLi4ucGhvdG9Db3JzRXh0cmFPcmlnaW5zRnJvbUVudigpLFxuICAgICAgICBdO1xuXG4gICAgY29uc3QgcGhvdG9zQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcIlBob3Rvc0J1Y2tldFwiLCB7XG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgZW5mb3JjZVNTTDogdHJ1ZSxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIGNvcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBbczMuSHR0cE1ldGhvZHMuUFVULCBzMy5IdHRwTWV0aG9kcy5HRVQsIHMzLkh0dHBNZXRob2RzLkhFQURdLFxuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBwaG90b0NvcnNPcmlnaW5zLFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbXCIqXCJdLFxuICAgICAgICAgIGV4cG9zZWRIZWFkZXJzOiBbXCJFVGFnXCIsIFwieC1hbXotcmVxdWVzdC1pZFwiLCBcIngtYW16LWlkLTJcIl0sXG4gICAgICAgICAgbWF4QWdlOiAzNjAwLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IGJhY2tlbmRMYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiQmFja2VuZExhbWJkYVJvbGVcIiwge1xuICAgICAgcm9sZU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1iYWNrZW5kLWxhbWJkYS1yb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwibGFtYmRhLmFtYXpvbmF3cy5jb21cIiksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFxuICAgICAgICAgIFwic2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZVwiLFxuICAgICAgICApLFxuICAgICAgXSxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkxhbWJkYSByb2xlIGZvciBEaWV0IFRyYWNrZXIgYmFja2VuZCBDUlVEIGhhbmRsZXJzLlwiLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcHJlc2lnbkxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJQcmVzaWduTGFtYmRhUm9sZVwiLCB7XG4gICAgICByb2xlTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LXByZXNpZ24tbGFtYmRhLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJsYW1iZGEuYW1hem9uYXdzLmNvbVwiKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXG4gICAgICAgICAgXCJzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlXCIsXG4gICAgICAgICksXG4gICAgICBdLFxuICAgICAgZGVzY3JpcHRpb246IFwiTGFtYmRhIHJvbGUgZm9yIGdlbmVyYXRpbmcgUzMgcHJlc2lnbmVkIHVwbG9hZC9kb3dubG9hZCBVUkxzLlwiLFxuICAgIH0pO1xuXG4gICAgZW50cmllc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgc2V0dGluZ3NUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYmFja2VuZExhbWJkYVJvbGUpO1xuICAgIGluc2lnaHRGZWVkYmFja1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgaW5zaWdodENhY2hlVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgc3Vic2NyaXB0aW9uc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgYmlsbGluZ0V2ZW50c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgZm9vZExvZ0VudHJpZXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYmFja2VuZExhbWJkYVJvbGUpO1xuICAgIG1lYWxzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBkYXlNZWFsRW50cmllc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgcHJvZ3Jlc3NQaG90b3NUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYmFja2VuZExhbWJkYVJvbGUpO1xuXG4gICAgY29uc3QgbWVhbE5sUGFyc2VMYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiTWVhbE5sUGFyc2VMYW1iZGFSb2xlXCIsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwibGFtYmRhLmFtYXpvbmF3cy5jb21cIiksXG4gICAgICBkZXNjcmlwdGlvbjogXCJOYXR1cmFsLWxhbmd1YWdlIG1lYWwgcGFyc2UgKHJlYWQgbGlicmFyeSwgaW52YWxpZGF0ZSBpbnNpZ2h0IGNhY2hlKVwiLFxuICAgIH0pO1xuICAgIG1lYWxObFBhcnNlTGFtYmRhUm9sZS5hZGRNYW5hZ2VkUG9saWN5KFxuICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFwic2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZVwiKSxcbiAgICApO1xuICAgIG1lYWxzVGFibGUuZ3JhbnRSZWFkRGF0YShtZWFsTmxQYXJzZUxhbWJkYVJvbGUpO1xuICAgIGluc2lnaHRDYWNoZVRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShtZWFsTmxQYXJzZUxhbWJkYVJvbGUpO1xuICAgIHBob3Rvc0J1Y2tldC5ncmFudFJlYWRXcml0ZShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgcGhvdG9zQnVja2V0LmdyYW50UmVhZFdyaXRlKHByZXNpZ25MYW1iZGFSb2xlKTtcblxuICAgIGJhY2tlbmRMYW1iZGFSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXCJjb2duaXRvLWlkcDpMaXN0VXNlcnNcIiwgXCJjb2duaXRvLWlkcDpHZXRVc2VyXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFt1c2VyUG9vbC51c2VyUG9vbEFybl0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gRGVmYXVsdCBtYXRjaGVzIGFwcCBvd25lcjsgb3ZlcnJpZGUgd2l0aCBBRE1JTl9FTUFJTFM9Li4uIGF0IGRlcGxveSB0aW1lIGlmIG5lZWRlZC5cbiAgICBjb25zdCBhZG1pbkVtYWlsc0RlcGxveSA9XG4gICAgICBwcm9jZXNzLmVudi5BRE1JTl9FTUFJTFM/LnRyaW0oKSB8fCBcInZpaGFybmFyQGdtYWlsLmNvbVwiO1xuICAgIC8qKiBTZXQgdG8gXCJmYWxzZVwiIG9uIGRlcGxveSBtYWNoaW5lIHRvIHNoaXAgTGFtYmRhIHdpdGggTExNIHJlZmluZSBkaXNhYmxlZC4gS2V5IG11c3QgYmUgc2V0IG9uIHRoZSBmdW5jdGlvbiBpbiBBV1MgKG5vdCBoZXJlKSBzbyBpdCBuZXZlciBhcHBlYXJzIGluIENsb3VkRm9ybWF0aW9uLiAqL1xuICAgIGNvbnN0IGluc2lnaHRzTGxtUmVmaW5lRW52ID0gcHJvY2Vzcy5lbnYuSU5TSUdIVFNfTExNX1JFRklORSA9PT0gXCJmYWxzZVwiID8gXCJmYWxzZVwiIDogXCJ0cnVlXCI7XG4gICAgLyoqIE9wdC1vdXQ6IGVuYWJsZWQgdW5sZXNzIGRlcGxveSBleHBsaWNpdGx5IHNldHMgRkZfKiB0byBcImZhbHNlXCIgKHRlc3QgcG9ydGFsIGZyaWVuZGx5KS4gKi9cbiAgICBjb25zdCBwaG90b0Zvb2RMb2dFbnYgPSBwcm9jZXNzLmVudi5GRl9QSE9UT19GT09EX0xPRyA9PT0gXCJmYWxzZVwiID8gXCJmYWxzZVwiIDogXCJ0cnVlXCI7XG4gICAgY29uc3QgbWVhbExpYnJhcnlFbnYgPSBwcm9jZXNzLmVudi5GRl9NRUFMX0xJQlJBUlkgPT09IFwiZmFsc2VcIiA/IFwiZmFsc2VcIiA6IFwidHJ1ZVwiO1xuICAgIGNvbnN0IG5sTWVhbFBhcnNlRW52ID0gcHJvY2Vzcy5lbnYuRkZfTkxfTUVBTF9QQVJTRSA9PT0gXCJmYWxzZVwiID8gXCJmYWxzZVwiIDogXCJ0cnVlXCI7XG4gICAgY29uc3QgYm9keUNvbXBhcmVBaUVudiA9IHByb2Nlc3MuZW52LkZGX0JPRFlfQ09NUEFSRV9BSSA9PT0gXCJmYWxzZVwiID8gXCJmYWxzZVwiIDogXCJ0cnVlXCI7XG4gICAgLyoqIE9wdC1vdXQ6IHBlcnNvbmFsaXplZCBjb2FjaGluZyBudWRnZXMgKyBQcm8gZ2F0ZSBvbiBgL3YyL2luc2lnaHRzYCAoc2FtZSBwYXR0ZXJuIGFzIG90aGVyIEZGXyopLiAqL1xuICAgIGNvbnN0IHBlcnNvbmFsaXplZEFpQ29hY2hpbmdFbnYgPVxuICAgICAgcHJvY2Vzcy5lbnYuRkZfUEVSU09OQUxJWkVEX0FJX0NPQUNISU5HID09PSBcImZhbHNlXCIgPyBcImZhbHNlXCIgOiBcInRydWVcIjtcbiAgICAvKiogU2V0IG9uIHRoZSBtYWNoaW5lIHRoYXQgcnVucyBgY2RrIGRlcGxveWAgKG5ldmVyIGNvbW1pdCkuIE9taXR0ZWQgZW1wdHkgc3RyaW5nIHN0aWxsIGtlZXBzIHRoZSBlbnYgc2xvdCBzbyBmb29kIHZpc2lvbiBjYW4gYmUgZW5hYmxlZCB3aXRob3V0IHRoZSBjb25zb2xlLiAqL1xuICAgIGNvbnN0IGFudGhyb3BpY0FwaUtleURlcGxveSA9IHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZPy50cmltKCkgPz8gXCJcIjtcbiAgICBjb25zdCBhbnRocm9waWNGb29kVmlzaW9uTW9kZWwgPSBwcm9jZXNzLmVudi5BTlRIUk9QSUNfRk9PRF9WSVNJT05fTU9ERUw/LnRyaW0oKSA/PyBcIlwiO1xuICAgIGNvbnN0IG1lYWxObFBhcnNlTGFtYmRhID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsIFwiTWVhbE5sUGFyc2VMYW1iZGFcIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tbWVhbC1ubC1wYXJzZWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uXCIsIFwibGFtYmRhXCIsIFwibWVhbC1ubC1wYXJzZS50c1wiKSxcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlclwiLFxuICAgICAgcm9sZTogbWVhbE5sUGFyc2VMYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTUpLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTUVBTFNfVEFCTEVfTkFNRTogbWVhbHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIElOU0lHSFRfQ0FDSEVfVEFCTEVfTkFNRTogaW5zaWdodENhY2hlVGFibGUudGFibGVOYW1lLFxuICAgICAgICBGRl9NRUFMX0xJQlJBUlk6IG1lYWxMaWJyYXJ5RW52LFxuICAgICAgICBGRl9OTF9NRUFMX1BBUlNFOiBubE1lYWxQYXJzZUVudixcbiAgICAgICAgQU5USFJPUElDX0FQSV9LRVk6IGFudGhyb3BpY0FwaUtleURlcGxveSxcbiAgICAgICAgLi4uKHByb2Nlc3MuZW52LkFOVEhST1BJQ19OTF9NRUFMX01PREVMPy50cmltKClcbiAgICAgICAgICA/IHsgQU5USFJPUElDX05MX01FQUxfTU9ERUw6IHByb2Nlc3MuZW52LkFOVEhST1BJQ19OTF9NRUFMX01PREVMLnRyaW0oKSB9XG4gICAgICAgICAgOiB7fSksXG4gICAgICB9LFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgbWluaWZ5OiB0cnVlLFxuICAgICAgICBzb3VyY2VNYXA6IGZhbHNlLFxuICAgICAgICB0YXJnZXQ6IFwibm9kZTIwXCIsXG4gICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGFwaUxhbWJkYSA9IG5ldyBOb2RlanNGdW5jdGlvbih0aGlzLCBcIkJhY2tlbmRBcGlMYW1iZGFcIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYmFja2VuZC1hcGlgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLlwiLCBcImxhbWJkYVwiLCBcImh0dHAtYXBpLWhhbmRsZXIudHNcIiksXG4gICAgICBoYW5kbGVyOiBcImhhbmRsZXJcIixcbiAgICAgIHJvbGU6IGJhY2tlbmRMYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgRU5UUklFU19UQUJMRV9OQU1FOiBlbnRyaWVzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBTRVRUSU5HU19UQUJMRV9OQU1FOiBzZXR0aW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgSU5TSUdIVF9GRUVEQkFDS19UQUJMRV9OQU1FOiBpbnNpZ2h0RmVlZGJhY2tUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIElOU0lHSFRfQ0FDSEVfVEFCTEVfTkFNRTogaW5zaWdodENhY2hlVGFibGUudGFibGVOYW1lLFxuICAgICAgICBGRUFUVVJFX0ZMQUdfT1ZFUlJJREVTX1RBQkxFX05BTUU6IGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBTVUJTQ1JJUFRJT05TX1RBQkxFX05BTUU6IHN1YnNjcmlwdGlvbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEJJTExJTkdfRVZFTlRTX1RBQkxFX05BTUU6IGJpbGxpbmdFdmVudHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEZPT0RfTE9HX0VOVFJJRVNfVEFCTEVfTkFNRTogZm9vZExvZ0VudHJpZXNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIE1FQUxTX1RBQkxFX05BTUU6IG1lYWxzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBEQVlfTUVBTF9FTlRSSUVTX1RBQkxFX05BTUU6IGRheU1lYWxFbnRyaWVzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBQUk9HUkVTU19QSE9UT1NfVEFCTEVfTkFNRTogcHJvZ3Jlc3NQaG90b3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFBIT1RPX0JVQ0tFVF9OQU1FOiBwaG90b3NCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgVVNFUl9QT09MX0lEOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgICBBRE1JTl9FTUFJTFM6IGFkbWluRW1haWxzRGVwbG95LFxuICAgICAgICBVUExPQURfVVJMX1RUTF9TRUNPTkRTOiBcIjkwMFwiLFxuICAgICAgICBET1dOTE9BRF9VUkxfVFRMX1NFQ09ORFM6IFwiNjA0ODAwXCIsXG4gICAgICAgIElOU0lHSFRTX0xMTV9SRUZJTkU6IGluc2lnaHRzTGxtUmVmaW5lRW52LFxuICAgICAgICBGRl9QSE9UT19GT09EX0xPRzogcGhvdG9Gb29kTG9nRW52LFxuICAgICAgICBGRl9NRUFMX0xJQlJBUlk6IG1lYWxMaWJyYXJ5RW52LFxuICAgICAgICBGRl9OTF9NRUFMX1BBUlNFOiBubE1lYWxQYXJzZUVudixcbiAgICAgICAgRkZfQk9EWV9DT01QQVJFX0FJOiBib2R5Q29tcGFyZUFpRW52LFxuICAgICAgICBGRl9QRVJTT05BTElaRURfQUlfQ09BQ0hJTkc6IHBlcnNvbmFsaXplZEFpQ29hY2hpbmdFbnYsXG4gICAgICAgIEFOVEhST1BJQ19BUElfS0VZOiBhbnRocm9waWNBcGlLZXlEZXBsb3ksXG4gICAgICAgIC4uLihhbnRocm9waWNGb29kVmlzaW9uTW9kZWxcbiAgICAgICAgICA/IHsgQU5USFJPUElDX0ZPT0RfVklTSU9OX01PREVMOiBhbnRocm9waWNGb29kVmlzaW9uTW9kZWwgfVxuICAgICAgICAgIDoge30pLFxuICAgICAgfSxcbiAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgIG1pbmlmeTogdHJ1ZSxcbiAgICAgICAgc291cmNlTWFwOiBmYWxzZSxcbiAgICAgICAgdGFyZ2V0OiBcIm5vZGUyMFwiLFxuICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBpbnRlZ3JhdGlvbiA9IG5ldyBhcGlnd3YyLkNmbkludGVncmF0aW9uKHRoaXMsIFwiQmFja2VuZEFwaUxhbWJkYUludGVncmF0aW9uXCIsIHtcbiAgICAgIGFwaUlkOiBodHRwQXBpLmFwaUlkLFxuICAgICAgaW50ZWdyYXRpb25UeXBlOiBcIkFXU19QUk9YWVwiLFxuICAgICAgaW50ZWdyYXRpb25Vcmk6IGFwaUxhbWJkYS5mdW5jdGlvbkFybixcbiAgICAgIGludGVncmF0aW9uTWV0aG9kOiBcIlBPU1RcIixcbiAgICAgIHBheWxvYWRGb3JtYXRWZXJzaW9uOiBcIjIuMFwiLFxuICAgIH0pO1xuXG4gICAgY29uc3QgbWVhbE5sUGFyc2VJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnd3YyLkNmbkludGVncmF0aW9uKHRoaXMsIFwiTWVhbE5sUGFyc2VMYW1iZGFJbnRlZ3JhdGlvblwiLCB7XG4gICAgICBhcGlJZDogaHR0cEFwaS5hcGlJZCxcbiAgICAgIGludGVncmF0aW9uVHlwZTogXCJBV1NfUFJPWFlcIixcbiAgICAgIGludGVncmF0aW9uVXJpOiBtZWFsTmxQYXJzZUxhbWJkYS5mdW5jdGlvbkFybixcbiAgICAgIGludGVncmF0aW9uTWV0aG9kOiBcIlBPU1RcIixcbiAgICAgIHBheWxvYWRGb3JtYXRWZXJzaW9uOiBcIjIuMFwiLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgand0QXV0aG9yaXplciA9IG5ldyBhcGlnd3YyLkNmbkF1dGhvcml6ZXIodGhpcywgXCJDb2duaXRvSnd0QXV0aG9yaXplclwiLCB7XG4gICAgICBhcGlJZDogaHR0cEFwaS5hcGlJZCxcbiAgICAgIGF1dGhvcml6ZXJUeXBlOiBcIkpXVFwiLFxuICAgICAgbmFtZTogXCJjb2duaXRvLWp3dC1hdXRob3JpemVyXCIsXG4gICAgICBpZGVudGl0eVNvdXJjZTogW1wiJHJlcXVlc3QuaGVhZGVyLkF1dGhvcml6YXRpb25cIl0sXG4gICAgICBqd3RDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIGF1ZGllbmNlOiBbdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZF0sXG4gICAgICAgIGlzc3VlcjogYGh0dHBzOi8vY29nbml0by1pZHAuJHt0aGlzLnJlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke3VzZXJQb29sLnVzZXJQb29sSWR9YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBzZWN1cmVkUm91dGVzOiBBcnJheTx7IHJvdXRlS2V5OiBzdHJpbmc7IGlkOiBzdHJpbmcgfT4gPSBbXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvZW50cmllc1wiLCBpZDogXCJFbnRyaWVzR2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQVVQgL2VudHJpZXNcIiwgaWQ6IFwiRW50cmllc1B1dFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiREVMRVRFIC9lbnRyaWVzXCIsIGlkOiBcIkVudHJpZXNEZWxldGVSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvc2V0dGluZ3NcIiwgaWQ6IFwiU2V0dGluZ3NHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBBVENIIC9zZXR0aW5nc1wiLCBpZDogXCJTZXR0aW5nc1BhdGNoUm91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3N0YXRzXCIsIGlkOiBcIlN0YXRzR2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC9tZXRyaWNzL3BhZ2Utdmlld1wiLCBpZDogXCJQYWdlVmlld1Bvc3RSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBPU1QgL3Bob3Rvcy91cGxvYWQtdXJsXCIsIGlkOiBcIlBob3RvVXBsb2FkVXJsUm91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL2FkbWluL3VzZXJzXCIsIGlkOiBcIkFkbWluVXNlcnNHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvdjIvaW5zaWdodHNcIiwgaWQ6IFwiSW5zaWdodHNWMkdldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvaW5zaWdodHMvZmVlZGJhY2tcIiwgaWQ6IFwiSW5zaWdodHNWMkZlZWRiYWNrUG9zdFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvZm9vZC9lc3RpbWF0ZVwiLCBpZDogXCJGb29kRXN0aW1hdGVQb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9mb29kL2xvZy1jb25maXJtXCIsIGlkOiBcIkZvb2RMb2dDb25maXJtUG9zdFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvYWN0aXZpdHkvZXN0aW1hdGUtYnVyblwiLCBpZDogXCJBY3Rpdml0eUVzdGltYXRlQnVyblBvc3RSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBPU1QgL3YyL3ZvaWNlLWRhaWx5LWxvZy9wYXJzZVwiLCBpZDogXCJWb2ljZURhaWx5TG9nUGFyc2VQb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9hY3Rpdml0eS9sb2dcIiwgaWQ6IFwiQWN0aXZpdHlMb2dQb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQQVRDSCAvdjIvYWN0aXZpdHkvY2FsaWJyYXRpb25cIiwgaWQ6IFwiQWN0aXZpdHlDYWxpYnJhdGlvblBhdGNoUm91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3YyL2FjdGl2aXR5L2VuZXJneS13ZWVrbHktc3VtbWFyeVwiLCBpZDogXCJFbmVyZ3lXZWVrbHlTdW1tYXJ5R2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3YyL3Byb2dyZXNzLXBob3Rvc1wiLCBpZDogXCJQcm9ncmVzc1Bob3Rvc0xpc3RHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBPU1QgL3YyL3Byb2dyZXNzLXBob3Rvc1wiLCBpZDogXCJQcm9ncmVzc1Bob3Rvc0NyZWF0ZVBvc3RSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkRFTEVURSAvdjIvcHJvZ3Jlc3MtcGhvdG9zL3twaG90b0lkfVwiLCBpZDogXCJQcm9ncmVzc1Bob3Rvc0RlbGV0ZVJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvcHJvZ3Jlc3MtcGhvdG9zL2Fzc2Vzc21lbnRcIiwgaWQ6IFwiUHJvZ3Jlc3NQaG90b3NBc3Nlc3NtZW50UG9zdFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvZm9vZC9tZWFsLWNvbXBsZXRlXCIsIGlkOiBcIkZvb2RNZWFsQ29tcGxldGVQb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3YyL21lYWxzXCIsIGlkOiBcIk1lYWxzTGlzdEdldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvbWVhbHNcIiwgaWQ6IFwiTWVhbHNDcmVhdGVQb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3YyL21lYWxzL3N1Z2dlc3QtbWF0Y2hcIiwgaWQ6IFwiTWVhbHNTdWdnZXN0TWF0Y2hHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvdjIvbWVhbHMve21lYWxJZH0vaGlzdG9yeVwiLCBpZDogXCJNZWFsc0hpc3RvcnlHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBBVENIIC92Mi9tZWFscy97bWVhbElkfVwiLCBpZDogXCJNZWFsc1BhdGNoUm91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJERUxFVEUgL3YyL21lYWxzL3ttZWFsSWR9XCIsIGlkOiBcIk1lYWxzRGVsZXRlUm91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL3YyL2RheXMve2RheX0vbWVhbC1lbnRyaWVzXCIsIGlkOiBcIkRheU1lYWxFbnRyaWVzTGlzdEdldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvZGF5cy97ZGF5fS9tZWFsLWVudHJpZXNcIiwgaWQ6IFwiRGF5TWVhbEVudHJpZXNDcmVhdGVQb3N0Um91dGVcIiB9LFxuICAgICAge1xuICAgICAgICByb3V0ZUtleTogXCJERUxFVEUgL3YyL2RheXMve2RheX0vbWVhbC1lbnRyaWVzL3tlbnRyeUlkfVwiLFxuICAgICAgICBpZDogXCJEYXlNZWFsRW50cnlEZWxldGVSb3V0ZVwiLFxuICAgICAgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC9mZWF0dXJlLWZsYWdzXCIsIGlkOiBcIkZlYXR1cmVGbGFnc0dldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC9hZG1pbi9mbGFnc1wiLCBpZDogXCJBZG1pbkZsYWdzR2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQVVQgL2FkbWluL2ZsYWdzXCIsIGlkOiBcIkFkbWluRmxhZ3NQdXRSb3V0ZVwiIH0sXG4gICAgXTtcblxuICAgIGZvciAoY29uc3Qgcm91dGUgb2Ygc2VjdXJlZFJvdXRlcykge1xuICAgICAgbmV3IGFwaWd3djIuQ2ZuUm91dGUodGhpcywgcm91dGUuaWQsIHtcbiAgICAgICAgYXBpSWQ6IGh0dHBBcGkuYXBpSWQsXG4gICAgICAgIHJvdXRlS2V5OiByb3V0ZS5yb3V0ZUtleSxcbiAgICAgICAgdGFyZ2V0OiBgaW50ZWdyYXRpb25zLyR7aW50ZWdyYXRpb24ucmVmfWAsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBcIkpXVFwiLFxuICAgICAgICBhdXRob3JpemVySWQ6IGp3dEF1dGhvcml6ZXIucmVmLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgbmV3IGFwaWd3djIuQ2ZuUm91dGUodGhpcywgXCJNZWFsTmxQYXJzZVBvc3RSb3V0ZVwiLCB7XG4gICAgICBhcGlJZDogaHR0cEFwaS5hcGlJZCxcbiAgICAgIHJvdXRlS2V5OiBcIlBPU1QgL3YyL21lYWxzL25sLXBhcnNlXCIsXG4gICAgICB0YXJnZXQ6IGBpbnRlZ3JhdGlvbnMvJHttZWFsTmxQYXJzZUludGVncmF0aW9uLnJlZn1gLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IFwiSldUXCIsXG4gICAgICBhdXRob3JpemVySWQ6IGp3dEF1dGhvcml6ZXIucmVmLFxuICAgIH0pO1xuXG4gICAgbmV3IGFwaWd3djIuQ2ZuUm91dGUodGhpcywgXCJNZWFsTmxQYXJzZUludmFsaWRhdGVQb3N0Um91dGVcIiwge1xuICAgICAgYXBpSWQ6IGh0dHBBcGkuYXBpSWQsXG4gICAgICByb3V0ZUtleTogXCJQT1NUIC92Mi9tZWFscy9ubC1wYXJzZS9pbnZhbGlkYXRlLWluc2lnaHRzXCIsXG4gICAgICB0YXJnZXQ6IGBpbnRlZ3JhdGlvbnMvJHttZWFsTmxQYXJzZUludGVncmF0aW9uLnJlZn1gLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IFwiSldUXCIsXG4gICAgICBhdXRob3JpemVySWQ6IGp3dEF1dGhvcml6ZXIucmVmLFxuICAgIH0pO1xuXG4gICAgbmV3IGxhbWJkYS5DZm5QZXJtaXNzaW9uKHRoaXMsIFwiQXBpR2F0ZXdheUludm9rZVBlcm1pc3Npb25cIiwge1xuICAgICAgYWN0aW9uOiBcImxhbWJkYTpJbnZva2VGdW5jdGlvblwiLFxuICAgICAgZnVuY3Rpb25OYW1lOiBhcGlMYW1iZGEuZnVuY3Rpb25OYW1lLFxuICAgICAgcHJpbmNpcGFsOiBcImFwaWdhdGV3YXkuYW1hem9uYXdzLmNvbVwiLFxuICAgICAgc291cmNlQXJuOiBgYXJuOmF3czpleGVjdXRlLWFwaToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06JHtodHRwQXBpLmFwaUlkfS8qLyovKmAsXG4gICAgfSk7XG5cbiAgICBuZXcgbGFtYmRhLkNmblBlcm1pc3Npb24odGhpcywgXCJBcGlHYXRld2F5SW52b2tlTWVhbE5sUGFyc2VQZXJtaXNzaW9uXCIsIHtcbiAgICAgIGFjdGlvbjogXCJsYW1iZGE6SW52b2tlRnVuY3Rpb25cIixcbiAgICAgIGZ1bmN0aW9uTmFtZTogbWVhbE5sUGFyc2VMYW1iZGEuZnVuY3Rpb25OYW1lLFxuICAgICAgcHJpbmNpcGFsOiBcImFwaWdhdGV3YXkuYW1hem9uYXdzLmNvbVwiLFxuICAgICAgc291cmNlQXJuOiBgYXJuOmF3czpleGVjdXRlLWFwaToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06JHtodHRwQXBpLmFwaUlkfS8qLyovKmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlJlZ2lvblwiLCB7XG4gICAgICB2YWx1ZTogY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1yZWdpb25gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJBcGlVcmxcIiwge1xuICAgICAgdmFsdWU6IGh0dHBBcGkudXJsID8/IFwiTi9BXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYXBpLXVybGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlVzZXJQb29sSWRcIiwge1xuICAgICAgdmFsdWU6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tdXNlci1wb29sLWlkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVXNlclBvb2xDbGllbnRJZFwiLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS11c2VyLXBvb2wtY2xpZW50LWlkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiQnVja2V0TmFtZVwiLCB7XG4gICAgICB2YWx1ZTogcGhvdG9zQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYnVja2V0LW5hbWVgLFxuICAgIH0pO1xuICB9XG59XG4iXX0=