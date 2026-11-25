import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest, getSupabaseAdmin } from '@/lib/supabase-admin';
import { canManageCoupleSubscription } from '@/lib/subscription-engine';
import { applyDowngradeToPayload, type SpacePayload } from '@/lib/downgrade-engine';

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

  const { data: space, error: spErr } = await admin
    .from('nesta_spaces')
    .select('id, owner_id, partner_id, plan, data')
    .eq('id', coupleSpaceId)
    .single();

  if (spErr || !space || !canManageCoupleSubscription(space, user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const updatedData = applyDowngradeToPayload((space.data || {}) as SpacePayload, {
      keepGoalIds: Array.isArray(body.keepGoalIds) ? body.keepGoalIds.map(String) : [],
      keepBillIds: Array.isArray(body.keepBillIds) ? body.keepBillIds.map(String) : [],
      keepBudgetIds: Array.isArray(body.keepBudgetIds) ? body.keepBudgetIds.map(String) : [],
      keepExtraCategories: Array.isArray(body.keepExtraCategories) ? body.keepExtraCategories.map(String) : [],
    });

    const nowIso = new Date().toISOString();
    const { error: updErr } = await admin
      .from('nesta_spaces')
      .update({
        plan: 'free',
        data: updatedData,
        updated_at: nowIso,
      })
      .eq('id', coupleSpaceId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, plan: 'free', data: updatedData });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'INVALID_DOWNGRADE_SELECTION';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
