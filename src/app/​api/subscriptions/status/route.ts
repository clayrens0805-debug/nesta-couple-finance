import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest, getSupabaseAdmin } from '@/lib/supabase-admin';
import { canManageCoupleSubscription } from '@/lib/subscription-engine';

export async function GET(req: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server subscription service not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUserFromRequest(req, admin);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const coupleSpaceId = String(searchParams.get('coupleSpaceId') || '');
  if (!coupleSpaceId) {
    return NextResponse.json({ error: 'coupleSpaceId is required.' }, { status: 400 });
  }

  const { data: space } = await admin
    .from('nesta_spaces')
    .select('id, owner_id, partner_id, plan')
    .eq('id', coupleSpaceId)
    .single();

  if (!space || !canManageCoupleSubscription(space, user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: sub } = await admin
    .from('couple_subscriptions')
    .select('*')
    .eq('couple_space_id', coupleSpaceId)
    .in('status', ['active', 'past_due', 'canceled'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    coupleSpaceId,
    effectivePlan: space.plan || 'free',
    subscription: sub || null,
  });
}
