import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  computeNextPeriodEnd,
  DEFAULT_PLAN_CATALOG,
  resolveRenewalPricing,
} from '@/lib/subscription-engine';
import { restorePayloadOnUpgrade, type SpacePayload } from '@/lib/downgrade-engine';

function verifyWebhookSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!secret || !signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server subscription service not configured.' }, { status: 503 });
  }

  const secret = (process.env.PAYMENT_WEBHOOK_SECRET || '').trim();
  const rawBody = await req.text();
  const sig = req.headers.get('x-nesta-signature') || req.headers.get('x-callback-token') || '';

  if (!verifyWebhookSignature(rawBody, sig, secret)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const gatewayEventId = String(event.eventId || '');
  const gatewayOrderId = String(event.orderId || '');
  const eventType = String(event.type || 'payment.succeeded'); // 'payment.succeeded' | 'renewal.succeeded' | 'subscription.expired'
  const paidAmountIdr = Number(event.amountIdr || 0);

  if (!gatewayEventId || !gatewayOrderId) {
    return NextResponse.json({ error: 'Missing eventId or orderId' }, { status: 400 });
  }

  // 1. Idempotency check
  const { data: dup } = await admin
    .from('subscription_transactions')
    .select('id')
    .eq('gateway_event_id', gatewayEventId)
    .maybeSingle();

  if (dup) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  // 2. Load pending transaction snapshot
  const { data: tx } = await admin
    .from('subscription_transactions')
    .select('*')
    .eq('gateway_order_id', gatewayOrderId)
    .single();

  if (!tx) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }

  if (eventType === 'subscription.expired') {
    const nowIso = new Date().toISOString();
    await admin
      .from('couple_subscriptions')
      .update({
        status: 'expired',
        grandfathered_pricing: false,
        grandfathered_lost_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', tx.subscription_id);

    // Downgrade Couple Space to Free WITHOUT deleting any user data
    await admin
      .from('nesta_spaces')
      .update({ plan: 'free', active_subscription_id: null, updated_at: nowIso })
      .eq('id', tx.couple_space_id);

    return NextResponse.json({ ok: true, downgraded: true });
  }

  // 3. Verify paid amount matches server snapshot (or grandfathered renewal price)
  const { data: sub } = await admin
    .from('couple_subscriptions')
    .select('*')
    .eq('id', tx.subscription_id)
    .single();

  if (!sub) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  }

  let expectedAmount = tx.amount_idr;
  let grandfatheredApplied = Boolean(tx.grandfathered_applied);

  if (eventType === 'renewal.succeeded') {
    const renewal = resolveRenewalPricing(
      {
        id: sub.id,
        coupleSpaceId: sub.couple_space_id,
        planId: sub.plan_id,
        billingCycle: sub.billing_cycle,
        status: sub.status,
        initialPriceIdr: sub.initial_price_idr,
        renewalPriceIdr: sub.renewal_price_idr,
        promoApplied: sub.promo_applied,
        grandfatheredPricing: sub.grandfathered_pricing,
        grandfatheredLostAt: sub.grandfathered_lost_at,
        startedAt: sub.started_at,
        currentPeriodStart: sub.current_period_start,
        currentPeriodEnd: sub.current_period_end,
        canceledAt: sub.canceled_at,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        managedByUserId: sub.managed_by_user_id,
      },
      DEFAULT_PLAN_CATALOG
    );
    expectedAmount = renewal.amountIdr;
    grandfatheredApplied = renewal.grandfatheredApplied;
  }

  if (paidAmountIdr !== expectedAmount) {
    return NextResponse.json(
      { error: `Amount mismatch: expected ${expectedAmount}, got ${paidAmountIdr}` },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const periodStart = sub.current_period_end && eventType === 'renewal.succeeded' ? sub.current_period_end : nowIso;
  const periodEnd = computeNextPeriodEnd(periodStart, sub.billing_cycle);

  await admin
    .from('subscription_transactions')
    .update({
      status: 'paid',
      gateway_event_id: gatewayEventId,
      grandfathered_applied: grandfatheredApplied,
      paid_at: nowIso,
    })
    .eq('id', tx.id);

  await admin
    .from('couple_subscriptions')
    .update({
      status: 'active',
      started_at: sub.started_at || nowIso,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      updated_at: nowIso,
    })
    .eq('id', sub.id);

  // Activate Premium on the Couple Space & restore any previously archived/inactive items
  const { data: spaceRow } = await admin
    .from('nesta_spaces')
    .select('data')
    .eq('id', sub.couple_space_id)
    .single();

  const restoredData = spaceRow?.data
    ? restorePayloadOnUpgrade(spaceRow.data as SpacePayload)
    : undefined;

  await admin
    .from('nesta_spaces')
    .update({
      plan: 'premium',
      active_subscription_id: sub.id,
      downgrade_review_required: false,
      ...(restoredData ? { data: restoredData } : {}),
      updated_at: nowIso,
    })
    .eq('id', sub.couple_space_id);

  return NextResponse.json({
    ok: true,
    coupleSpaceId: sub.couple_space_id,
    subscriptionId: sub.id,
    periodEnd,
    grandfatheredPricing: sub.grandfathered_pricing,
  });
}
