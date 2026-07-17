// Subscription/entitlement types for the RoofTrax SaaS paywall.
//
// Stripe is the intended source of truth for money: once webhooks are wired, it
// owns `status`, `currentPeriodEnd`, and the stripe_* ids, and the Brain mirrors
// them. Until then these are set manually from the admin UI so the Companies
// view is real. The Brain owns ENTITLEMENT (may this tenant generate a package?)
// and USAGE METERING (packages built per tenant) — never card data.

export type SubscriptionTier = 'payg' | 'starter' | 'pro';

export type PaymentStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'none';

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = ['payg', 'starter', 'pro'];

export const PAYMENT_STATUSES: PaymentStatus[] = [
  'active',
  'past_due',
  'canceled',
  'trialing',
  'none',
];

export const TIER_LABEL: Record<SubscriptionTier, string> = {
  payg: 'Pay-as-you-go',
  starter: 'Starter',
  pro: 'Pro',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  active: 'Active',
  past_due: 'Past Due',
  canceled: 'Canceled',
  trialing: 'Trialing',
  none: 'No Subscription',
};

// Published pricing — base $/month + $/report. Mirrors the internal pricing model
// (PAYG $35 · Starter $100+$25 · Pro $250+$15; migrate at 10 and 15 reports/mo).
export const TIER_PRICING: Record<SubscriptionTier, { base: number; perReport: number }> = {
  payg: { base: 0, perReport: 35 },
  starter: { base: 100, perReport: 25 },
  pro: { base: 250, perReport: 15 },
};

export function isSubscriptionTier(v: unknown): v is SubscriptionTier {
  return typeof v === 'string' && (SUBSCRIPTION_TIERS as string[]).includes(v);
}

export function isPaymentStatus(v: unknown): v is PaymentStatus {
  return typeof v === 'string' && (PAYMENT_STATUSES as string[]).includes(v);
}
