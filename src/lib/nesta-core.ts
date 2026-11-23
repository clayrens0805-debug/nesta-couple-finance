export type PartnerId = 'partner_a' | 'partner_b';

export type ExpenseCategory =
  | 'Sewa'
  | 'Belanja Harian'
  | 'Utilitas'
  | 'Transportasi'
  | 'Makan & Minum'
  | 'Hiburan'
  | 'Rumah Tangga'
  | 'Lainnya';

export type SplitMethod = '50_50' | 'custom_pct' | 'custom_amount';

export interface SharedExpense {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string; // YYYY-MM-DD
  paidBy: PartnerId;
  splitMethod: SplitMethod;
  partnerAShare: number;
  partnerBShare: number;
}

export interface SettlementRecord {
  id: string;
  from: PartnerId;
  to: PartnerId;
  amount: number;
  date: string;
  note?: string;
}

export interface RecurringBill {
  id: string;
  title: string;
  category: 'Sewa' | 'Listrik' | 'Internet' | 'Air' | 'Langganan' | 'Lainnya';
  amount: number;
  dueDate: string;
  frequency: 'Bulanan' | 'Tahunan' | 'Mingguan';
  isPaid: boolean;
  paidBy?: PartnerId;
}

export interface SavingsContribution {
  id: string;
  partner: PartnerId;
  amount: number;
  date: string;
}

export interface SavingsGoal {
  id: string;
  title: string;
  category: string;
  targetAmount: number;
  targetDate: string;
  contributions: SavingsContribution[];
}

export interface SettlementSummary {
  paidA: number;
  paidB: number;
  shouldA: number;
  shouldB: number;
  netA: number;
  netB: number;
  owesFrom: PartnerId | null;
  owesTo: PartnerId | null;
  outstandingAmount: number;
}

export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function calculateSettlement(
  expenses: SharedExpense[],
  settlements: SettlementRecord[]
): SettlementSummary {
  let paidA = 0;
  let paidB = 0;
  let shouldA = 0;
  let shouldB = 0;

  for (const exp of expenses) {
    if (exp.paidBy === 'partner_a') paidA += exp.amount;
    else paidB += exp.amount;
    shouldA += exp.partnerAShare;
    shouldB += exp.partnerBShare;
  }

  let netA = paidA - shouldA;
  let netB = paidB - shouldB;

  for (const s of settlements) {
    if (s.from === 'partner_a') {
      netA += s.amount;
      netB -= s.amount;
    } else {
      netB += s.amount;
      netA -= s.amount;
    }
  }

  const roundedA = Math.round(netA);
  if (Math.abs(roundedA) < 1) {
    return {
      paidA,
      paidB,
      shouldA,
      shouldB,
      netA: 0,
      netB: 0,
      owesFrom: null,
      owesTo: null,
      outstandingAmount: 0,
    };
  }

  if (roundedA > 0) {
    return {
      paidA,
      paidB,
      shouldA,
      shouldB,
      netA: roundedA,
      netB: -roundedA,
      owesFrom: 'partner_b',
      owesTo: 'partner_a',
      outstandingAmount: roundedA,
    };
  }

  return {
    paidA,
    paidB,
    shouldA,
    shouldB,
    netA: roundedA,
    netB: -roundedA,
    owesFrom: 'partner_a',
    owesTo: 'partner_b',
    outstandingAmount: Math.abs(roundedA),
  };
}
