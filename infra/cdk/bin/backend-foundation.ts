#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { assertAnthropicApiKeyForCdk } from "../lib/assertAnthropicApiKeyForCdk";
import { BackendFoundationStack } from "../lib/backend-foundation-stack";

assertAnthropicApiKeyForCdk();

const app = new cdk.App();

new BackendFoundationStack(app, "DietTrackerBackendFoundation", {
  description:
    "Diet Tracker backend resources (Cognito, API, DynamoDB, S3, Lambda).",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
