"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendFoundationStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
const apigwv2 = __importStar(require("aws-cdk-lib/aws-apigatewayv2"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const events = __importStar(require("aws-cdk-lib/aws-events"));
const targets = __importStar(require("aws-cdk-lib/aws-events-targets"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const aws_lambda_nodejs_1 = require("aws-cdk-lib/aws-lambda-nodejs");
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const path = __importStar(require("node:path"));
const defaultTransactionalFrom_1 = require("../../../lib/email/defaultTransactionalFrom");
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
        /** Idempotency for scheduled weekly digest emails (userId + weekStart). */
        const weeklyDigestLogTable = new dynamodb.Table(this, "WeeklyDigestLogTable", {
            tableName: "WeeklyDigestLog",
            partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
            sortKey: { name: "weekStart", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
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
        backendLambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ["ses:SendEmail", "ses:SendRawEmail"],
            resources: ["*"],
        }));
        // Default admin allowlist; override with ADMIN_EMAILS=... at deploy time (comma-separated).
        const adminEmailsDeploy = process.env.ADMIN_EMAILS?.trim() || "ojashealth2026@gmail.com";
        /** Set to "false" on deploy machine to ship Lambda with LLM refine disabled. Key must be set on the function in AWS (not here) so it never appears in CloudFormation. */
        const insightsLlmRefineEnv = process.env.INSIGHTS_LLM_REFINE === "false" ? "false" : "true";
        /** Opt-out: enabled unless deploy explicitly sets FF_* to "false" (test portal friendly). */
        const photoFoodLogEnv = process.env.FF_PHOTO_FOOD_LOG === "false" ? "false" : "true";
        const mealLibraryEnv = process.env.FF_MEAL_LIBRARY === "false" ? "false" : "true";
        const nlMealParseEnv = process.env.FF_NL_MEAL_PARSE === "false" ? "false" : "true";
        const bodyCompareAiEnv = process.env.FF_BODY_COMPARE_AI === "false" ? "false" : "true";
        /** Opt-out: personalized coaching nudges + Pro gate on `/v2/insights` (same pattern as other FF_*). */
        const personalizedAiCoachingEnv = process.env.FF_PERSONALIZED_AI_COACHING === "false" ? "false" : "true";
        /** Opt-out: weekly SES send route enabled unless deploy sets FF_WEEKLY_REPORT_EMAIL=false. Requires TRANSACTIONAL_EMAIL_FROM. */
        const weeklyReportEmailEnv = process.env.FF_WEEKLY_REPORT_EMAIL === "false" ? "false" : "true";
        /** Default SES From when unset; must be a verified identity in SES (same region). Override at deploy. */
        const transactionalEmailFromDeploy = process.env.TRANSACTIONAL_EMAIL_FROM?.trim() || defaultTransactionalFrom_1.DEFAULT_TRANSACTIONAL_EMAIL_FROM;
        const transactionalEmailFromNameDeploy = process.env.TRANSACTIONAL_EMAIL_FROM_NAME?.trim() || "Ojas Health";
        const transactionalEmailReplyToDeploy = process.env.TRANSACTIONAL_EMAIL_REPLY_TO?.trim() ?? "";
        const transactionalEmailMessageIdDomainDeploy = process.env.TRANSACTIONAL_EMAIL_MESSAGE_ID_DOMAIN?.trim() ?? "";
        const transactionalEmailListUnsubscribeUrlDeploy = process.env.TRANSACTIONAL_EMAIL_LIST_UNSUBSCRIBE_URL?.trim() ?? "";
        /** List-ID + default List-Unsubscribe https://{domain}/ (GET only; one-click POST opt-in). */
        const transactionalEmailBrandDomainDeploy = process.env.TRANSACTIONAL_EMAIL_BRAND_DOMAIN?.trim() || "ojas-health.com";
        const transactionalEmailListUnsubscribeOneClickDeploy = process.env.TRANSACTIONAL_EMAIL_LIST_UNSUBSCRIBE_ONE_CLICK === "true" ? "true" : "false";
        /** Opt-in: EventBridge invokes weekly digest Lambda (Mondays UTC). Users must set `weeklyDigestEmail` in Settings. */
        const weeklyDigestSchedulerEnv = process.env.FF_WEEKLY_DIGEST_SCHEDULER === "true" ? "true" : "false";
        /** Set on the machine that runs `cdk deploy` (never commit). Omitted empty string still keeps the env slot so food vision can be enabled without the console. */
        const anthropicApiKeyDeploy = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
        const anthropicFoodVisionModel = process.env.ANTHROPIC_FOOD_VISION_MODEL?.trim() ?? "";
        /** Set at deploy time; empty disables Stripe routes (503) until configured. */
        const stripeSecretKeyDeploy = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
        const billingAppUrlDeploy = process.env.BILLING_APP_URL?.trim() ?? process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
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
                FF_WEEKLY_REPORT_EMAIL: weeklyReportEmailEnv,
                TRANSACTIONAL_EMAIL_FROM: transactionalEmailFromDeploy,
                TRANSACTIONAL_EMAIL_FROM_NAME: transactionalEmailFromNameDeploy,
                TRANSACTIONAL_EMAIL_BRAND_DOMAIN: transactionalEmailBrandDomainDeploy,
                TRANSACTIONAL_EMAIL_LIST_UNSUBSCRIBE_ONE_CLICK: transactionalEmailListUnsubscribeOneClickDeploy,
                ...(transactionalEmailReplyToDeploy
                    ? { TRANSACTIONAL_EMAIL_REPLY_TO: transactionalEmailReplyToDeploy }
                    : {}),
                ...(transactionalEmailMessageIdDomainDeploy
                    ? { TRANSACTIONAL_EMAIL_MESSAGE_ID_DOMAIN: transactionalEmailMessageIdDomainDeploy }
                    : {}),
                ...(transactionalEmailListUnsubscribeUrlDeploy
                    ? { TRANSACTIONAL_EMAIL_LIST_UNSUBSCRIBE_URL: transactionalEmailListUnsubscribeUrlDeploy }
                    : {}),
                ANTHROPIC_API_KEY: anthropicApiKeyDeploy,
                STRIPE_SECRET_KEY: stripeSecretKeyDeploy,
                ...(billingAppUrlDeploy ? { BILLING_APP_URL: billingAppUrlDeploy } : {}),
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
        const weeklyDigestLambdaRole = new iam.Role(this, "WeeklyDigestLambdaRole", {
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            description: "Scheduled weekly digest (rule-based report + SES) for opted-in users",
        });
        weeklyDigestLambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));
        entriesTable.grantReadData(weeklyDigestLambdaRole);
        settingsTable.grantReadData(weeklyDigestLambdaRole);
        progressPhotosTable.grantReadData(weeklyDigestLambdaRole);
        weeklyDigestLogTable.grantReadWriteData(weeklyDigestLambdaRole);
        weeklyDigestLambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ["cognito-idp:ListUsers"],
            resources: [userPool.userPoolArn],
        }));
        weeklyDigestLambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ["ses:SendEmail", "ses:SendRawEmail"],
            resources: ["*"],
        }));
        const weeklyDigestLambda = new aws_lambda_nodejs_1.NodejsFunction(this, "WeeklyDigestLambda", {
            functionName: `${this.stackName}-weekly-digest`,
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: path.join(__dirname, "..", "lambda", "weekly-digest-scheduler.ts"),
            handler: "handler",
            role: weeklyDigestLambdaRole,
            timeout: cdk.Duration.minutes(15),
            memorySize: 512,
            environment: {
                ENTRIES_TABLE_NAME: entriesTable.tableName,
                SETTINGS_TABLE_NAME: settingsTable.tableName,
                PROGRESS_PHOTOS_TABLE_NAME: progressPhotosTable.tableName,
                WEEKLY_DIGEST_LOG_TABLE_NAME: weeklyDigestLogTable.tableName,
                USER_POOL_ID: userPool.userPoolId,
                FF_WEEKLY_DIGEST_SCHEDULER: weeklyDigestSchedulerEnv,
                FF_WEEKLY_REPORT_EMAIL: weeklyReportEmailEnv,
                TRANSACTIONAL_EMAIL_FROM: transactionalEmailFromDeploy,
                TRANSACTIONAL_EMAIL_FROM_NAME: transactionalEmailFromNameDeploy,
                TRANSACTIONAL_EMAIL_BRAND_DOMAIN: transactionalEmailBrandDomainDeploy,
                TRANSACTIONAL_EMAIL_LIST_UNSUBSCRIBE_ONE_CLICK: transactionalEmailListUnsubscribeOneClickDeploy,
                ...(transactionalEmailReplyToDeploy
                    ? { TRANSACTIONAL_EMAIL_REPLY_TO: transactionalEmailReplyToDeploy }
                    : {}),
                ...(transactionalEmailMessageIdDomainDeploy
                    ? { TRANSACTIONAL_EMAIL_MESSAGE_ID_DOMAIN: transactionalEmailMessageIdDomainDeploy }
                    : {}),
                ...(transactionalEmailListUnsubscribeUrlDeploy
                    ? { TRANSACTIONAL_EMAIL_LIST_UNSUBSCRIBE_URL: transactionalEmailListUnsubscribeUrlDeploy }
                    : {}),
                ...(process.env.WEEKLY_DIGEST_MAX_USERS_PER_RUN?.trim()
                    ? { WEEKLY_DIGEST_MAX_USERS_PER_RUN: process.env.WEEKLY_DIGEST_MAX_USERS_PER_RUN.trim() }
                    : {}),
            },
            bundling: {
                minify: true,
                sourceMap: false,
                target: "node20",
                forceDockerBundling: false,
            },
        });
        const weeklyDigestRule = new events.Rule(this, "WeeklyDigestMondayUtcRule", {
            schedule: events.Schedule.cron({ minute: "30", hour: "14", weekDay: "MON", month: "*", year: "*" }),
            enabled: weeklyDigestSchedulerEnv === "true",
            description: "Sends prior-week digest (UTC calendar). Enable with FF_WEEKLY_DIGEST_SCHEDULER=true at deploy.",
        });
        weeklyDigestRule.addTarget(new targets.LambdaFunction(weeklyDigestLambda));
        const integration = new apigwv2.CfnIntegration(this, "BackendApiLambdaIntegration", {
            apiId: httpApi.apiId,
            integrationType: "AWS_PROXY",
            integrationUri: apiLambda.functionArn,
            integrationMethod: "POST",
            payloadFormatVersion: "2.0",
            /** HTTP API max is 30s; match it so long-running routes (voice LLM) fail with HTTP instead of a client "network" drop. */
            timeoutInMillis: 30000,
        });
        const mealNlParseIntegration = new apigwv2.CfnIntegration(this, "MealNlParseLambdaIntegration", {
            apiId: httpApi.apiId,
            integrationType: "AWS_PROXY",
            integrationUri: mealNlParseLambda.functionArn,
            integrationMethod: "POST",
            payloadFormatVersion: "2.0",
            timeoutInMillis: 15000,
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
            { routeKey: "POST /v2/billing/checkout-session", id: "BillingCheckoutSessionPostRoute" },
            { routeKey: "POST /v2/billing/portal", id: "BillingPortalPostRoute" },
            { routeKey: "POST /v2/weekly-report/send-email", id: "WeeklyReportSendEmailPostRoute" },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2VuZC1mb3VuZGF0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmFja2VuZC1mb3VuZGF0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUVuQyxpRUFBbUQ7QUFDbkQsc0VBQXdEO0FBQ3hELG1FQUFxRDtBQUNyRCwrREFBaUQ7QUFDakQsd0VBQTBEO0FBQzFELHlEQUEyQztBQUMzQywrREFBaUQ7QUFDakQscUVBQStEO0FBQy9ELHVEQUF5QztBQUN6QyxnREFBa0M7QUFDbEMsMEZBQStGO0FBRS9GLGdKQUFnSjtBQUNoSixTQUFTLDRCQUE0QjtJQUNuQyxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixJQUFJLEVBQUUsQ0FBQztJQUN2RCxPQUFPLEdBQUc7U0FDUCxLQUFLLENBQUMsR0FBRyxDQUFDO1NBQ1YsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7U0FDcEIsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2pDLENBQUM7QUFFRCxxR0FBcUc7QUFDckcsU0FBUyx3QkFBd0I7SUFDL0IsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixFQUFFLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxLQUFLLE1BQU0sQ0FBQztBQUNuRixDQUFDO0FBRUQsTUFBYSxzQkFBdUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNuRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sUUFBUSxHQUFHLElBQUksT0FBTyxDQUFDLFFBQVEs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WSxFQUFFO1lBQ3BDLEtBQUssRUFBRSxZQUFZLENBQUMsVUFBVTtZQUM5QixVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyxjQUFjO1NBQzVDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXRsQkQsd0RBc2xCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY29nbml0b1wiO1xuaW1wb3J0ICogYXMgYXBpZ3d2MiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2MlwiO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1keW5hbW9kYlwiO1xuaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZXZlbnRzXCI7XG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHNcIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhXCI7XG5pbXBvcnQgeyBOb2RlanNGdW5jdGlvbiB9IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLW5vZGVqc1wiO1xuaW1wb3J0ICogYXMgczMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zM1wiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwibm9kZTpwYXRoXCI7XG5pbXBvcnQgeyBERUZBVUxUX1RSQU5TQUNUSU9OQUxfRU1BSUxfRlJPTSB9IGZyb20gXCIuLi8uLi8uLi9saWIvZW1haWwvZGVmYXVsdFRyYW5zYWN0aW9uYWxGcm9tXCI7XG5cbi8qKiBDb21tYS1zZXBhcmF0ZWQgaHR0cHMgb3JpZ2lucyBhbGxvd2VkIHRvIFBVVC9HRVQgcHJvZ3Jlc3MvZm9vZCBwaG90b3MgdmlhIHByZXNpZ25lZCBVUkxzIChlLmcuIEFtcGxpZnkgaHR0cHM6Ly9tYWluLmQxMjMuYW1wbGlmeWFwcC5jb20pLiAqL1xuZnVuY3Rpb24gcGhvdG9Db3JzRXh0cmFPcmlnaW5zRnJvbUVudigpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHJhdyA9IHByb2Nlc3MuZW52LlBIT1RPX0NPUlNfRVhUUkFfT1JJR0lOUyA/PyBcIlwiO1xuICByZXR1cm4gcmF3XG4gICAgLnNwbGl0KFwiLFwiKVxuICAgIC5tYXAoKHMpID0+IHMudHJpbSgpKVxuICAgIC5maWx0ZXIoKHMpID0+IHMubGVuZ3RoID4gMCk7XG59XG5cbi8qKiBUZXN0IC8gaW50ZXJuYWwgcG9ydGFsczogUzMgYWxsb3dzIGFueSBPcmlnaW4gZm9yIHByZXNpZ25lZCBQVVQvR0VUIChuZXZlciB1c2UgaW4gcHJvZHVjdGlvbikuICovXG5mdW5jdGlvbiBwaG90b0NvcnNBbGxvd0FsbE9yaWdpbnMoKTogYm9vbGVhbiB7XG4gIHJldHVybiBwcm9jZXNzLmVudi5QSE9UT19DT1JTX0FMTE9XX0FMTF9PUklHSU5TPy50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gXCJ0cnVlXCI7XG59XG5cbmV4cG9ydCBjbGFzcyBCYWNrZW5kRm91bmRhdGlvblN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCBcIlVzZXJQb29sXCIsIHtcbiAgICAgIHVzZXJQb29sTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LXVzZXJzYCxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxuICAgICAgc2lnbkluQWxpYXNlczogeyBlbWFpbDogdHJ1ZSB9LFxuICAgICAgYXV0b1ZlcmlmeTogeyBlbWFpbDogdHJ1ZSB9LFxuICAgICAgLyoqIEJyYW5kZWQgdmVyaWZpY2F0aW9uIGVtYWlsIChzdWJqZWN0IGxpbmUpLiBGcm9tLWFkZHJlc3Mgc3RpbGwgQ29nbml0byBkZWZhdWx0IHVubGVzcyBTRVMgaXMgY29uZmlndXJlZC4gKi9cbiAgICAgIHVzZXJWZXJpZmljYXRpb246IHtcbiAgICAgICAgZW1haWxTdWJqZWN0OiBcIk9qYXMgSGVhbHRoIOKAlCB2ZXJpZnkgeW91ciBlbWFpbFwiLFxuICAgICAgICBlbWFpbEJvZHk6XG4gICAgICAgICAgXCJXZWxjb21lIHRvIE9qYXMgSGVhbHRoLlxcblxcbllvdXIgdmVyaWZpY2F0aW9uIGNvZGUgaXMgeyMjIyN9XFxuXFxuT2phcyBIZWFsdGggaGVscHMgeW91IGxvZyB3ZWlnaHQgYW5kIGhhYml0cyBmb3IgcGVyc29uYWwgYXdhcmVuZXNzLiBUaGlzIGlzIG5vdCBtZWRpY2FsIGFkdmljZS5cXG5cIixcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IHVzZXJQb29sLmFkZENsaWVudChcIlVzZXJQb29sQ2xpZW50XCIsIHtcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LXdlYmAsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGh0dHBBcGkgPSBuZXcgYXBpZ3d2Mi5IdHRwQXBpKHRoaXMsIFwiSHR0cEFwaVwiLCB7XG4gICAgICBhcGlOYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0taHR0cC1hcGlgLFxuICAgICAgY29yc1ByZWZsaWdodDoge1xuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcIkF1dGhvcml6YXRpb25cIiwgXCJDb250ZW50LVR5cGVcIiwgXCJ4LWNvZ25pdG8tYWNjZXNzLXRva2VuXCJdLFxuICAgICAgICBhbGxvd01ldGhvZHM6IFtcbiAgICAgICAgICBhcGlnd3YyLkNvcnNIdHRwTWV0aG9kLkdFVCxcbiAgICAgICAgICBhcGlnd3YyLkNvcnNIdHRwTWV0aG9kLlBPU1QsXG4gICAgICAgICAgYXBpZ3d2Mi5Db3JzSHR0cE1ldGhvZC5QVVQsXG4gICAgICAgICAgYXBpZ3d2Mi5Db3JzSHR0cE1ldGhvZC5ERUxFVEUsXG4gICAgICAgICAgYXBpZ3d2Mi5Db3JzSHR0cE1ldGhvZC5QQVRDSCxcbiAgICAgICAgICBhcGlnd3YyLkNvcnNIdHRwTWV0aG9kLk9QVElPTlMsXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93T3JpZ2luczogW1wiKlwiXSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBlbnRyaWVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJFbnRyaWVzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkVudHJpZXNcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInVzZXJJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcImRhdGVcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2V0dGluZ3NUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIlNldHRpbmdzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIlNldHRpbmdzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgaW5zaWdodEZlZWRiYWNrVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJJbnNpZ2h0RmVlZGJhY2tUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiSW5zaWdodEZlZWRiYWNrXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJpbnNpZ2h0VHNcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuICAgIGNvbnN0IGluc2lnaHRDYWNoZVRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiSW5zaWdodENhY2hlVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkluc2lnaHRDYWNoZVwiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwidXNlcklkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwiY2FjaGVLZXlcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkZlYXR1cmVGbGFnT3ZlcnJpZGVzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJmbGFnXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIlN1YnNjcmlwdGlvbnNUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiU3Vic2NyaXB0aW9uc1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwidXNlcklkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIGNvbnN0IGJpbGxpbmdFdmVudHNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkJpbGxpbmdFdmVudHNUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiQmlsbGluZ0V2ZW50c1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwiaWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZm9vZExvZ0VudHJpZXNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkZvb2RMb2dFbnRyaWVzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkZvb2RMb2dFbnRyaWVzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJmb29kTG9nSWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgbWVhbHNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIk1lYWxzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIk1lYWxzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJtZWFsSWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuICAgIG1lYWxzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiBcIk5hbWVMb29rdXBLZXlJbmRleFwiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwibmFtZUxvb2t1cEtleVwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcIm1lYWxJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgICB9KTtcblxuICAgIGNvbnN0IGRheU1lYWxFbnRyaWVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJEYXlNZWFsRW50cmllc1RhYmxlXCIsIHtcbiAgICAgIHRhYmxlTmFtZTogXCJEYXlNZWFsRW50cmllc1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwiZGF5S2V5XCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwiZW50cnlJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7IHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG4gICAgZGF5TWVhbEVudHJpZXNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6IFwiTWVhbEhpc3RvcnlJbmRleFwiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwibGlicmFyeU1lYWxJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcIm1lYWxIaXN0b3J5U2tcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXG4gICAgfSk7XG4gICAgY29uc3QgcHJvZ3Jlc3NQaG90b3NUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIlByb2dyZXNzUGhvdG9zVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIlByb2dyZXNzUGhvdG9zXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJwaG90b0lkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcbiAgICBwcm9ncmVzc1Bob3Rvc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogXCJVc2VyRGF0ZUluZGV4XCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJkYXRlXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxuICAgIH0pO1xuXG4gICAgLyoqIElkZW1wb3RlbmN5IGZvciBzY2hlZHVsZWQgd2Vla2x5IGRpZ2VzdCBlbWFpbHMgKHVzZXJJZCArIHdlZWtTdGFydCkuICovXG4gICAgY29uc3Qgd2Vla2x5RGlnZXN0TG9nVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJXZWVrbHlEaWdlc3RMb2dUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiV2Vla2x5RGlnZXN0TG9nXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ1c2VySWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJ3ZWVrU3RhcnRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcGhvdG9Db3JzT3JpZ2lucyA9IHBob3RvQ29yc0FsbG93QWxsT3JpZ2lucygpXG4gICAgICA/IFtcIipcIl1cbiAgICAgIDogW1xuICAgICAgICAgIFwiaHR0cHM6Ly9vamFzLWhlYWx0aC5jb21cIixcbiAgICAgICAgICBcImh0dHBzOi8vd3d3Lm9qYXMtaGVhbHRoLmNvbVwiLFxuICAgICAgICAgIFwiaHR0cDovL2xvY2FsaG9zdDozMDAwXCIsXG4gICAgICAgICAgXCJodHRwOi8vMTI3LjAuMC4xOjMwMDBcIixcbiAgICAgICAgICBcImh0dHBzOi8vbG9jYWxob3N0OjMwMDBcIixcbiAgICAgICAgICBcImh0dHBzOi8vMTI3LjAuMC4xOjMwMDBcIixcbiAgICAgICAgICAuLi5waG90b0NvcnNFeHRyYU9yaWdpbnNGcm9tRW52KCksXG4gICAgICAgIF07XG5cbiAgICBjb25zdCBwaG90b3NCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiUGhvdG9zQnVja2V0XCIsIHtcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgY29yczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtzMy5IdHRwTWV0aG9kcy5QVVQsIHMzLkh0dHBNZXRob2RzLkdFVCwgczMuSHR0cE1ldGhvZHMuSEVBRF0sXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IHBob3RvQ29yc09yaWdpbnMsXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFtcIipcIl0sXG4gICAgICAgICAgZXhwb3NlZEhlYWRlcnM6IFtcIkVUYWdcIiwgXCJ4LWFtei1yZXF1ZXN0LWlkXCIsIFwieC1hbXotaWQtMlwiXSxcbiAgICAgICAgICBtYXhBZ2U6IDM2MDAsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYmFja2VuZExhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJCYWNrZW5kTGFtYmRhUm9sZVwiLCB7XG4gICAgICByb2xlTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWJhY2tlbmQtbGFtYmRhLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJsYW1iZGEuYW1hem9uYXdzLmNvbVwiKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXG4gICAgICAgICAgXCJzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlXCIsXG4gICAgICAgICksXG4gICAgICBdLFxuICAgICAgZGVzY3JpcHRpb246IFwiTGFtYmRhIHJvbGUgZm9yIERpZXQgVHJhY2tlciBiYWNrZW5kIENSVUQgaGFuZGxlcnMuXCIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBwcmVzaWduTGFtYmRhUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCBcIlByZXNpZ25MYW1iZGFSb2xlXCIsIHtcbiAgICAgIHJvbGVOYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tcHJlc2lnbi1sYW1iZGEtcm9sZWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbChcImxhbWJkYS5hbWF6b25hd3MuY29tXCIpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcbiAgICAgICAgICBcInNlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGVcIixcbiAgICAgICAgKSxcbiAgICAgIF0sXG4gICAgICBkZXNjcmlwdGlvbjogXCJMYW1iZGEgcm9sZSBmb3IgZ2VuZXJhdGluZyBTMyBwcmVzaWduZWQgdXBsb2FkL2Rvd25sb2FkIFVSTHMuXCIsXG4gICAgfSk7XG5cbiAgICBlbnRyaWVzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBzZXR0aW5nc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgaW5zaWdodEZlZWRiYWNrVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBpbnNpZ2h0Q2FjaGVUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYmFja2VuZExhbWJkYVJvbGUpO1xuICAgIGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBzdWJzY3JpcHRpb25zVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBiaWxsaW5nRXZlbnRzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBmb29kTG9nRW50cmllc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG4gICAgbWVhbHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYmFja2VuZExhbWJkYVJvbGUpO1xuICAgIGRheU1lYWxFbnRyaWVzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBwcm9ncmVzc1Bob3Rvc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShiYWNrZW5kTGFtYmRhUm9sZSk7XG5cbiAgICBjb25zdCBtZWFsTmxQYXJzZUxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJNZWFsTmxQYXJzZUxhbWJkYVJvbGVcIiwge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJsYW1iZGEuYW1hem9uYXdzLmNvbVwiKSxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIk5hdHVyYWwtbGFuZ3VhZ2UgbWVhbCBwYXJzZSAocmVhZCBsaWJyYXJ5LCBpbnZhbGlkYXRlIGluc2lnaHQgY2FjaGUpXCIsXG4gICAgfSk7XG4gICAgbWVhbE5sUGFyc2VMYW1iZGFSb2xlLmFkZE1hbmFnZWRQb2xpY3koXG4gICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXCJzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlXCIpLFxuICAgICk7XG4gICAgbWVhbHNUYWJsZS5ncmFudFJlYWREYXRhKG1lYWxObFBhcnNlTGFtYmRhUm9sZSk7XG4gICAgaW5zaWdodENhY2hlVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKG1lYWxObFBhcnNlTGFtYmRhUm9sZSk7XG4gICAgcGhvdG9zQnVja2V0LmdyYW50UmVhZFdyaXRlKGJhY2tlbmRMYW1iZGFSb2xlKTtcbiAgICBwaG90b3NCdWNrZXQuZ3JhbnRSZWFkV3JpdGUocHJlc2lnbkxhbWJkYVJvbGUpO1xuXG4gICAgYmFja2VuZExhbWJkYVJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcImNvZ25pdG8taWRwOkxpc3RVc2Vyc1wiLCBcImNvZ25pdG8taWRwOkdldFVzZXJcIl0sXG4gICAgICAgIHJlc291cmNlczogW3VzZXJQb29sLnVzZXJQb29sQXJuXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBiYWNrZW5kTGFtYmRhUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1wic2VzOlNlbmRFbWFpbFwiLCBcInNlczpTZW5kUmF3RW1haWxcIl0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBEZWZhdWx0IGFkbWluIGFsbG93bGlzdDsgb3ZlcnJpZGUgd2l0aCBBRE1JTl9FTUFJTFM9Li4uIGF0IGRlcGxveSB0aW1lIChjb21tYS1zZXBhcmF0ZWQpLlxuICAgIGNvbnN0IGFkbWluRW1haWxzRGVwbG95ID1cbiAgICAgIHByb2Nlc3MuZW52LkFETUlOX0VNQUlMUz8udHJpbSgpIHx8IFwib2phc2hlYWx0aDIwMjZAZ21haWwuY29tXCI7XG4gICAgLyoqIFNldCB0byBcImZhbHNlXCIgb24gZGVwbG95IG1hY2hpbmUgdG8gc2hpcCBMYW1iZGEgd2l0aCBMTE0gcmVmaW5lIGRpc2FibGVkLiBLZXkgbXVzdCBiZSBzZXQgb24gdGhlIGZ1bmN0aW9uIGluIEFXUyAobm90IGhlcmUpIHNvIGl0IG5ldmVyIGFwcGVhcnMgaW4gQ2xvdWRGb3JtYXRpb24uICovXG4gICAgY29uc3QgaW5zaWdodHNMbG1SZWZpbmVFbnYgPSBwcm9jZXNzLmVudi5JTlNJR0hUU19MTE1fUkVGSU5FID09PSBcImZhbHNlXCIgPyBcImZhbHNlXCIgOiBcInRydWVcIjtcbiAgICAvKiogT3B0LW91dDogZW5hYmxlZCB1bmxlc3MgZGVwbG95IGV4cGxpY2l0bHkgc2V0cyBGRl8qIHRvIFwiZmFsc2VcIiAodGVzdCBwb3J0YWwgZnJpZW5kbHkpLiAqL1xuICAgIGNvbnN0IHBob3RvRm9vZExvZ0VudiA9IHByb2Nlc3MuZW52LkZGX1BIT1RPX0ZPT0RfTE9HID09PSBcImZhbHNlXCIgPyBcImZhbHNlXCIgOiBcInRydWVcIjtcbiAgICBjb25zdCBtZWFsTGlicmFyeUVudiA9IHByb2Nlc3MuZW52LkZGX01FQUxfTElCUkFSWSA9PT0gXCJmYWxzZVwiID8gXCJmYWxzZVwiIDogXCJ0cnVlXCI7XG4gICAgY29uc3QgbmxNZWFsUGFyc2VFbnYgPSBwcm9jZXNzLmVudi5GRl9OTF9NRUFMX1BBUlNFID09PSBcImZhbHNlXCIgPyBcImZhbHNlXCIgOiBcInRydWVcIjtcbiAgICBjb25zdCBib2R5Q29tcGFyZUFpRW52ID0gcHJvY2Vzcy5lbnYuRkZfQk9EWV9DT01QQVJFX0FJID09PSBcImZhbHNlXCIgPyBcImZhbHNlXCIgOiBcInRydWVcIjtcbiAgICAvKiogT3B0LW91dDogcGVyc29uYWxpemVkIGNvYWNoaW5nIG51ZGdlcyArIFBybyBnYXRlIG9uIGAvdjIvaW5zaWdodHNgIChzYW1lIHBhdHRlcm4gYXMgb3RoZXIgRkZfKikuICovXG4gICAgY29uc3QgcGVyc29uYWxpemVkQWlDb2FjaGluZ0VudiA9XG4gICAgICBwcm9jZXNzLmVudi5GRl9QRVJTT05BTElaRURfQUlfQ09BQ0hJTkcgPT09IFwiZmFsc2VcIiA/IFwiZmFsc2VcIiA6IFwidHJ1ZVwiO1xuICAgIC8qKiBPcHQtb3V0OiB3ZWVrbHkgU0VTIHNlbmQgcm91dGUgZW5hYmxlZCB1bmxlc3MgZGVwbG95IHNldHMgRkZfV0VFS0xZX1JFUE9SVF9FTUFJTD1mYWxzZS4gUmVxdWlyZXMgVFJBTlNBQ1RJT05BTF9FTUFJTF9GUk9NLiAqL1xuICAgIGNvbnN0IHdlZWtseVJlcG9ydEVtYWlsRW52ID0gcHJvY2Vzcy5lbnYuRkZfV0VFS0xZX1JFUE9SVF9FTUFJTCA9PT0gXCJmYWxzZVwiID8gXCJmYWxzZVwiIDogXCJ0cnVlXCI7XG4gICAgLyoqIERlZmF1bHQgU0VTIEZyb20gd2hlbiB1bnNldDsgbXVzdCBiZSBhIHZlcmlmaWVkIGlkZW50aXR5IGluIFNFUyAoc2FtZSByZWdpb24pLiBPdmVycmlkZSBhdCBkZXBsb3kuICovXG4gICAgY29uc3QgdHJhbnNhY3Rpb25hbEVtYWlsRnJvbURlcGxveSA9XG4gICAgICBwcm9jZXNzLmVudi5UUkFOU0FDVElPTkFMX0VNQUlMX0ZST00/LnRyaW0oKSB8fCBERUZBVUxUX1RSQU5TQUNUSU9OQUxfRU1BSUxfRlJPTTtcbiAgICBjb25zdCB0cmFuc2FjdGlvbmFsRW1haWxGcm9tTmFtZURlcGxveSA9XG4gICAgICBwcm9jZXNzLmVudi5UUkFOU0FDVElPTkFMX0VNQUlMX0ZST01fTkFNRT8udHJpbSgpIHx8IFwiT2phcyBIZWFsdGhcIjtcbiAgICBjb25zdCB0cmFuc2FjdGlvbmFsRW1haWxSZXBseVRvRGVwbG95ID0gcHJvY2Vzcy5lbnYuVFJBTlNBQ1RJT05BTF9FTUFJTF9SRVBMWV9UTz8udHJpbSgpID8/IFwiXCI7XG4gICAgY29uc3QgdHJhbnNhY3Rpb25hbEVtYWlsTWVzc2FnZUlkRG9tYWluRGVwbG95ID1cbiAgICAgIHByb2Nlc3MuZW52LlRSQU5TQUNUSU9OQUxfRU1BSUxfTUVTU0FHRV9JRF9ET01BSU4/LnRyaW0oKSA/PyBcIlwiO1xuICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxFbWFpbExpc3RVbnN1YnNjcmliZVVybERlcGxveSA9XG4gICAgICBwcm9jZXNzLmVudi5UUkFOU0FDVElPTkFMX0VNQUlMX0xJU1RfVU5TVUJTQ1JJQkVfVVJMPy50cmltKCkgPz8gXCJcIjtcbiAgICAvKiogTGlzdC1JRCArIGRlZmF1bHQgTGlzdC1VbnN1YnNjcmliZSBodHRwczovL3tkb21haW59LyAoR0VUIG9ubHk7IG9uZS1jbGljayBQT1NUIG9wdC1pbikuICovXG4gICAgY29uc3QgdHJhbnNhY3Rpb25hbEVtYWlsQnJhbmREb21haW5EZXBsb3kgPVxuICAgICAgcHJvY2Vzcy5lbnYuVFJBTlNBQ1RJT05BTF9FTUFJTF9CUkFORF9ET01BSU4/LnRyaW0oKSB8fCBcIm9qYXMtaGVhbHRoLmNvbVwiO1xuICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxFbWFpbExpc3RVbnN1YnNjcmliZU9uZUNsaWNrRGVwbG95ID1cbiAgICAgIHByb2Nlc3MuZW52LlRSQU5TQUNUSU9OQUxfRU1BSUxfTElTVF9VTlNVQlNDUklCRV9PTkVfQ0xJQ0sgPT09IFwidHJ1ZVwiID8gXCJ0cnVlXCIgOiBcImZhbHNlXCI7XG4gICAgLyoqIE9wdC1pbjogRXZlbnRCcmlkZ2UgaW52b2tlcyB3ZWVrbHkgZGlnZXN0IExhbWJkYSAoTW9uZGF5cyBVVEMpLiBVc2VycyBtdXN0IHNldCBgd2Vla2x5RGlnZXN0RW1haWxgIGluIFNldHRpbmdzLiAqL1xuICAgIGNvbnN0IHdlZWtseURpZ2VzdFNjaGVkdWxlckVudiA9IHByb2Nlc3MuZW52LkZGX1dFRUtMWV9ESUdFU1RfU0NIRURVTEVSID09PSBcInRydWVcIiA/IFwidHJ1ZVwiIDogXCJmYWxzZVwiO1xuICAgIC8qKiBTZXQgb24gdGhlIG1hY2hpbmUgdGhhdCBydW5zIGBjZGsgZGVwbG95YCAobmV2ZXIgY29tbWl0KS4gT21pdHRlZCBlbXB0eSBzdHJpbmcgc3RpbGwga2VlcHMgdGhlIGVudiBzbG90IHNvIGZvb2QgdmlzaW9uIGNhbiBiZSBlbmFibGVkIHdpdGhvdXQgdGhlIGNvbnNvbGUuICovXG4gICAgY29uc3QgYW50aHJvcGljQXBpS2V5RGVwbG95ID0gcHJvY2Vzcy5lbnYuQU5USFJPUElDX0FQSV9LRVk/LnRyaW0oKSA/PyBcIlwiO1xuICAgIGNvbnN0IGFudGhyb3BpY0Zvb2RWaXNpb25Nb2RlbCA9IHByb2Nlc3MuZW52LkFOVEhST1BJQ19GT09EX1ZJU0lPTl9NT0RFTD8udHJpbSgpID8/IFwiXCI7XG4gICAgLyoqIFNldCBhdCBkZXBsb3kgdGltZTsgZW1wdHkgZGlzYWJsZXMgU3RyaXBlIHJvdXRlcyAoNTAzKSB1bnRpbCBjb25maWd1cmVkLiAqL1xuICAgIGNvbnN0IHN0cmlwZVNlY3JldEtleURlcGxveSA9IHByb2Nlc3MuZW52LlNUUklQRV9TRUNSRVRfS0VZPy50cmltKCkgPz8gXCJcIjtcbiAgICBjb25zdCBiaWxsaW5nQXBwVXJsRGVwbG95ID0gcHJvY2Vzcy5lbnYuQklMTElOR19BUFBfVVJMPy50cmltKCkgPz8gcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfQVBQX1VSTD8udHJpbSgpID8/IFwiXCI7XG4gICAgY29uc3QgbWVhbE5sUGFyc2VMYW1iZGEgPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgXCJNZWFsTmxQYXJzZUxhbWJkYVwiLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1tZWFsLW5sLXBhcnNlYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi5cIiwgXCJsYW1iZGFcIiwgXCJtZWFsLW5sLXBhcnNlLnRzXCIpLFxuICAgICAgaGFuZGxlcjogXCJoYW5kbGVyXCIsXG4gICAgICByb2xlOiBtZWFsTmxQYXJzZUxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxNSksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBNRUFMU19UQUJMRV9OQU1FOiBtZWFsc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgSU5TSUdIVF9DQUNIRV9UQUJMRV9OQU1FOiBpbnNpZ2h0Q2FjaGVUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEZGX01FQUxfTElCUkFSWTogbWVhbExpYnJhcnlFbnYsXG4gICAgICAgIEZGX05MX01FQUxfUEFSU0U6IG5sTWVhbFBhcnNlRW52LFxuICAgICAgICBBTlRIUk9QSUNfQVBJX0tFWTogYW50aHJvcGljQXBpS2V5RGVwbG95LFxuICAgICAgICAuLi4ocHJvY2Vzcy5lbnYuQU5USFJPUElDX05MX01FQUxfTU9ERUw/LnRyaW0oKVxuICAgICAgICAgID8geyBBTlRIUk9QSUNfTkxfTUVBTF9NT0RFTDogcHJvY2Vzcy5lbnYuQU5USFJPUElDX05MX01FQUxfTU9ERUwudHJpbSgpIH1cbiAgICAgICAgICA6IHt9KSxcbiAgICAgIH0sXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBtaW5pZnk6IHRydWUsXG4gICAgICAgIHNvdXJjZU1hcDogZmFsc2UsXG4gICAgICAgIHRhcmdldDogXCJub2RlMjBcIixcbiAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgYXBpTGFtYmRhID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsIFwiQmFja2VuZEFwaUxhbWJkYVwiLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1iYWNrZW5kLWFwaWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uXCIsIFwibGFtYmRhXCIsIFwiaHR0cC1hcGktaGFuZGxlci50c1wiKSxcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlclwiLFxuICAgICAgcm9sZTogYmFja2VuZExhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBFTlRSSUVTX1RBQkxFX05BTUU6IGVudHJpZXNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFNFVFRJTkdTX1RBQkxFX05BTUU6IHNldHRpbmdzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBJTlNJR0hUX0ZFRURCQUNLX1RBQkxFX05BTUU6IGluc2lnaHRGZWVkYmFja1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgSU5TSUdIVF9DQUNIRV9UQUJMRV9OQU1FOiBpbnNpZ2h0Q2FjaGVUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRTogZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFNVQlNDUklQVElPTlNfVEFCTEVfTkFNRTogc3Vic2NyaXB0aW9uc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgQklMTElOR19FVkVOVFNfVEFCTEVfTkFNRTogYmlsbGluZ0V2ZW50c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgRk9PRF9MT0dfRU5UUklFU19UQUJMRV9OQU1FOiBmb29kTG9nRW50cmllc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgTUVBTFNfVEFCTEVfTkFNRTogbWVhbHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIERBWV9NRUFMX0VOVFJJRVNfVEFCTEVfTkFNRTogZGF5TWVhbEVudHJpZXNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFBST0dSRVNTX1BIT1RPU19UQUJMRV9OQU1FOiBwcm9ncmVzc1Bob3Rvc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgUEhPVE9fQlVDS0VUX05BTUU6IHBob3Rvc0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBVU0VSX1BPT0xfSUQ6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICAgIEFETUlOX0VNQUlMUzogYWRtaW5FbWFpbHNEZXBsb3ksXG4gICAgICAgIFVQTE9BRF9VUkxfVFRMX1NFQ09ORFM6IFwiOTAwXCIsXG4gICAgICAgIERPV05MT0FEX1VSTF9UVExfU0VDT05EUzogXCI2MDQ4MDBcIixcbiAgICAgICAgSU5TSUdIVFNfTExNX1JFRklORTogaW5zaWdodHNMbG1SZWZpbmVFbnYsXG4gICAgICAgIEZGX1BIT1RPX0ZPT0RfTE9HOiBwaG90b0Zvb2RMb2dFbnYsXG4gICAgICAgIEZGX01FQUxfTElCUkFSWTogbWVhbExpYnJhcnlFbnYsXG4gICAgICAgIEZGX05MX01FQUxfUEFSU0U6IG5sTWVhbFBhcnNlRW52LFxuICAgICAgICBGRl9CT0RZX0NPTVBBUkVfQUk6IGJvZHlDb21wYXJlQWlFbnYsXG4gICAgICAgIEZGX1BFUlNPTkFMSVpFRF9BSV9DT0FDSElORzogcGVyc29uYWxpemVkQWlDb2FjaGluZ0VudixcbiAgICAgICAgRkZfV0VFS0xZX1JFUE9SVF9FTUFJTDogd2Vla2x5UmVwb3J0RW1haWxFbnYsXG4gICAgICAgIFRSQU5TQUNUSU9OQUxfRU1BSUxfRlJPTTogdHJhbnNhY3Rpb25hbEVtYWlsRnJvbURlcGxveSxcbiAgICAgICAgVFJBTlNBQ1RJT05BTF9FTUFJTF9GUk9NX05BTUU6IHRyYW5zYWN0aW9uYWxFbWFpbEZyb21OYW1lRGVwbG95LFxuICAgICAgICBUUkFOU0FDVElPTkFMX0VNQUlMX0JSQU5EX0RPTUFJTjogdHJhbnNhY3Rpb25hbEVtYWlsQnJhbmREb21haW5EZXBsb3ksXG4gICAgICAgIFRSQU5TQUNUSU9OQUxfRU1BSUxfTElTVF9VTlNVQlNDUklCRV9PTkVfQ0xJQ0s6IHRyYW5zYWN0aW9uYWxFbWFpbExpc3RVbnN1YnNjcmliZU9uZUNsaWNrRGVwbG95LFxuICAgICAgICAuLi4odHJhbnNhY3Rpb25hbEVtYWlsUmVwbHlUb0RlcGxveVxuICAgICAgICAgID8geyBUUkFOU0FDVElPTkFMX0VNQUlMX1JFUExZX1RPOiB0cmFuc2FjdGlvbmFsRW1haWxSZXBseVRvRGVwbG95IH1cbiAgICAgICAgICA6IHt9KSxcbiAgICAgICAgLi4uKHRyYW5zYWN0aW9uYWxFbWFpbE1lc3NhZ2VJZERvbWFpbkRlcGxveVxuICAgICAgICAgID8geyBUUkFOU0FDVElPTkFMX0VNQUlMX01FU1NBR0VfSURfRE9NQUlOOiB0cmFuc2FjdGlvbmFsRW1haWxNZXNzYWdlSWREb21haW5EZXBsb3kgfVxuICAgICAgICAgIDoge30pLFxuICAgICAgICAuLi4odHJhbnNhY3Rpb25hbEVtYWlsTGlzdFVuc3Vic2NyaWJlVXJsRGVwbG95XG4gICAgICAgICAgPyB7IFRSQU5TQUNUSU9OQUxfRU1BSUxfTElTVF9VTlNVQlNDUklCRV9VUkw6IHRyYW5zYWN0aW9uYWxFbWFpbExpc3RVbnN1YnNjcmliZVVybERlcGxveSB9XG4gICAgICAgICAgOiB7fSksXG4gICAgICAgIEFOVEhST1BJQ19BUElfS0VZOiBhbnRocm9waWNBcGlLZXlEZXBsb3ksXG4gICAgICAgIFNUUklQRV9TRUNSRVRfS0VZOiBzdHJpcGVTZWNyZXRLZXlEZXBsb3ksXG4gICAgICAgIC4uLihiaWxsaW5nQXBwVXJsRGVwbG95ID8geyBCSUxMSU5HX0FQUF9VUkw6IGJpbGxpbmdBcHBVcmxEZXBsb3kgfSA6IHt9KSxcbiAgICAgICAgLi4uKGFudGhyb3BpY0Zvb2RWaXNpb25Nb2RlbFxuICAgICAgICAgID8geyBBTlRIUk9QSUNfRk9PRF9WSVNJT05fTU9ERUw6IGFudGhyb3BpY0Zvb2RWaXNpb25Nb2RlbCB9XG4gICAgICAgICAgOiB7fSksXG4gICAgICB9LFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgbWluaWZ5OiB0cnVlLFxuICAgICAgICBzb3VyY2VNYXA6IGZhbHNlLFxuICAgICAgICB0YXJnZXQ6IFwibm9kZTIwXCIsXG4gICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHdlZWtseURpZ2VzdExhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJXZWVrbHlEaWdlc3RMYW1iZGFSb2xlXCIsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwibGFtYmRhLmFtYXpvbmF3cy5jb21cIiksXG4gICAgICBkZXNjcmlwdGlvbjogXCJTY2hlZHVsZWQgd2Vla2x5IGRpZ2VzdCAocnVsZS1iYXNlZCByZXBvcnQgKyBTRVMpIGZvciBvcHRlZC1pbiB1c2Vyc1wiLFxuICAgIH0pO1xuICAgIHdlZWtseURpZ2VzdExhbWJkYVJvbGUuYWRkTWFuYWdlZFBvbGljeShcbiAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcInNlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGVcIiksXG4gICAgKTtcbiAgICBlbnRyaWVzVGFibGUuZ3JhbnRSZWFkRGF0YSh3ZWVrbHlEaWdlc3RMYW1iZGFSb2xlKTtcbiAgICBzZXR0aW5nc1RhYmxlLmdyYW50UmVhZERhdGEod2Vla2x5RGlnZXN0TGFtYmRhUm9sZSk7XG4gICAgcHJvZ3Jlc3NQaG90b3NUYWJsZS5ncmFudFJlYWREYXRhKHdlZWtseURpZ2VzdExhbWJkYVJvbGUpO1xuICAgIHdlZWtseURpZ2VzdExvZ1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh3ZWVrbHlEaWdlc3RMYW1iZGFSb2xlKTtcbiAgICB3ZWVrbHlEaWdlc3RMYW1iZGFSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXCJjb2duaXRvLWlkcDpMaXN0VXNlcnNcIl0sXG4gICAgICAgIHJlc291cmNlczogW3VzZXJQb29sLnVzZXJQb29sQXJuXSxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgd2Vla2x5RGlnZXN0TGFtYmRhUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1wic2VzOlNlbmRFbWFpbFwiLCBcInNlczpTZW5kUmF3RW1haWxcIl0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zdCB3ZWVrbHlEaWdlc3RMYW1iZGEgPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgXCJXZWVrbHlEaWdlc3RMYW1iZGFcIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0td2Vla2x5LWRpZ2VzdGAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uXCIsIFwibGFtYmRhXCIsIFwid2Vla2x5LWRpZ2VzdC1zY2hlZHVsZXIudHNcIiksXG4gICAgICBoYW5kbGVyOiBcImhhbmRsZXJcIixcbiAgICAgIHJvbGU6IHdlZWtseURpZ2VzdExhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBFTlRSSUVTX1RBQkxFX05BTUU6IGVudHJpZXNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFNFVFRJTkdTX1RBQkxFX05BTUU6IHNldHRpbmdzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBQUk9HUkVTU19QSE9UT1NfVEFCTEVfTkFNRTogcHJvZ3Jlc3NQaG90b3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFdFRUtMWV9ESUdFU1RfTE9HX1RBQkxFX05BTUU6IHdlZWtseURpZ2VzdExvZ1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgVVNFUl9QT09MX0lEOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgICBGRl9XRUVLTFlfRElHRVNUX1NDSEVEVUxFUjogd2Vla2x5RGlnZXN0U2NoZWR1bGVyRW52LFxuICAgICAgICBGRl9XRUVLTFlfUkVQT1JUX0VNQUlMOiB3ZWVrbHlSZXBvcnRFbWFpbEVudixcbiAgICAgICAgVFJBTlNBQ1RJT05BTF9FTUFJTF9GUk9NOiB0cmFuc2FjdGlvbmFsRW1haWxGcm9tRGVwbG95LFxuICAgICAgICBUUkFOU0FDVElPTkFMX0VNQUlMX0ZST01fTkFNRTogdHJhbnNhY3Rpb25hbEVtYWlsRnJvbU5hbWVEZXBsb3ksXG4gICAgICAgIFRSQU5TQUNUSU9OQUxfRU1BSUxfQlJBTkRfRE9NQUlOOiB0cmFuc2FjdGlvbmFsRW1haWxCcmFuZERvbWFpbkRlcGxveSxcbiAgICAgICAgVFJBTlNBQ1RJT05BTF9FTUFJTF9MSVNUX1VOU1VCU0NSSUJFX09ORV9DTElDSzogdHJhbnNhY3Rpb25hbEVtYWlsTGlzdFVuc3Vic2NyaWJlT25lQ2xpY2tEZXBsb3ksXG4gICAgICAgIC4uLih0cmFuc2FjdGlvbmFsRW1haWxSZXBseVRvRGVwbG95XG4gICAgICAgICAgPyB7IFRSQU5TQUNUSU9OQUxfRU1BSUxfUkVQTFlfVE86IHRyYW5zYWN0aW9uYWxFbWFpbFJlcGx5VG9EZXBsb3kgfVxuICAgICAgICAgIDoge30pLFxuICAgICAgICAuLi4odHJhbnNhY3Rpb25hbEVtYWlsTWVzc2FnZUlkRG9tYWluRGVwbG95XG4gICAgICAgICAgPyB7IFRSQU5TQUNUSU9OQUxfRU1BSUxfTUVTU0FHRV9JRF9ET01BSU46IHRyYW5zYWN0aW9uYWxFbWFpbE1lc3NhZ2VJZERvbWFpbkRlcGxveSB9XG4gICAgICAgICAgOiB7fSksXG4gICAgICAgIC4uLih0cmFuc2FjdGlvbmFsRW1haWxMaXN0VW5zdWJzY3JpYmVVcmxEZXBsb3lcbiAgICAgICAgICA/IHsgVFJBTlNBQ1RJT05BTF9FTUFJTF9MSVNUX1VOU1VCU0NSSUJFX1VSTDogdHJhbnNhY3Rpb25hbEVtYWlsTGlzdFVuc3Vic2NyaWJlVXJsRGVwbG95IH1cbiAgICAgICAgICA6IHt9KSxcbiAgICAgICAgLi4uKHByb2Nlc3MuZW52LldFRUtMWV9ESUdFU1RfTUFYX1VTRVJTX1BFUl9SVU4/LnRyaW0oKVxuICAgICAgICAgID8geyBXRUVLTFlfRElHRVNUX01BWF9VU0VSU19QRVJfUlVOOiBwcm9jZXNzLmVudi5XRUVLTFlfRElHRVNUX01BWF9VU0VSU19QRVJfUlVOLnRyaW0oKSB9XG4gICAgICAgICAgOiB7fSksXG4gICAgICB9LFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgbWluaWZ5OiB0cnVlLFxuICAgICAgICBzb3VyY2VNYXA6IGZhbHNlLFxuICAgICAgICB0YXJnZXQ6IFwibm9kZTIwXCIsXG4gICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHdlZWtseURpZ2VzdFJ1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgXCJXZWVrbHlEaWdlc3RNb25kYXlVdGNSdWxlXCIsIHtcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUuY3Jvbih7IG1pbnV0ZTogXCIzMFwiLCBob3VyOiBcIjE0XCIsIHdlZWtEYXk6IFwiTU9OXCIsIG1vbnRoOiBcIipcIiwgeWVhcjogXCIqXCIgfSksXG4gICAgICBlbmFibGVkOiB3ZWVrbHlEaWdlc3RTY2hlZHVsZXJFbnYgPT09IFwidHJ1ZVwiLFxuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgIFwiU2VuZHMgcHJpb3Itd2VlayBkaWdlc3QgKFVUQyBjYWxlbmRhcikuIEVuYWJsZSB3aXRoIEZGX1dFRUtMWV9ESUdFU1RfU0NIRURVTEVSPXRydWUgYXQgZGVwbG95LlwiLFxuICAgIH0pO1xuICAgIHdlZWtseURpZ2VzdFJ1bGUuYWRkVGFyZ2V0KG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKHdlZWtseURpZ2VzdExhbWJkYSkpO1xuXG4gICAgY29uc3QgaW50ZWdyYXRpb24gPSBuZXcgYXBpZ3d2Mi5DZm5JbnRlZ3JhdGlvbih0aGlzLCBcIkJhY2tlbmRBcGlMYW1iZGFJbnRlZ3JhdGlvblwiLCB7XG4gICAgICBhcGlJZDogaHR0cEFwaS5hcGlJZCxcbiAgICAgIGludGVncmF0aW9uVHlwZTogXCJBV1NfUFJPWFlcIixcbiAgICAgIGludGVncmF0aW9uVXJpOiBhcGlMYW1iZGEuZnVuY3Rpb25Bcm4sXG4gICAgICBpbnRlZ3JhdGlvbk1ldGhvZDogXCJQT1NUXCIsXG4gICAgICBwYXlsb2FkRm9ybWF0VmVyc2lvbjogXCIyLjBcIixcbiAgICAgIC8qKiBIVFRQIEFQSSBtYXggaXMgMzBzOyBtYXRjaCBpdCBzbyBsb25nLXJ1bm5pbmcgcm91dGVzICh2b2ljZSBMTE0pIGZhaWwgd2l0aCBIVFRQIGluc3RlYWQgb2YgYSBjbGllbnQgXCJuZXR3b3JrXCIgZHJvcC4gKi9cbiAgICAgIHRpbWVvdXRJbk1pbGxpczogMzBfMDAwLFxuICAgIH0pO1xuXG4gICAgY29uc3QgbWVhbE5sUGFyc2VJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnd3YyLkNmbkludGVncmF0aW9uKHRoaXMsIFwiTWVhbE5sUGFyc2VMYW1iZGFJbnRlZ3JhdGlvblwiLCB7XG4gICAgICBhcGlJZDogaHR0cEFwaS5hcGlJZCxcbiAgICAgIGludGVncmF0aW9uVHlwZTogXCJBV1NfUFJPWFlcIixcbiAgICAgIGludGVncmF0aW9uVXJpOiBtZWFsTmxQYXJzZUxhbWJkYS5mdW5jdGlvbkFybixcbiAgICAgIGludGVncmF0aW9uTWV0aG9kOiBcIlBPU1RcIixcbiAgICAgIHBheWxvYWRGb3JtYXRWZXJzaW9uOiBcIjIuMFwiLFxuICAgICAgdGltZW91dEluTWlsbGlzOiAxNV8wMDAsXG4gICAgfSk7XG5cbiAgICBjb25zdCBqd3RBdXRob3JpemVyID0gbmV3IGFwaWd3djIuQ2ZuQXV0aG9yaXplcih0aGlzLCBcIkNvZ25pdG9Kd3RBdXRob3JpemVyXCIsIHtcbiAgICAgIGFwaUlkOiBodHRwQXBpLmFwaUlkLFxuICAgICAgYXV0aG9yaXplclR5cGU6IFwiSldUXCIsXG4gICAgICBuYW1lOiBcImNvZ25pdG8tand0LWF1dGhvcml6ZXJcIixcbiAgICAgIGlkZW50aXR5U291cmNlOiBbXCIkcmVxdWVzdC5oZWFkZXIuQXV0aG9yaXphdGlvblwiXSxcbiAgICAgIGp3dENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgYXVkaWVuY2U6IFt1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkXSxcbiAgICAgICAgaXNzdWVyOiBgaHR0cHM6Ly9jb2duaXRvLWlkcC4ke3RoaXMucmVnaW9ufS5hbWF6b25hd3MuY29tLyR7dXNlclBvb2wudXNlclBvb2xJZH1gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHNlY3VyZWRSb3V0ZXM6IEFycmF5PHsgcm91dGVLZXk6IHN0cmluZzsgaWQ6IHN0cmluZyB9PiA9IFtcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC9lbnRyaWVzXCIsIGlkOiBcIkVudHJpZXNHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBVVCAvZW50cmllc1wiLCBpZDogXCJFbnRyaWVzUHV0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJERUxFVEUgL2VudHJpZXNcIiwgaWQ6IFwiRW50cmllc0RlbGV0ZVJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC9zZXR0aW5nc1wiLCBpZDogXCJTZXR0aW5nc0dldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUEFUQ0ggL3NldHRpbmdzXCIsIGlkOiBcIlNldHRpbmdzUGF0Y2hSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvc3RhdHNcIiwgaWQ6IFwiU3RhdHNHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBPU1QgL21ldHJpY3MvcGFnZS12aWV3XCIsIGlkOiBcIlBhZ2VWaWV3UG9zdFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvcGhvdG9zL3VwbG9hZC11cmxcIiwgaWQ6IFwiUGhvdG9VcGxvYWRVcmxSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvYWRtaW4vdXNlcnNcIiwgaWQ6IFwiQWRtaW5Vc2Vyc0dldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC92Mi9pbnNpZ2h0c1wiLCBpZDogXCJJbnNpZ2h0c1YyR2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9pbnNpZ2h0cy9mZWVkYmFja1wiLCBpZDogXCJJbnNpZ2h0c1YyRmVlZGJhY2tQb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9mb29kL2VzdGltYXRlXCIsIGlkOiBcIkZvb2RFc3RpbWF0ZVBvc3RSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBPU1QgL3YyL2Zvb2QvbG9nLWNvbmZpcm1cIiwgaWQ6IFwiRm9vZExvZ0NvbmZpcm1Qb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9hY3Rpdml0eS9lc3RpbWF0ZS1idXJuXCIsIGlkOiBcIkFjdGl2aXR5RXN0aW1hdGVCdXJuUG9zdFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvdm9pY2UtZGFpbHktbG9nL3BhcnNlXCIsIGlkOiBcIlZvaWNlRGFpbHlMb2dQYXJzZVBvc3RSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBPU1QgL3YyL2FjdGl2aXR5L2xvZ1wiLCBpZDogXCJBY3Rpdml0eUxvZ1Bvc3RSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBBVENIIC92Mi9hY3Rpdml0eS9jYWxpYnJhdGlvblwiLCBpZDogXCJBY3Rpdml0eUNhbGlicmF0aW9uUGF0Y2hSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvdjIvYWN0aXZpdHkvZW5lcmd5LXdlZWtseS1zdW1tYXJ5XCIsIGlkOiBcIkVuZXJneVdlZWtseVN1bW1hcnlHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvdjIvcHJvZ3Jlc3MtcGhvdG9zXCIsIGlkOiBcIlByb2dyZXNzUGhvdG9zTGlzdEdldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvcHJvZ3Jlc3MtcGhvdG9zXCIsIGlkOiBcIlByb2dyZXNzUGhvdG9zQ3JlYXRlUG9zdFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiREVMRVRFIC92Mi9wcm9ncmVzcy1waG90b3Mve3Bob3RvSWR9XCIsIGlkOiBcIlByb2dyZXNzUGhvdG9zRGVsZXRlUm91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9wcm9ncmVzcy1waG90b3MvYXNzZXNzbWVudFwiLCBpZDogXCJQcm9ncmVzc1Bob3Rvc0Fzc2Vzc21lbnRQb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9mb29kL21lYWwtY29tcGxldGVcIiwgaWQ6IFwiRm9vZE1lYWxDb21wbGV0ZVBvc3RSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvdjIvbWVhbHNcIiwgaWQ6IFwiTWVhbHNMaXN0R2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9tZWFsc1wiLCBpZDogXCJNZWFsc0NyZWF0ZVBvc3RSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvdjIvbWVhbHMvc3VnZ2VzdC1tYXRjaFwiLCBpZDogXCJNZWFsc1N1Z2dlc3RNYXRjaEdldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiR0VUIC92Mi9tZWFscy97bWVhbElkfS9oaXN0b3J5XCIsIGlkOiBcIk1lYWxzSGlzdG9yeUdldFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUEFUQ0ggL3YyL21lYWxzL3ttZWFsSWR9XCIsIGlkOiBcIk1lYWxzUGF0Y2hSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkRFTEVURSAvdjIvbWVhbHMve21lYWxJZH1cIiwgaWQ6IFwiTWVhbHNEZWxldGVSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIkdFVCAvdjIvZGF5cy97ZGF5fS9tZWFsLWVudHJpZXNcIiwgaWQ6IFwiRGF5TWVhbEVudHJpZXNMaXN0R2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9kYXlzL3tkYXl9L21lYWwtZW50cmllc1wiLCBpZDogXCJEYXlNZWFsRW50cmllc0NyZWF0ZVBvc3RSb3V0ZVwiIH0sXG4gICAgICB7XG4gICAgICAgIHJvdXRlS2V5OiBcIkRFTEVURSAvdjIvZGF5cy97ZGF5fS9tZWFsLWVudHJpZXMve2VudHJ5SWR9XCIsXG4gICAgICAgIGlkOiBcIkRheU1lYWxFbnRyeURlbGV0ZVJvdXRlXCIsXG4gICAgICB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL2ZlYXR1cmUtZmxhZ3NcIiwgaWQ6IFwiRmVhdHVyZUZsYWdzR2V0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJHRVQgL2FkbWluL2ZsYWdzXCIsIGlkOiBcIkFkbWluRmxhZ3NHZXRSb3V0ZVwiIH0sXG4gICAgICB7IHJvdXRlS2V5OiBcIlBVVCAvYWRtaW4vZmxhZ3NcIiwgaWQ6IFwiQWRtaW5GbGFnc1B1dFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvYmlsbGluZy9jaGVja291dC1zZXNzaW9uXCIsIGlkOiBcIkJpbGxpbmdDaGVja291dFNlc3Npb25Qb3N0Um91dGVcIiB9LFxuICAgICAgeyByb3V0ZUtleTogXCJQT1NUIC92Mi9iaWxsaW5nL3BvcnRhbFwiLCBpZDogXCJCaWxsaW5nUG9ydGFsUG9zdFJvdXRlXCIgfSxcbiAgICAgIHsgcm91dGVLZXk6IFwiUE9TVCAvdjIvd2Vla2x5LXJlcG9ydC9zZW5kLWVtYWlsXCIsIGlkOiBcIldlZWtseVJlcG9ydFNlbmRFbWFpbFBvc3RSb3V0ZVwiIH0sXG4gICAgXTtcblxuICAgIGZvciAoY29uc3Qgcm91dGUgb2Ygc2VjdXJlZFJvdXRlcykge1xuICAgICAgbmV3IGFwaWd3djIuQ2ZuUm91dGUodGhpcywgcm91dGUuaWQsIHtcbiAgICAgICAgYXBpSWQ6IGh0dHBBcGkuYXBpSWQsXG4gICAgICAgIHJvdXRlS2V5OiByb3V0ZS5yb3V0ZUtleSxcbiAgICAgICAgdGFyZ2V0OiBgaW50ZWdyYXRpb25zLyR7aW50ZWdyYXRpb24ucmVmfWAsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBcIkpXVFwiLFxuICAgICAgICBhdXRob3JpemVySWQ6IGp3dEF1dGhvcml6ZXIucmVmLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgbmV3IGFwaWd3djIuQ2ZuUm91dGUodGhpcywgXCJNZWFsTmxQYXJzZVBvc3RSb3V0ZVwiLCB7XG4gICAgICBhcGlJZDogaHR0cEFwaS5hcGlJZCxcbiAgICAgIHJvdXRlS2V5OiBcIlBPU1QgL3YyL21lYWxzL25sLXBhcnNlXCIsXG4gICAgICB0YXJnZXQ6IGBpbnRlZ3JhdGlvbnMvJHttZWFsTmxQYXJzZUludGVncmF0aW9uLnJlZn1gLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IFwiSldUXCIsXG4gICAgICBhdXRob3JpemVySWQ6IGp3dEF1dGhvcml6ZXIucmVmLFxuICAgIH0pO1xuXG4gICAgbmV3IGFwaWd3djIuQ2ZuUm91dGUodGhpcywgXCJNZWFsTmxQYXJzZUludmFsaWRhdGVQb3N0Um91dGVcIiwge1xuICAgICAgYXBpSWQ6IGh0dHBBcGkuYXBpSWQsXG4gICAgICByb3V0ZUtleTogXCJQT1NUIC92Mi9tZWFscy9ubC1wYXJzZS9pbnZhbGlkYXRlLWluc2lnaHRzXCIsXG4gICAgICB0YXJnZXQ6IGBpbnRlZ3JhdGlvbnMvJHttZWFsTmxQYXJzZUludGVncmF0aW9uLnJlZn1gLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IFwiSldUXCIsXG4gICAgICBhdXRob3JpemVySWQ6IGp3dEF1dGhvcml6ZXIucmVmLFxuICAgIH0pO1xuXG4gICAgbmV3IGxhbWJkYS5DZm5QZXJtaXNzaW9uKHRoaXMsIFwiQXBpR2F0ZXdheUludm9rZVBlcm1pc3Npb25cIiwge1xuICAgICAgYWN0aW9uOiBcImxhbWJkYTpJbnZva2VGdW5jdGlvblwiLFxuICAgICAgZnVuY3Rpb25OYW1lOiBhcGlMYW1iZGEuZnVuY3Rpb25OYW1lLFxuICAgICAgcHJpbmNpcGFsOiBcImFwaWdhdGV3YXkuYW1hem9uYXdzLmNvbVwiLFxuICAgICAgc291cmNlQXJuOiBgYXJuOmF3czpleGVjdXRlLWFwaToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06JHtodHRwQXBpLmFwaUlkfS8qLyovKmAsXG4gICAgfSk7XG5cbiAgICBuZXcgbGFtYmRhLkNmblBlcm1pc3Npb24odGhpcywgXCJBcGlHYXRld2F5SW52b2tlTWVhbE5sUGFyc2VQZXJtaXNzaW9uXCIsIHtcbiAgICAgIGFjdGlvbjogXCJsYW1iZGE6SW52b2tlRnVuY3Rpb25cIixcbiAgICAgIGZ1bmN0aW9uTmFtZTogbWVhbE5sUGFyc2VMYW1iZGEuZnVuY3Rpb25OYW1lLFxuICAgICAgcHJpbmNpcGFsOiBcImFwaWdhdGV3YXkuYW1hem9uYXdzLmNvbVwiLFxuICAgICAgc291cmNlQXJuOiBgYXJuOmF3czpleGVjdXRlLWFwaToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06JHtodHRwQXBpLmFwaUlkfS8qLyovKmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlJlZ2lvblwiLCB7XG4gICAgICB2YWx1ZTogY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1yZWdpb25gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJBcGlVcmxcIiwge1xuICAgICAgdmFsdWU6IGh0dHBBcGkudXJsID8/IFwiTi9BXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYXBpLXVybGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlVzZXJQb29sSWRcIiwge1xuICAgICAgdmFsdWU6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tdXNlci1wb29sLWlkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVXNlclBvb2xDbGllbnRJZFwiLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS11c2VyLXBvb2wtY2xpZW50LWlkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiQnVja2V0TmFtZVwiLCB7XG4gICAgICB2YWx1ZTogcGhvdG9zQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYnVja2V0LW5hbWVgLFxuICAgIH0pO1xuICB9XG59XG4iXX0=