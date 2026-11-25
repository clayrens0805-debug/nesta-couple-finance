import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest, getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  canManageCoupleSubscription,
  DEFAULT_PLAN_CATALOG,
  type PlanCatalogItem,
  type PlanId,
  resolveCheckoutPricing,
} from '@/lib/subscription-engine';

export async function POST(req: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server subscription service not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUserFromRequest(req, admin);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const planId = String(body.planId || '');
  const coupleSpaceId = String(body.coupleSpaceId || '');
  const gatewayProvider = String(body.gatewayProvider || 'midtrans');

  if (!coupleSpaceId) {
    return NextResponse.json({ error: 'coupleSpaceId is required.' }, { status: 400 });
  }

  // 1. Verify Couple Space exists and user is an authorized member
  const { data: space, error: spaceErr } = await admin
    .from('nesta_spaces')
    .select('id, owner_id, partner_id, plan')
    .eq('id', coupleSpaceId)
    .single();

  if (spaceErr || !space) {
    return NextResponse.json({ error: 'Couple Space not found.' }, { status: 404 });
  }
  if (!canManageCoupleSubscription(space, user.id)) {
    return NextResponse.json({ error: 'Forbidden: not a member of this Couple Space.' }, { status: 403 });
  }

  // 2. Prevent duplicate active subscription / double billing for the same Couple Space
  const { data: existingSub } = await admin
    .from('couple_subscriptions')
    .select('*')
    .eq('couple_space_id', coupleSpaceId)
    .in('status', ['active', 'past_due'])
    .maybeSingle();

  // 3. Load authoritative plan catalog from DB (fallback to server defaults)
  const catalog: Record<PlanId, PlanCatalogItem> = { ...DEFAULT_PLAN_CATALOG };
  const { data: dbPlans } = await admin.from('subscription_plans').select('*');
  if (dbPlans && dbPlans.length > 0) {
    for (const p of dbPlans) {
      if (p.id in catalog) {
        catalog[p.id as PlanId] = {
          id: p.id as PlanId,
          name: p.name,
          billingCycle: p.billing_cycle,
          normalPriceIdr: p.normal_price_idr,
          promoPriceIdr: p.promo_price_idr,
          promoActive: p.promo_active,
        };
      }
    }
  }

  let quote;
  try {
    quote = resolveCheckoutPricing(
      planId,
      catalog,
      existingSub
        ? {
            id: existingSub.id,
            coupleSpaceId: existingSub.couple_space_id,
            planId: existingSub.plan_id,
            billingCycle: existingSub.billing_cycle,
            status: existingSub.status,
            initialPriceIdr: existingSub.initial_price_idr,
            renewalPriceIdr: existingSub.renewal_price_idr,
            promoApplied: existingSub.promo_applied,
            grandfatheredPricing: existingSub.grandfathered_pricing,
            grandfatheredLostAt: existingSub.grandfathered_lost_at,
            startedAt: existingSub.started_at,
            currentPeriodStart: existingSub.current_period_start,
            currentPeriodEnd: existingSub.current_period_end,
            canceledAt: existingSub.canceled_at,
            cancelAtPeriodEnd: existingSub.cancel_at_period_end,
            managedByUserId: existingSub.managed_by_user_id,
          }
        : null
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'CHECKOUT_ERROR';
    if (msg === 'DUPLICATE_ACTIVE_SUBSCRIPTION') {
      return NextResponse.json(
        { error: 'This Couple Space already has an active NESTA Closer subscription.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Invalid plan selected.' }, { status: 400 });
  }

  // 4. Create pending subscription + immutable snapshot transaction (NEVER activates Premium here!)
  const orderId = `NESTA-${coupleSpaceId.slice(0, 8)}-${Date.now()}`;
  const { data: subRow, error: subErr } = await admin
    .from('couple_subscriptions')
    .insert({
      couple_space_id: coupleSpaceId,
      plan_id: quote.planId,
      billing_cycle: quote.billingCycle,
      status: 'pending',
      initial_price_idr: quote.amountIdr,
      renewal_price_idr: quote.renewalPriceIdr,
      promo_applied: quote.promoApplied,
      grandfathered_pricing: quote.grandfatheredPricing,
      managed_by_user_id: user.id,
    })
    .select('id')
    .single();

  if (subErr || !subRow) {
    return NextResponse.json({ error: 'Failed to create pending subscription.' }, { status: 500 });
  }

  const { error: txErr } = await admin.from('subscription_transactions').insert({
    subscription_id: subRow.id,
    couple_space_id: coupleSpaceId,
    user_id: user.id,
    plan_id: quote.planId,
    billing_cycle: quote.billingCycle,
    transaction_type: 'initial',
    amount_idr: quote.amountIdr,
    promo_applied: quote.promoApplied,
    grandfathered_applied: quote.grandfatheredPricing,
    status: 'pending',
    gateway_provider: gatewayProvider,
    gateway_order_id: orderId,
  });

  if (txErr) {
    return NextResponse.json({ error: 'Failed to create transaction snapshot.' }, { status: 500 });
  }

  return NextResponse.json({
    orderId,
    subscriptionId: subRow.id,
    coupleSpaceId,
    planId: quote.planId,
    billingCycle: quote.billingCycle,
    amountIdr: quote.amountIdr,
    renewalPriceIdr: quote.renewalPriceIdr,
    promoApplied: quote.promoApplied,
    grandfatheredPricing: quote.grandfatheredPricing,
    status: 'pending_payment_webhook',
  });
}
