#!/usr/bin/env node
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
const cdk = __importStar(require("aws-cdk-lib"));
const assertAnthropicApiKeyForCdk_1 = require("../lib/assertAnthropicApiKeyForCdk");
const backend_foundation_stack_1 = require("../lib/backend-foundation-stack");
(0, assertAnthropicApiKeyForCdk_1.assertAnthropicApiKeyForCdk)();
const app = new cdk.App();
new backend_foundation_stack_1.BackendFoundationStack(app, "DietTrackerBackendFoundation", {
    description: "Diet Tracker backend resources (Cognito, API, DynamoDB, S3, Lambda).",
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2VuZC1mb3VuZGF0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmFja2VuZC1mb3VuZGF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLGlEQUFtQztBQUNuQyxvRkFBaUY7QUFDakYsOEVBQXlFO0FBRXpFLElBQUEseURBQTJCLEdBQUUsQ0FBQztBQUU5QixNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQixJQUFJLGlEQUFzQixDQUFDLEdBQUcsRUFBRSw4QkFBOEIsRUFBRTtJQUM5RCxXQUFXLEVBQ1Qsc0VBQXNFO0lBQ3hFLEdBQUcsRUFBRTtRQUNILE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQjtRQUN4QyxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0I7S0FDdkM7Q0FDRixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgeyBhc3NlcnRBbnRocm9waWNBcGlLZXlGb3JDZGsgfSBmcm9tIFwiLi4vbGliL2Fzc2VydEFudGhyb3BpY0FwaUtleUZvckNka1wiO1xuaW1wb3J0IHsgQmFja2VuZEZvdW5kYXRpb25TdGFjayB9IGZyb20gXCIuLi9saWIvYmFja2VuZC1mb3VuZGF0aW9uLXN0YWNrXCI7XG5cbmFzc2VydEFudGhyb3BpY0FwaUtleUZvckNkaygpO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG5uZXcgQmFja2VuZEZvdW5kYXRpb25TdGFjayhhcHAsIFwiRGlldFRyYWNrZXJCYWNrZW5kRm91bmRhdGlvblwiLCB7XG4gIGRlc2NyaXB0aW9uOlxuICAgIFwiRGlldCBUcmFja2VyIGJhY2tlbmQgcmVzb3VyY2VzIChDb2duaXRvLCBBUEksIER5bmFtb0RCLCBTMywgTGFtYmRhKS5cIixcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTixcbiAgfSxcbn0pO1xuIl19