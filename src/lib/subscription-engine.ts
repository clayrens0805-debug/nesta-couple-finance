export type PlanId = 'together_free' | 'closer_monthly' | 'closer_annual';
export type BillingCycle = 'monthly' | 'annual';
export type SubscriptionStatus = 'pending' | 'active' | 'past_due' | 'canceled' | 'expired';

export interface PlanCatalogItem {
  id: PlanId;
  name: string;
  billingCycle: 'free' | BillingCycle;
  normalPriceIdr: number;
  promoPriceIdr: number;
  promoActive: boolean;
}

export interface CoupleSubscriptionRecord {
  id: string;
  coupleSpaceId: string;
  planId: 'closer_monthly' | 'closer_annual';
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  initialPriceIdr: number;
  renewalPriceIdr: number;
  promoApplied: boolean;
  grandfatheredPricing: boolean;
  grandfatheredLostAt: string | null;
  startedAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  cancelAtPeriodEnd: boolean;
  managedByUserId: string | null;
}

export const DEFAULT_PLAN_CATALOG: Record<PlanId, PlanCatalogItem> = {
  together_free: {
    id: 'together_free',
    name: 'NESTA Together',
    billingCycle: 'free',
    normalPriceIdr: 0,
    promoPriceIdr: 0,
    promoActive: false,
  },
  closer_monthly: {
    id: 'closer_monthly',
    name: 'NESTA Closer Monthly',
    billingCycle: 'monthly',
    normalPriceIdr: 59000,
    promoPriceIdr: 39000,
    promoActive: true,
  },
  closer_annual: {
    id: 'closer_annual',
    name: 'NESTA Closer Annual',
    billingCycle: 'annual',
    normalPriceIdr: 599000,
    promoPriceIdr: 399000,
    promoActive: true,
  },
};

export interface CheckoutQuote {
  planId: 'closer_monthly' | 'closer_annual';
  billingCycle: BillingCycle;
  amountIdr: number;
  renewalPriceIdr: number;
  promoApplied: boolean;
  grandfatheredPricing: boolean;
}

/**
 * Server-authoritative checkout pricing resolver.
 * Never trusts any price sent from the frontend.
 * Rejects duplicate active subscriptions for the same Couple Space.
 */
export function resolveCheckoutPricing(
  planId: string,
  catalog: Record<PlanId, PlanCatalogItem> = DEFAULT_PLAN_CATALOG,
  existingSpaceSub?: CoupleSubscriptionRecord | null
): CheckoutQuote {
  if (planId !== 'closer_monthly' && planId !== 'closer_annual') {
    throw new Error('INVALID_PLAN_ID');
  }
  if (
    existingSpaceSub &&
    (existingSpaceSub.status === 'active' || existingSpaceSub.status === 'past_due')
  ) {
    throw new Error('DUPLICATE_ACTIVE_SUBSCRIPTION');
  }

  const plan = catalog[planId];
  const promoApplied = Boolean(plan.promoActive && plan.promoPriceIdr > 0 && plan.promoPriceIdr < plan.normalPriceIdr);
  const price = promoApplied ? plan.promoPriceIdr : plan.normalPriceIdr;

  return {
    planId,
    billingCycle: plan.billingCycle as BillingCycle,
    amountIdr: price,
    renewalPriceIdr: price, // Locked snapshot for future renewals
    promoApplied,
    grandfatheredPricing: promoApplied,
  };
}

/**
 * Resolves the exact renewal price for an existing subscription.
 * Early adopters keep their locked promo price as long as the subscription remains active & unbroken.
 * If canceled or expired, grandfathered pricing is permanently forfeited.
 */
export function resolveRenewalPricing(
  sub: CoupleSubscriptionRecord,
  catalog: Record<PlanId, PlanCatalogItem> = DEFAULT_PLAN_CATALOG
): { amountIdr: number; grandfatheredApplied: boolean } {
  const isContinuousActive =
    sub.status === 'active' &&
    !sub.cancelAtPeriodEnd &&
    !sub.canceledAt &&
    !sub.grandfatheredLostAt;

  if (isContinuousActive && sub.grandfatheredPricing) {
    return {
      amountIdr: sub.renewalPriceIdr,
      grandfatheredApplied: true,
    };
  }

  // If canceled/expired or not grandfathered, re-subscribing uses current catalog price
  const currentPlan = catalog[sub.planId];
  const currentPrice = currentPlan.promoActive ? currentPlan.promoPriceIdr : currentPlan.normalPriceIdr;
  return {
    amountIdr: currentPrice,
    grandfatheredApplied: false,
  };
}

export function computeNextPeriodEnd(startIso: string, cycle: BillingCycle): string {
  const d = new Date(startIso);
  if (cycle === 'annual') {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
  } else {
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d.toISOString();
}

export function canManageCoupleSubscription(
  space: { owner_id: string; partner_id?: string | null },
  userId: string
): boolean {
  if (!userId) return false;
  return space.owner_id === userId || space.partner_id === userId;
}

/**
 * Downgrade policy:
 * - Never delete user data (goals, bills, budgets, categories remain visible).
 * - Block creating NEW items when count >= Free limit until count is back within limit.
 */
export const FREE_LIMITS = {
  maxCustomBudgets: 1,
  maxActiveBills: 3,
  maxSavingsGoals: 1,
  maxExtraCustomCategories: 2,
} as const;

export function canCreateUnderPlan(
  plan: 'free' | 'premium',
  resource: keyof typeof FREE_LIMITS,
  currentCount: number
): boolean {
  if (plan === 'premium') return true;
  return currentCount < FREE_LIMITS[resource];
}
