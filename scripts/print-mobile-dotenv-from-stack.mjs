#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { formatExpoPublicEnvFromStackOutputs } from "../lib/dev/stackEnvHints.mjs";

const stackName = process.env.CDK_STACK_NAME ?? "DietTrackerBackendFoundation";
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";

function runAwsDescribeStacks() {
  const raw = execFileSync(
    "aws",
    [
      "cloudformation",
      "describe-stacks",
      "--region",
      region,
      "--stack-name",
      stackName,
      "--query",
      "Stacks[0].Outputs",
      "--output",
      "json",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const outputs = JSON.parse(raw.trim());
  return Object.fromEntries(outputs.map((entry) => [entry.OutputKey, entry.OutputValue]));
}

try {
  const map = runAwsDescribeStacks();
  const lines = formatExpoPublicEnvFromStackOutputs(map, region);
  console.log(lines.join("\n"));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
