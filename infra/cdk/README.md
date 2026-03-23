# Diet Tracker CDK Infrastructure

This CDK app provisions the Stage 1 backend foundation:

- Cognito User Pool + User Pool Client
- API Gateway HTTP API
- DynamoDB tables: `Entries`, `Settings`
- S3 bucket for photos
- IAM roles and access policies for backend and presigned-URL Lambdas

## Deploy

From repository root:

```bash
npm run infra:cdk:install
npm run infra:cdk:bootstrap
npm run infra:cdk:deploy
```

Useful command:

```bash
npm run infra:cdk:synth
```

## Outputs

The stack exports:

- `Region`
- `ApiUrl`
- `UserPoolId`
- `UserPoolClientId`
- `BucketName`
