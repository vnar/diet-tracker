import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import type { BillingPlan } from "@/lib/billing/plans";

const ddb = new DynamoDBClient({});

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

function subscriptionsTableName() {
  return required("SUBSCRIPTIONS_TABLE_NAME", process.env.SUBSCRIPTIONS_TABLE_NAME);
}

function billingEventsTableName() {
  return required("BILLING_EVENTS_TABLE_NAME", process.env.BILLING_EVENTS_TABLE_NAME);
}

export async function getSubscription(userId: string) {
  const out = await ddb.send(
    new GetItemCommand({
      TableName: subscriptionsTableName(),
      Key: { userId: { S: userId } },
      ConsistentRead: true,
    }),
  );
  if (!out.Item) return null;
  return {
    userId: out.Item.userId?.S ?? userId,
    stripeCustomerId: out.Item.stripeCustomerId?.S ?? null,
    stripeSubscriptionId: out.Item.stripeSubscriptionId?.S ?? null,
    plan: out.Item.plan?.S ?? "free",
    status: out.Item.status?.S ?? "inactive",
    currentPeriodEnd: out.Item.currentPeriodEnd?.S ?? null,
  };
}

export async function putSubscription(input: {
  userId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  plan: BillingPlan | "free";
  status: string;
  currentPeriodEnd?: string | null;
}) {
  await ddb.send(
    new PutItemCommand({
      TableName: subscriptionsTableName(),
      Item: {
        userId: { S: input.userId },
        stripeCustomerId: { S: input.stripeCustomerId ?? "" },
        stripeSubscriptionId: { S: input.stripeSubscriptionId ?? "" },
        plan: { S: input.plan },
        status: { S: input.status },
        currentPeriodEnd: { S: input.currentPeriodEnd ?? "" },
        updatedAt: { S: new Date().toISOString() },
      },
    }),
  );
}

export async function hasBillingEvent(eventId: string): Promise<boolean> {
  const out = await ddb.send(
    new GetItemCommand({
      TableName: billingEventsTableName(),
      Key: { id: { S: eventId } },
      ConsistentRead: true,
    }),
  );
  return Boolean(out.Item);
}

export async function putBillingEvent(input: {
  id: string;
  userId: string;
  type: string;
  payloadJson: string;
  ts: string;
}) {
  await ddb.send(
    new PutItemCommand({
      TableName: billingEventsTableName(),
      Item: {
        id: { S: input.id },
        userId: { S: input.userId },
        type: { S: input.type },
        payloadJson: { S: input.payloadJson },
        ts: { S: input.ts },
      },
    }),
  );
}
