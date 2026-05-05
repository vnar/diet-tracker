# Billing Scaffolding (P0.4)

## Stripe products to create manually

- Pro Monthly — `$9.99/mo`
- Pro Annual — `$79/yr`
- Family Monthly — `$14.99/mo`
- Elite Monthly — `$69/mo`

Set the created Stripe price IDs in:

- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_ANNUAL`
- `STRIPE_PRICE_FAMILY_MONTHLY`
- `STRIPE_PRICE_ELITE_MONTHLY`

## New routes

- `POST /api/v2/billing/create-checkout-session`
- `POST /api/v2/billing/portal`
- `POST /api/v2/billing/webhook`

## New cloud tables (CDK)

- `Subscriptions`
  - `userId` (pk)
  - `stripeCustomerId`
  - `stripeSubscriptionId`
  - `plan`
  - `status`
  - `currentPeriodEnd`
  - `updatedAt`

- `BillingEvents`
  - `id` (pk, Stripe event id)
  - `userId`
  - `type`
  - `payloadJson`
  - `ts`

## Idempotency

Webhook processing stores each Stripe event id in `BillingEvents`. If an event id already exists, the handler returns idempotent success and skips duplicate writes.

## Current UX status

`/account/billing` is live with current plan display (`Free`) and an Upgrade button.
The button emits an analytics event and shows a "Coming soon" toast.
No paywall is enabled yet (`FF_BILLING_ENABLED=false` by default).
