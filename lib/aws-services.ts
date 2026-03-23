import {
  Activity,
  Database,
  Globe,
  HardDrive,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface AWSService {
  id: string;
  shortName: string;
  fullName: string;
  status: "online" | "offline" | "degraded";
  Icon: LucideIcon;
  iconColor: string;
}

export const AWS_SERVICES: AWSService[] = [
  {
    id: "amplify",
    shortName: "Hosting",
    fullName: "Amplify Hosting",
    status: "online",
    Icon: Globe,
    iconColor: "text-orange-400",
  },
  {
    id: "cognito",
    shortName: "Cognito",
    fullName: "Amazon Cognito",
    status: "online",
    Icon: User,
    iconColor: "text-red-400",
  },
  {
    id: "apigw",
    shortName: "API GW",
    fullName: "API Gateway",
    status: "online",
    Icon: Activity,
    iconColor: "text-pink-400",
  },
  {
    id: "lambda",
    shortName: "Lambda",
    fullName: "AWS Lambda",
    status: "online",
    Icon: Zap,
    iconColor: "text-orange-400",
  },
  {
    id: "dynamodb",
    shortName: "DynamoDB",
    fullName: "Amazon DynamoDB",
    status: "online",
    Icon: Database,
    iconColor: "text-blue-400",
  },
  {
    id: "s3",
    shortName: "S3",
    fullName: "Amazon S3",
    status: "online",
    Icon: HardDrive,
    iconColor: "text-green-400",
  },
];

export const CHANGELOG = [
  {
    version: "v1.0.0",
    date: "Mar 21 2026",
    note: "Amplify static hosting pipeline · Initial release",
    latest: true,
  },
  {
    version: "v0.9.0",
    date: "Mar 14 2026",
    note: "Auth flow with Cognito · DynamoDB entries schema",
    latest: false,
  },
];
