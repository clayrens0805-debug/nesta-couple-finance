import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest, getSupabaseAdmin } from '@/lib/supabase-admin';
import { canManageCoupleSubscription } from '@/lib/subscription-engine';

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
  const coupleSpaceId = String(body.coupleSpaceId || '');
  if (!coupleSpaceId) {
    return NextResponse.json({ error: 'coupleSpaceId is required.' }, { status: 400 });
  }

  const { data: space } = await admin
    .from('nesta_spaces')
    .select('id, owner_id, partner_id')
    .eq('id', coupleSpaceId)
    .single();

  if (!space || !canManageCoupleSubscription(space, user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: sub } = await admin
    .from('couple_subscriptions')
    .select('*')
    .eq('couple_space_id', coupleSpaceId)
    .eq('status', 'active')
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: 'No active subscription found.' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  await admin
    .from('couple_subscriptions')
    .update({
      cancel_at_period_end: true,
      canceled_at: nowIso,
      grandfathered_pricing: false,
      grandfathered_lost_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', sub.id);

  return NextResponse.json({
    ok: true,
    canceledAt: nowIso,
    accessUntil: sub.current_period_end,
    grandfatheredPricingRetained: false,
  });
}

