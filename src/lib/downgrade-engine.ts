import { FREE_LIMITS } from './subscription-engine';

export interface DowngradeSelectionInput {
  keepGoalIds: string[];
  keepBillIds: string[];
  keepBudgetIds: string[];
  keepExtraCategories: string[];
}

export interface SpacePayload {
  couple?: { name?: string; plan?: 'free' | 'premium'; [k: string]: unknown };
  goals?: Array<{ id: string; status?: string; readOnly?: boolean; [k: string]: unknown }>;
  bills?: Array<{ id: string; status?: string; readOnly?: boolean; [k: string]: unknown }>;
  customBudgets?: Array<{ id: string; status?: string; readOnly?: boolean; [k: string]: unknown }>;
  categories?: string[];
  billCategories?: string[];
  goalCategories?: string[];
  archivedCategories?: string[];
  expenses?: Array<{ id: string; splitMethod?: string; category?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

export const DEFAULT_EXP_CATS = [
  'Sewa Rumah', 'Belanja Harian', 'Utilitas', 'Transportasi',
  'Makan & Minum', 'Hiburan', 'Rumah Tangga', 'Lainnya',
];
export const DEFAULT_BILL_CATS = ['Sewa Rumah', 'Listrik', 'Internet', 'Air', 'Langganan', 'Lainnya'];
export const DEFAULT_GOAL_CATS = ['Pernikahan', 'Bulan Madu', 'Dana Darurat', 'Uang Muka Rumah', 'Mobil Baru', 'Lainnya'];

export function validateDowngradeSelection(sel: DowngradeSelectionInput): void {
  if (sel.keepGoalIds.length > FREE_LIMITS.maxSavingsGoals) {
    throw new Error(`FREE_GOAL_LIMIT_EXCEEDED: max ${FREE_LIMITS.maxSavingsGoals}`);
  }
  if (sel.keepBillIds.length > FREE_LIMITS.maxActiveBills) {
    throw new Error(`FREE_BILL_LIMIT_EXCEEDED: max ${FREE_LIMITS.maxActiveBills}`);
  }
  if (sel.keepBudgetIds.length > FREE_LIMITS.maxCustomBudgets) {
    throw new Error(`FREE_BUDGET_LIMIT_EXCEEDED: max ${FREE_LIMITS.maxCustomBudgets}`);
  }
  if (sel.keepExtraCategories.length > FREE_LIMITS.maxExtraCustomCategories) {
    throw new Error(`FREE_CATEGORY_LIMIT_EXCEEDED: max ${FREE_LIMITS.maxExtraCustomCategories}`);
  }
}

/**
 * Applies user-confirmed downgrade selections without deleting ANY historical data or modifying historical expenses/splits.
 */
export function applyDowngradeToPayload(
  payload: SpacePayload,
  sel: DowngradeSelectionInput
): SpacePayload {
  validateDowngradeSelection(sel);

  const keepGoals = new Set(sel.keepGoalIds);
  const keepBills = new Set(sel.keepBillIds);
  const keepBudgets = new Set(sel.keepBudgetIds);
  const keepCats = new Set(sel.keepExtraCategories);

  const nextGoals = (payload.goals || []).map((g) => {
    const active = keepGoals.has(g.id);
    return { ...g, status: active ? 'active' : 'archived', readOnly: !active };
  });

  const nextBills = (payload.bills || []).map((b) => {
    const active = keepBills.has(b.id);
    return { ...b, status: active ? 'active' : 'inactive', readOnly: !active };
  });

  const nextBudgets = (payload.customBudgets || []).map((cb) => {
    const active = keepBudgets.has(cb.id);
    return { ...cb, status: active ? 'active' : 'archived', readOnly: !active };
  });

  const allExtraCats = new Set<string>([
    ...(payload.categories || []).filter((c) => !DEFAULT_EXP_CATS.includes(c)),
    ...(payload.billCategories || []).filter((c) => !DEFAULT_BILL_CATS.includes(c)),
    ...(payload.goalCategories || []).filter((c) => !DEFAULT_GOAL_CATS.includes(c)),
  ]);
  const archivedCategories = Array.from(allExtraCats).filter((c) => !keepCats.has(c));

  // Historical expenses & custom splits remain 100% untouched!
  return {
    ...payload,
    couple: { ...(payload.couple || {}), plan: 'free' },
    goals: nextGoals,
    bills: nextBills,
    customBudgets: nextBudgets,
    archivedCategories,
  };
}

/**
 * Restores archived/inactive items to active when the Couple Space upgrades back to NESTA Closer.
 */
export function restorePayloadOnUpgrade(payload: SpacePayload): SpacePayload {
  return {
    ...payload,
    couple: { ...(payload.couple || {}), plan: 'premium' },
    goals: (payload.goals || []).map((g) => ({ ...g, status: 'active', readOnly: false })),
    bills: (payload.bills || []).map((b) => ({ ...b, status: 'active', readOnly: false })),
    customBudgets: (payload.customBudgets || []).map((cb) => ({ ...cb, status: 'active', readOnly: false })),
    archivedCategories: [],
  };
}
