'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Receipt,
  PieChart,
  CalendarClock,
  Target,
  Settings,
  LogOut,
  Plus,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  CheckCircle2,
  Landmark,
  Wallet,
  PiggyBank,
  Pencil,
  Trash2,
  Download,
  FileText,
  HelpCircle,
  Languages,
  Bell,
  ShieldCheck,
  Tags,
  UserCheck,
  Calendar,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type PartnerId = 'partner_a' | 'partner_b';
type SplitMethod = '50_50' | 'custom_pct' | 'custom_amount';
type PaymentSource = 'talangan' | 'kas_bersama';
type PageId = 'landing' | 'dashboard' | 'couple' | 'expenses' | 'budgets' | 'bills' | 'goals' | 'settings';
type Lang = 'id' | 'en';

interface SharedExpense {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  paymentSource: PaymentSource;
  paidBy: string;
  splitMethod: SplitMethod;
  partnerAShare: number;
  partnerBShare: number;
  note?: string;
}

interface PoolDeposit {
  id: string;
  partner: PartnerId;
  amount: number;
  date: string;
  note: string;
}

interface SettlementRecord {
  id: string;
  from: PartnerId;
  to: PartnerId;
  amount: number;
  date: string;
}

interface CustomBudget {
  id: string;
  name: string;
  category: string;
  limit: number;
}

interface RecurringBill {
  id: string;
  title: string;
  category: string;
  amount: number;
  dueDate: string;
  frequency: 'Bulanan' | 'Tahunan' | 'Mingguan';
  paidMonths: Record<string, { source: PaymentSource; paidBy: string }>;
}

interface SavingsGoal {
  id: string;
  title: string;
  category: string;
  targetAmount: number;
  targetDate: string;
  contributions: { id: string; partner: PartnerId; amount: number; date: string }[];
}

interface RegisteredUser {
  name: string;
  email: string;
  pass: string;
  role: PartnerId;
  avatar?: string;
}

const STORAGE_KEY = 'nesta_nextjs_state_v2';
const DEFAULT_CATEGORIES = ['Sewa Rumah', 'Belanja Harian', 'Utilitas', 'Transportasi', 'Makan & Minum', 'Hiburan', 'Rumah Tangga', 'Lainnya'];
const DEFAULT_BILL_CATEGORIES = ['Sewa Rumah', 'Listrik', 'Internet', 'Air', 'Langganan', 'Lainnya'];
const DEFAULT_GOAL_CATEGORIES = ['Pernikahan', 'Bulan Madu', 'Dana Darurat', 'Uang Muka Rumah', 'Mobil Baru', 'Lainnya'];

const CAT_EN_MAP: Record<string, string> = {
  'Sewa Rumah': 'Rent',
  'Belanja Harian': 'Groceries',
  Utilitas: 'Utilities',
  Transportasi: 'Transportation',
  'Makan & Minum': 'Dining',
  Hiburan: 'Entertainment',
  'Rumah Tangga': 'Household',
  Lainnya: 'Other',
  Listrik: 'Electricity',
  Internet: 'Internet',
  Air: 'Water',
  Langganan: 'Subscriptions',
  Pernikahan: 'Wedding',
  'Bulan Madu': 'Honeymoon',
  'Dana Darurat': 'Emergency Fund',
  'Uang Muka Rumah': 'House Down Payment',
  'Mobil Baru': 'New Car',
};

function formatIDR(num: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(num || 0));
}

function parseNominal(val: string | number): number {
  const digits = String(val || '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

function formatNominalStr(num: number): string {
  const n = Math.round(Number(num || 0));
  return n ? new Intl.NumberFormat('id-ID').format(n) : '';
}

function currentYM(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function NestaPage() {
  const [hydrated, setHydrated] = useState(false);
  const [lang, setLang] = useState<Lang>('id');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [activePage, setActivePage] = useState<PageId>('landing');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(currentYM());
  const [toast, setToast] = useState<string | null>(null);

  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [currentUser, setCurrentUser] = useState<RegisteredUser | null>(null);

  const [coupleName, setCoupleName] = useState('Ruang Finansial Bersama');
  const [inviteCode, setInviteCode] = useState('https://nesta.id/couple/abc123');
  const [partnerAName, setPartnerAName] = useState('Clayrens');
  const [partnerBName, setPartnerBName] = useState('Pasangan');
  const [monthlyBudgets, setMonthlyBudgets] = useState<Record<string, number>>({});
  const [customBudgets, setCustomBudgets] = useState<CustomBudget[]>([]);
  const [expenses, setExpenses] = useState<SharedExpense[]>([]);
  const [poolDeposits, setPoolDeposits] = useState<PoolDeposit[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);

  const [categories, setCategories] = useState<string[]>([...DEFAULT_CATEGORIES]);
  const [billCategories, setBillCategories] = useState<string[]>([...DEFAULT_BILL_CATEGORIES]);
  const [goalCategories, setGoalCategories] = useState<string[]>([...DEFAULT_GOAL_CATEGORIES]);
  const [notifications, setNotifications] = useState({ billReminder: true, monthlyWrapup: true });

  // Filters & Modals
  const [expSearch, setExpSearch] = useState('');
  const [expCatFilter, setExpCatFilter] = useState('Semua');
  const [expSrcFilter, setExpSrcFilter] = useState('Semua');
  const [billFilter, setBillFilter] = useState<'Semua' | 'Belum Dibayar' | 'Sudah Dibayar'>('Semua');

  const [showExpModal, setShowExpModal] = useState(false);
  const [editingExpId, setEditingExpId] = useState<string | null>(null);
  const [expTitle, setExpTitle] = useState('');
  const [expCat, setExpCat] = useState(DEFAULT_CATEGORIES[0]);
  const [expDate, setExpDate] = useState(currentYM() + '-15');
  const [expAmountStr, setExpAmountStr] = useState('');
  const [expSource, setExpSource] = useState<PaymentSource>('talangan');
  const [expPaidBy, setExpPaidBy] = useState<PartnerId>('partner_a');
  const [expSplit, setExpSplit] = useState<SplitMethod>('50_50');
  const [pctA, setPctA] = useState(50);
  const [amtAStr, setAmtAStr] = useState('');
  const [amtBStr, setAmtBStr] = useState('');
  const [expNote, setExpNote] = useState('');

  const [showDepModal, setShowDepModal] = useState(false);
  const [depPartner, setDepPartner] = useState<PartnerId>('partner_a');
  const [depAmountStr, setDepAmountStr] = useState('');
  const [depDate, setDepDate] = useState(currentYM() + '-01');
  const [depNote, setDepNote] = useState('');

  const [showWrapup, setShowWrapup] = useState(false);
  const [payBillId, setPayBillId] = useState<string | null>(null);
  const [payBillChoice, setPayBillChoice] = useState<'kas_bersama' | 'talangan_a' | 'talangan_b'>('kas_bersama');

  // Auth form states
  const [authName, setAuthName] = useState('');
  const [authRole, setAuthRole] = useState<PartnerId>('partner_a');
  const [authInvite, setAuthInvite] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authErr, setAuthErr] = useState('');

  // Inline form states
  const [budgetInputStr, setBudgetInputStr] = useState('');
  const [cbName, setCbName] = useState('');
  const [cbCat, setCbCat] = useState(DEFAULT_CATEGORIES[0]);
  const [cbLimitStr, setCbLimitStr] = useState('');
  const [billTitle, setBillTitle] = useState('');
  const [billCat, setBillCat] = useState(DEFAULT_BILL_CATEGORIES[0]);
  const [billAmtStr, setBillAmtStr] = useState('');
  const [billDue, setBillDue] = useState(currentYM() + '-25');
  const [billFreq, setBillFreq] = useState<'Bulanan' | 'Tahunan' | 'Mingguan'>('Bulanan');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalCat, setGoalCat] = useState(DEFAULT_GOAL_CATEGORIES[0]);
  const [goalTargetStr, setGoalTargetStr] = useState('');
  const [goalDate, setGoalDate] = useState('2027-12-31');

  const isEn = lang === 'en';
  const displayCat = (c: string) => (isEn && CAT_EN_MAP[c] ? CAT_EN_MAP[c] : c);
  const partnerName = (id: string) => (id === 'kas_bersama' ? (isEn ? 'Shared Pot' : 'Kas Bersama') : id === 'partner_a' ? partnerAName : partnerBName);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.lang) setLang(d.lang);
        if (d.isAuthenticated) setIsAuthenticated(d.isAuthenticated);
        if (d.activePage) setActivePage(d.activePage);
        if (d.selectedMonth) setSelectedMonth(d.selectedMonth);
        if (d.registeredUsers) setRegisteredUsers(d.registeredUsers);
        if (d.currentUser) setCurrentUser(d.currentUser);
        if (d.coupleName) setCoupleName(d.coupleName);
        if (d.inviteCode) setInviteCode(d.inviteCode);
        if (d.partnerAName) setPartnerAName(d.partnerAName);
        if (d.partnerBName) setPartnerBName(d.partnerBName);
        if (d.monthlyBudgets) setMonthlyBudgets(d.monthlyBudgets);
        if (d.customBudgets) setCustomBudgets(d.customBudgets);
        if (d.expenses) setExpenses(d.expenses);
        if (d.poolDeposits) setPoolDeposits(d.poolDeposits);
        if (d.settlements) setSettlements(d.settlements);
        if (d.bills) setBills(d.bills);
        if (d.goals) setGoals(d.goals);
        if (d.categories) setCategories(d.categories);
        if (d.billCategories) setBillCategories(d.billCategories);
        if (d.goalCategories) setGoalCategories(d.goalCategories);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          lang,
          isAuthenticated,
          activePage,
          selectedMonth,
          registeredUsers,
          currentUser,
          coupleName,
          inviteCode,
          partnerAName,
          partnerBName,
          monthlyBudgets,
          customBudgets,
          expenses,
          poolDeposits,
          settlements,
          bills,
          goals,
          categories,
          billCategories,
          goalCategories,
        })
      );
    } catch {}
  }, [hydrated, lang, isAuthenticated, activePage, selectedMonth, registeredUsers, currentUser, coupleName, inviteCode, partnerAName, partnerBName, monthlyBudgets, customBudgets, expenses, poolDeposits, settlements, bills, goals, categories, billCategories, goalCategories]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowExpModal(false);
        setShowDepModal(false);
        setShowWrapup(false);
        setPayBillId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const monthOptions = useMemo(() => {
    const s = new Set<string>([currentYM()]);
    expenses.forEach(e => e.date && s.add(e.date.slice(0, 7)));
    poolDeposits.forEach(d => d.date && s.add(d.date.slice(0, 7)));
    return Array.from(s).sort().reverse();
  }, [expenses, poolDeposits]);

  const formatMonthLabel = (ym: string) => {
    const [y, m] = ym.split('-');
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString(isEn ? 'en-US' : 'id-ID', { month: 'long', year: 'numeric' });
  };

  const monthExps = useMemo(() => expenses.filter(e => e.date.startsWith(selectedMonth)), [expenses, selectedMonth]);
  const monthBudget = monthlyBudgets[selectedMonth] || 0;
  const totalSpent = useMemo(() => monthExps.reduce((s, e) => s + e.amount, 0), [monthExps]);

  const settle = useMemo(() => {
    const talanganExps = monthExps.filter(e => e.paymentSource !== 'kas_bersama');
    let paidA = 0, paidB = 0, shouldA = 0, shouldB = 0;
    talanganExps.forEach(e => {
      if (e.paidBy === 'partner_a') paidA += e.amount;
      else if (e.paidBy === 'partner_b') paidB += e.amount;
      shouldA += e.partnerAShare;
      shouldB += e.partnerBShare;
    });
    let netA = paidA - shouldA;
    settlements.filter(s => s.date.startsWith(selectedMonth)).forEach(s => {
      if (s.from === 'partner_a') netA += s.amount;
      else netA -= s.amount;
    });
    const rounded = Math.round(netA);
    if (Math.abs(rounded) < 1) return { paidA, paidB, shouldA, shouldB, owesFrom: null as PartnerId | null, owesTo: null as PartnerId | null, amount: 0 };
    if (rounded > 0) return { paidA, paidB, shouldA, shouldB, owesFrom: 'partner_b' as PartnerId, owesTo: 'partner_a' as PartnerId, amount: rounded };
    return { paidA, paidB, shouldA, shouldB, owesFrom: 'partner_a' as PartnerId, owesTo: 'partner_b' as PartnerId, amount: Math.abs(rounded) };
  }, [monthExps, settlements, selectedMonth]);

  const kas = useMemo(() => {
    const totalDepAll = poolDeposits.reduce((s, d) => s + d.amount, 0);
    const totalSpentAll = expenses.filter(e => e.paymentSource === 'kas_bersama').reduce((s, e) => s + e.amount, 0);
    const monthDepA = poolDeposits.filter(d => d.date.startsWith(selectedMonth) && d.partner === 'partner_a').reduce((s, d) => s + d.amount, 0);
    const monthDepB = poolDeposits.filter(d => d.date.startsWith(selectedMonth) && d.partner === 'partner_b').reduce((s, d) => s + d.amount, 0);
    const monthSpent = monthExps.filter(e => e.paymentSource === 'kas_bersama').reduce((s, e) => s + e.amount, 0);
    return { saldoTotal: totalDepAll - totalSpentAll, totalDepAll, totalSpentAll, monthDepA, monthDepB, monthSpent };
  }, [poolDeposits, expenses, monthExps, selectedMonth]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthErr('');
    const email = authEmail.trim().toLowerCase();
    if (!email || authPass.length < 6) {
      setAuthErr(isEn ? 'Enter a valid email and password (min 6 chars).' : 'Masukkan email valid dan kata sandi minimal 6 karakter.');
      return;
    }
    if (authTab === 'forgot') {
      const u = registeredUsers.find(x => x.email === email);
      if (!u) {
        setAuthErr(isEn ? 'Email not registered.' : 'Email belum terdaftar.');
        return;
      }
      setRegisteredUsers(prev => prev.map(x => (x.email === email ? { ...x, pass: authPass } : x)));
      setAuthTab('login');
      notify(isEn ? 'Password updated! Please sign in.' : 'Kata sandi diperbarui! Silakan masuk.');
      return;
    }
    if (authTab === 'register') {
      if (registeredUsers.some(u => u.email === email)) {
        setAuthErr(isEn ? 'Email already registered.' : 'Email sudah terdaftar.');
        return;
      }
      if (authRole === 'partner_b') {
        const code = inviteCode.split('/').pop() || '';
        if (!authInvite.includes(code)) {
          setAuthErr(isEn ? `Invalid invite code. Use ${code}` : `Kode undangan tidak cocok. Gunakan ${code}`);
          return;
        }
        setPartnerBName(authName || 'Partner');
      } else {
        setPartnerAName(authName || 'Partner A');
        setCoupleName((isEn ? 'Shared Space ' : 'Ruang Bersama ') + (authName || ''));
        setInviteCode('https://nesta.id/couple/' + Math.random().toString(36).substring(2, 8));
      }
      const newUser: RegisteredUser = { name: authName || email.split('@')[0], email, pass: authPass, role: authRole };
      setRegisteredUsers(prev => [...prev, newUser]);
      setCurrentUser(newUser);
      setIsAuthenticated(true);
      setActivePage('dashboard');
      notify((isEn ? 'Welcome, ' : 'Selamat datang, ') + newUser.name);
      return;
    }
    const found = registeredUsers.find(u => u.email === email && u.pass === authPass);
    if (!found) {
      setAuthErr(isEn ? 'Invalid email or password.' : 'Email atau kata sandi salah.');
      return;
    }
    setCurrentUser(found);
    setIsAuthenticated(true);
    setActivePage('dashboard');
  };

  const handleGoogleLogin = async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signInWithOAuth({ provider: 'google' });
      return;
    }
    const gUser: RegisteredUser = { name: partnerAName || 'Clayrens', email: 'clayrens@gmail.com', pass: 'google-oauth', role: 'partner_a' };
    if (!registeredUsers.some(u => u.email === gUser.email)) setRegisteredUsers(prev => [...prev, gUser]);
    setCurrentUser(gUser);
    setIsAuthenticated(true);
    setActivePage('dashboard');
    notify(isEn ? 'Signed in with Google!' : 'Berhasil masuk dengan Google!');
  };

  const exportCSV = () => {
    const headers = isEn
      ? ['Date', 'Description', 'Category', 'Model', 'Paid By', 'Amount', partnerAName, partnerBName, 'Note']
      : ['Tanggal', 'Deskripsi', 'Kategori', 'Model', 'Ditalangi', 'Nominal', partnerAName, partnerBName, 'Catatan'];
    const rows = monthExps.map(e => [
      e.date,
      `"${e.title.replace(/"/g, '""')}"`,
      `"${displayCat(e.category)}"`,
      e.paymentSource === 'kas_bersama' ? (isEn ? 'Shared Pot' : 'Kas Bersama') : (isEn ? 'Advance' : 'Talangan'),
      e.paymentSource === 'kas_bersama' ? '-' : partnerName(e.paidBy),
      e.amount,
      e.partnerAShare,
      e.partnerBShare,
      `"${(e.note || '').replace(/"/g, '""')}"`,
    ]);
    const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NESTA-Report-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(isEn ? 'CSV exported!' : 'CSV berhasil diunduh!');
  };

  const exportPDF = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.setFillColor(15, 30, 40);
    doc.rect(0, 0, 595, 80, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('NESTA — Separate Money. Shared Life.', 40, 46);
    doc.setTextColor(16, 29, 43);
    doc.setFontSize(12);
    doc.text(`${coupleName} (${formatMonthLabel(selectedMonth)})`, 40, 110);
    doc.setFontSize(10);
    doc.text(`${isEn ? 'Total Expenses' : 'Total Pengeluaran'}: ${formatIDR(totalSpent)}`, 40, 132);
    doc.text(`${isEn ? 'Shared Pot' : 'Kas Bersama'}: ${formatIDR(kas.saldoTotal)}`, 40, 150);
    let y = 180;
    monthExps.forEach(e => {
      doc.text(`${e.date} | ${e.title} | ${displayCat(e.category)} | ${formatIDR(e.amount)}`, 40, y);
      y += 18;
    });
    doc.save(`NESTA-Report-${selectedMonth}.pdf`);
    notify(isEn ? 'PDF exported!' : 'PDF berhasil diunduh!');
  };

  const openAddExpense = (exp?: SharedExpense) => {
    if (exp) {
      setEditingExpId(exp.id);
      setExpTitle(exp.title);
      setExpCat(exp.category);
      setExpDate(exp.date);
      setExpAmountStr(formatNominalStr(exp.amount));
      setExpSource(exp.paymentSource);
      setExpPaidBy((exp.paidBy === 'partner_b' ? 'partner_b' : 'partner_a'));
      setExpSplit(exp.splitMethod);
      setExpNote(exp.note || '');
      if (exp.amount > 0) setPctA(Math.round((exp.partnerAShare / exp.amount) * 100));
      setAmtAStr(formatNominalStr(exp.partnerAShare));
      setAmtBStr(formatNominalStr(exp.partnerBShare));
    } else {
      setEditingExpId(null);
      setExpTitle('');
      setExpCat(categories[0] || 'Lainnya');
      setExpDate(selectedMonth + '-15');
      setExpAmountStr('');
      setExpSource('talangan');
      setExpPaidBy(currentUser?.role || 'partner_a');
      setExpSplit('50_50');
      setPctA(50);
      setAmtAStr('');
      setAmtBStr('');
      setExpNote('');
    }
    setShowExpModal(true);
  };

  const computedShares = useMemo(() => {
    const total = parseNominal(expAmountStr);
    if (expSplit === '50_50') {
      const a = Math.round(total / 2);
      return { a, b: total - a };
    }
    if (expSplit === 'custom_pct') {
      const a = Math.round((total * pctA) / 100);
      return { a, b: total - a };
    }
    return { a: parseNominal(amtAStr), b: parseNominal(amtBStr) };
  }, [expAmountStr, expSplit, pctA, amtAStr, amtBStr]);

  const saveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseNominal(expAmountStr);
    if (!expTitle.trim() || amount <= 0) return;
    const item: SharedExpense = {
      id: editingExpId || 'exp-' + Date.now(),
      title: expTitle.trim(),
      category: expCat,
      amount,
      date: expDate,
      paymentSource: expSource,
      paidBy: expSource === 'kas_bersama' ? 'kas_bersama' : expPaidBy,
      splitMethod: expSource === 'kas_bersama' ? '50_50' : expSplit,
      partnerAShare: computedShares.a,
      partnerBShare: computedShares.b,
      note: expNote.trim(),
    };
    if (editingExpId) setExpenses(prev => prev.map(x => (x.id === editingExpId ? item : x)));
    else setExpenses(prev => [item, ...prev]);
    setSelectedMonth(expDate.slice(0, 7));
    setShowExpModal(false);
    notify(isEn ? 'Expense saved!' : 'Pengeluaran tersimpan!');
  };

  if (!hydrated) return null;

  if (!isAuthenticated || activePage === 'landing') {
    return (
      <div className="min-h-screen bg-[#F7F6F2] text-[#101D2B] p-4 sm:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0F1E28] flex items-center justify-center text-[#16A37B] font-bold text-xl">N</div>
              <div>
                <div className="text-2xl font-bold tracking-tight">NESTA</div>
                <div className="text-xs text-[#5E6D7E]">Separate Money. Shared Life.</div>
              </div>
            </div>
            <div className="inline-flex bg-white border border-[#EAE7DF] rounded-xl p-0.5 text-xs font-semibold">
              <button onClick={() => setLang('id')} className={`px-3 py-1.5 rounded-lg ${!isEn ? 'bg-[#0F1E28] text-white' : 'text-[#5E6D7E]'}`}>ID</button>
              <button onClick={() => setLang('en')} className={`px-3 py-1.5 rounded-lg ${isEn ? 'bg-[#0F1E28] text-white' : 'text-[#5E6D7E]'}`}>EN</button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 rounded-3xl bg-gradient-to-br from-[#0F1E28] via-[#152B38] to-[#0E4D38] text-white p-8 flex flex-col justify-between shadow-lg">
              <div>
                <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-xs font-medium text-[#34D399] mb-4">{isEn ? 'Couple & Family Finance' : 'Keuangan Pasangan & Keluarga'}</span>
                <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">Separate Money.<br />Shared Life.</h1>
                <p className="text-sm text-[#CBD5E1] mb-6">{isEn ? 'Manage monthly shared expenses, shared pots, bills, and goals without merging personal bank accounts.' : 'Kelola pengeluaran bulanan, kas bersama, tagihan rutin, dan target masa depan tanpa menggabungkan rekening pribadi.'}</p>
              </div>
              <div className="pt-6 border-t border-white/15 flex justify-between text-xs text-[#9FB0BE]">
                <span>{isSupabaseConfigured ? 'Supabase Cloud Connected' : 'Local Persistence Mode'}</span>
                <span>IDR (Rp)</span>
              </div>
            </div>

            <div className="lg:col-span-6 bg-white border border-[#EAE7DF] rounded-2xl p-7 shadow-sm">
              <div className="flex gap-2 p-1 bg-[#F7F6F2] rounded-xl mb-5">
                <button onClick={() => setAuthTab('login')} className={`flex-1 py-2 rounded-lg text-xs font-semibold ${authTab === 'login' ? 'bg-white shadow-sm' : 'text-[#5E6D7E]'}`}>{isEn ? 'Sign In' : 'Masuk'}</button>
                <button onClick={() => setAuthTab('register')} className={`flex-1 py-2 rounded-lg text-xs font-semibold ${authTab === 'register' ? 'bg-white shadow-sm' : 'text-[#5E6D7E]'}`}>{isEn ? 'Create Account' : 'Daftar Akun'}</button>
              </div>

              <button type="button" onClick={handleGoogleLogin} className="w-full py-2.5 px-4 rounded-xl border border-[#EAE7DF] hover:bg-[#F7F6F2] text-sm font-semibold mb-4 flex items-center justify-center gap-2">
                <span>{isEn ? 'Continue with Google' : 'Masuk dengan Google'}</span>
              </button>

              <form onSubmit={handleAuthSubmit} className="space-y-3">
                {authTab === 'register' && (
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" required placeholder={isEn ? 'Name' : 'Nama'} value={authName} onChange={e => setAuthName(e.target.value)} className="px-3.5 py-2.5 rounded-xl border border-[#EAE7DF] text-sm" />
                    <select value={authRole} onChange={e => setAuthRole(e.target.value as PartnerId)} className="px-3 py-2.5 rounded-xl border border-[#EAE7DF] text-sm bg-white">
                      <option value="partner_a">{isEn ? 'Create New Space' : 'Buat Ruang Baru'}</option>
                      <option value="partner_b">{isEn ? 'Join Invite' : 'Gabung Undangan'}</option>
                    </select>
                  </div>
                )}
                {authTab === 'register' && authRole === 'partner_b' && (
                  <input type="text" placeholder={isEn ? 'Paste invite link/code' : 'Tempel tautan/kode undangan'} value={authInvite} onChange={e => setAuthInvite(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-[#EAE7DF] text-sm" />
                )}
                <input type="email" required placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-[#EAE7DF] text-sm" />
                <input type="password" required minLength={6} placeholder={isEn ? 'Password (min 6)' : 'Kata Sandi (min 6)'} value={authPass} onChange={e => setAuthPass(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-[#EAE7DF] text-sm" />
                {authTab === 'login' && (
                  <div className="text-right">
                    <button type="button" onClick={() => setAuthTab('forgot')} className="text-xs font-semibold text-[#16A37B] hover:underline">{isEn ? 'Forgot password?' : 'Lupa kata sandi?'}</button>
                  </div>
                )}
                {authErr && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{authErr}</div>}
                <button type="submit" className="w-full py-3 rounded-xl bg-[#0E4D38] text-white text-sm font-semibold">
                  {authTab === 'forgot' ? (isEn ? 'Reset Password' : 'Simpan Sandi Baru') : authTab === 'register' ? (isEn ? 'Create Account' : 'Daftar & Masuk') : (isEn ? 'Sign In' : 'Masuk')}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const navItems: { id: PageId; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: isEn ? 'Dashboard' : 'Ringkasan', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'couple', label: isEn ? 'Couple Space' : 'Ruang Pasangan', icon: <Users className="w-4 h-4" /> },
    { id: 'expenses', label: isEn ? 'Expenses' : 'Pengeluaran', icon: <Receipt className="w-4 h-4" /> },
    { id: 'budgets', label: isEn ? 'Budgets' : 'Anggaran', icon: <PieChart className="w-4 h-4" /> },
    { id: 'bills', label: isEn ? 'Bills' : 'Tagihan', icon: <CalendarClock className="w-4 h-4" /> },
    { id: 'goals', label: isEn ? 'Savings Goals' : 'Target Tabungan', icon: <Target className="w-4 h-4" /> },
    { id: 'settings', label: isEn ? 'Settings & Privacy' : 'Pengaturan & Privasi', icon: <Settings className="w-4 h-4" /> },
  ];

  const unpaidBills = bills.filter(b => !b.paidMonths?.[selectedMonth]);
  const unpaidTotal = unpaidBills.reduce((s, b) => s + b.amount, 0);
  const pctBudget = monthBudget > 0 ? Math.min(100, Math.round((totalSpent / monthBudget) * 100)) : 0;

  return (
    <div className="min-h-screen flex bg-[#F7F6F2] text-[#101D2B]">
      {/* Desktop Collapsible Left Sidebar */}
      {sidebarOpen && (
        <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 bg-[#0F1E28] text-white z-30">
          <div className="px-5 pt-6 pb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#16A37B] flex items-center justify-center font-bold text-lg">N</div>
              <div>
                <div className="text-xl font-bold leading-none">NESTA</div>
                <div className="text-[11px] text-[#8FA2B2] mt-1">Separate Money. Shared Life.</div>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg text-[#9FB0BE] hover:text-white hover:bg-white/10">
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
          <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
            {navItems.map(n => (
              <button key={n.id} onClick={() => setActivePage(n.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm ${activePage === n.id ? 'bg-[#1D313F] text-white font-semibold' : 'text-[#9FB0BE] hover:bg-white/5 hover:text-white'}`}>
                {n.icon}
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-white/10 space-y-3">
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-full bg-[#16A37B] flex items-center justify-center text-xs font-bold overflow-hidden">
                {currentUser?.avatar ? <img src={currentUser.avatar} alt="Avatar" className="w-full h-full object-cover" /> : (currentUser?.name?.[0] || 'N')}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{currentUser?.name}</div>
                <div className="text-[10px] text-[#8FA2B2] truncate">{currentUser?.email}</div>
              </div>
            </div>
            <button onClick={() => { setIsAuthenticated(false); setActivePage('landing'); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[#9FB0BE] hover:text-white hover:bg-white/5">
              <LogOut className="w-4 h-4" /> <span>{isEn ? 'Sign Out' : 'Keluar Akun'}</span>
            </button>
          </div>
        </aside>
      )}

      {/* Mobile Left Drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-[#0F1E28]/50" onClick={() => setMobileDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-[#0F1E28] text-white p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <span className="text-lg font-bold">NESTA</span>
                <button onClick={() => setMobileDrawerOpen(false)} className="p-2 rounded-lg bg-white/10"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-1">
                {navItems.map(n => (
                  <button key={n.id} onClick={() => { setActivePage(n.id); setMobileDrawerOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm ${activePage === n.id ? 'bg-[#1D313F] text-white font-semibold' : 'text-[#9FB0BE]'}`}>
                    {n.icon} <span>{n.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => { setIsAuthenticated(false); setActivePage('landing'); setMobileDrawerOpen(false); }} className="flex items-center gap-2 px-3 py-2 text-xs text-[#9FB0BE]">
              <LogOut className="w-4 h-4" /> <span>{isEn ? 'Sign Out' : 'Keluar Akun'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className={`flex-1 pb-12 transition-all ${sidebarOpen ? 'md:pl-64' : ''}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          {(!sidebarOpen || true) && (
            <button onClick={() => (window.innerWidth < 768 ? setMobileDrawerOpen(true) : setSidebarOpen(true))} className={`${sidebarOpen ? 'md:hidden' : ''} inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-[#EAE7DF] text-xs font-semibold shadow-sm mb-3`}>
              <PanelLeftOpen className="w-4 h-4 text-[#0E4D38]" /> <span>Menu</span>
            </button>
          )}

          {activePage === 'dashboard' && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold">{isEn ? 'Hello' : 'Halo'}, {partnerAName} & {partnerBName}!</h1>
                  <p className="text-sm text-[#5E6D7E]">{isEn ? 'Shared financial summary for' : 'Ringkasan keuangan bersama'} <strong>{formatMonthLabel(selectedMonth)}</strong></p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-2 bg-white border border-[#EAE7DF] rounded-xl px-3 py-2">
                    <Calendar className="w-4 h-4 text-[#0E4D38]" />
                    <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="text-xs font-semibold bg-transparent focus:outline-none">
                      {monthOptions.map(m => <option key={m} value={m}>{formatMonthLabel(m)}</option>)}
                    </select>
                  </div>
                  <button onClick={() => setShowWrapup(true)} className="px-3.5 py-2 rounded-xl border border-[#EAE7DF] bg-white text-xs font-semibold inline-flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-[#0E4D38]" /> {isEn ? 'Wrap-Up' : 'Ringkasan'}
                  </button>
                  <button onClick={() => openAddExpense()} className="px-4 py-2 rounded-xl bg-[#0E4D38] text-white text-xs font-semibold inline-flex items-center gap-1.5">
                    <Plus className="w-4 h-4" /> {isEn ? 'Add Expense' : 'Tambah Pengeluaran'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <div className="rounded-2xl p-5 bg-[#EEF7F3] border border-[#D8ECE3]">
                  <div className="text-2xl font-bold">{formatIDR(totalSpent)}</div>
                  <div className="text-xs text-[#5E6D7E] mt-1">{isEn ? 'Total Expenses' : 'Total Pengeluaran'} ({monthExps.length})</div>
                </div>
                <div className="rounded-2xl p-5 bg-[#F2F8F4] border border-[#DCECE0]">
                  <div className="text-2xl font-bold">{formatIDR(monthBudget - totalSpent)}</div>
                  <div className="text-xs text-[#5E6D7E] mt-1">{isEn ? 'Remaining Budget' : 'Sisa Anggaran'} ({pctBudget}%)</div>
                </div>
                <div className="rounded-2xl p-5 bg-[#F4F7FA] border border-[#DCE6F0]">
                  <div className="text-2xl font-bold">{formatIDR(kas.saldoTotal)}</div>
                  <div className="text-xs text-[#5E6D7E] mt-1">{isEn ? 'Shared Pot Balance' : 'Saldo Kas Bersama'}</div>
                </div>
                <div className="rounded-2xl p-5 bg-[#FDF2F2] border border-[#F8DFDF]">
                  <div className="text-2xl font-bold">{formatIDR(unpaidTotal)}</div>
                  <div className="text-xs text-[#5E6D7E] mt-1">{isEn ? 'Unpaid Bills' : 'Tagihan Belum Bayar'} ({unpaidBills.length})</div>
                </div>
              </div>

              <div className="bg-white border border-[#EAE7DF] rounded-2xl p-6 mb-6">
                <h2 className="text-base font-bold mb-3">{isEn ? 'Personal Advances & Settlement' : 'Talangan Pribadi & Penyelesaian'}</h2>
                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                  <div>
                    <div className="text-xs text-[#5E6D7E]">{partnerAName} ({isEn ? 'Paid' : 'Dibayar'})</div>
                    <div className="font-bold text-base">{formatIDR(settle.paidA)}</div>
                    <div className="text-xs text-[#5E6D7E]">{isEn ? 'Share:' : 'Porsi:'} {formatIDR(settle.shouldA)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[#5E6D7E]">{partnerBName} ({isEn ? 'Paid' : 'Dibayar'})</div>
                    <div className="font-bold text-base">{formatIDR(settle.paidB)}</div>
                    <div className="text-xs text-[#5E6D7E]">{isEn ? 'Share:' : 'Porsi:'} {formatIDR(settle.shouldB)}</div>
                  </div>
                </div>
                {settle.amount > 0 && settle.owesFrom && settle.owesTo ? (
                  <div className="p-3.5 rounded-xl bg-[#FDF6EB] border border-[#F5E4C8] flex items-center justify-between text-xs">
                    <span><strong>{partnerName(settle.owesFrom)}</strong> {isEn ? 'owes' : 'perlu membayar'} <strong>{formatIDR(settle.amount)}</strong> {isEn ? 'to' : 'ke'} <strong>{partnerName(settle.owesTo)}</strong></span>
                    <button onClick={() => setSettlements(prev => [...prev, { id: 's-' + Date.now(), from: settle.owesFrom!, to: settle.owesTo!, amount: settle.amount, date: selectedMonth + '-28' }])} className="px-3.5 py-2 rounded-xl bg-[#0E4D38] text-white font-semibold">{isEn ? 'Mark Settled' : 'Tandai Lunas'}</button>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-[#EEF7F3] text-xs font-medium text-[#0E4D38]">{isEn ? 'Settled ✓ — No advance balance owed.' : 'Seimbang ✓ — Tidak ada saldo talangan bulan ini.'}</div>
                )}
              </div>
            </div>
          )}

          {activePage === 'couple' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">{isEn ? 'Couple Space & Shared Pot' : 'Ruang Pasangan & Kas Bersama'}</h1>
                <button onClick={() => setShowDepModal(true)} className="px-4 py-2 rounded-xl bg-[#16A37B] text-white text-xs font-semibold">+ {isEn ? 'Deposit Shared Pot' : 'Setor Kas Bersama'}</button>
              </div>
              <div className="bg-white border border-[#EAE7DF] rounded-2xl p-6">
                <div className="text-xs font-bold text-[#16A37B] uppercase">{isEn ? 'Shared Pot Balance' : 'Saldo Kas Bersama'}</div>
                <div className="text-3xl font-bold mt-1 mb-4">{formatIDR(kas.saldoTotal)}</div>
                <div className="divide-y divide-[#EAE7DF]">
                  {poolDeposits.length === 0 ? <div className="py-4 text-xs text-[#5E6D7E]">{isEn ? 'No deposits yet.' : 'Belum ada setoran.'}</div> : poolDeposits.map(d => (
                    <div key={d.id} className="py-2.5 flex justify-between items-center text-xs">
                      <span><strong>{partnerName(d.partner)}</strong> • {d.date} • {d.note}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#16A37B]">+ {formatIDR(d.amount)}</span>
                        <button onClick={() => setPoolDeposits(prev => prev.filter(x => x.id !== d.id))} className="p-2 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white border border-[#EAE7DF] rounded-2xl p-6 space-y-3">
                <h2 className="font-bold">{isEn ? 'Invite Link' : 'Tautan Undangan'}</h2>
                <div className="flex gap-2">
                  <input readOnly value={inviteCode} className="flex-1 px-3 py-2 rounded-xl border border-[#EAE7DF] text-xs bg-[#F7F6F2]" />
                  <button onClick={() => { navigator.clipboard?.writeText(inviteCode); notify(isEn ? 'Copied!' : 'Disalin!'); }} className="px-4 py-2 rounded-xl bg-[#0E4D38] text-white text-xs font-semibold">{isEn ? 'Copy' : 'Salin'}</button>
                </div>
              </div>
            </div>
          )}

          {activePage === 'expenses' && (
            <div className="space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-3">
                <h1 className="text-2xl font-bold">{isEn ? 'Shared Expenses' : 'Pengeluaran Bersama'}</h1>
                <div className="flex gap-2">
                  <button onClick={exportCSV} className="px-3 py-2 rounded-xl bg-white border border-[#EAE7DF] text-xs font-semibold inline-flex items-center gap-1"><Download className="w-3.5 h-3.5" /> CSV</button>
                  <button onClick={exportPDF} className="px-3 py-2 rounded-xl bg-white border border-[#EAE7DF] text-xs font-semibold inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> PDF</button>
                  <button onClick={() => openAddExpense()} className="px-4 py-2 rounded-xl bg-[#0E4D38] text-white text-xs font-semibold">+ {isEn ? 'Add Expense' : 'Tambah'}</button>
                </div>
              </div>
              <div className="bg-white border border-[#EAE7DF] rounded-2xl divide-y divide-[#F0EDE5]">
                {monthExps.length === 0 ? <div className="p-8 text-center text-xs text-[#5E6D7E]">{isEn ? 'No expenses this month.' : 'Belum ada transaksi bulan ini.'}</div> : monthExps.map(e => (
                  <div key={e.id} className="p-4 flex justify-between items-center gap-3">
                    <div>
                      <div className="font-bold text-sm">{e.title} <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-[#F7F6F2]">{displayCat(e.category)}</span></div>
                      <div className="text-xs text-[#5E6D7E]">{e.date} • {e.paymentSource === 'kas_bersama' ? (isEn ? 'Shared Pot' : 'Kas Bersama') : `${isEn ? 'Paid by' : 'Ditalangi'} ${partnerName(e.paidBy)}`}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{formatIDR(e.amount)}</span>
                      <button onClick={() => openAddExpense(e)} className="p-2 text-[#5E6D7E]"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setExpenses(prev => prev.filter(x => x.id !== e.id))} className="p-2 text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activePage === 'budgets' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold">{isEn ? 'Shared Budgets' : 'Anggaran Bersama'}</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-[#EAE7DF] rounded-2xl p-6">
                  <div className="text-xs text-[#5E6D7E]">{isEn ? 'Monthly Limit' : 'Batas Bulanan'}</div>
                  <div className="text-3xl font-bold my-2">{formatIDR(monthBudget)}</div>
                  <form onSubmit={e => { e.preventDefault(); setMonthlyBudgets(prev => ({ ...prev, [selectedMonth]: parseNominal(budgetInputStr) })); notify(isEn ? 'Saved!' : 'Tersimpan!'); }} className="flex gap-2 mt-4">
                    <input type="text" inputMode="numeric" placeholder="12.000.000" value={budgetInputStr} onChange={e => setBudgetInputStr(formatNominalStr(parseNominal(e.target.value)))} className="flex-1 px-3 py-2 rounded-xl border border-[#EAE7DF] text-sm" />
                    <button type="submit" className="px-4 py-2 rounded-xl bg-[#0E4D38] text-white text-xs font-semibold">{isEn ? 'Save' : 'Simpan'}</button>
                  </form>
                </div>
                <div className="bg-white border border-[#EAE7DF] rounded-2xl p-6">
                  <h2 className="font-bold mb-3">{isEn ? 'Add Custom Budget' : 'Tambah Pos Anggaran'}</h2>
                  <form onSubmit={e => { e.preventDefault(); if (!cbName || !parseNominal(cbLimitStr)) return; setCustomBudgets(prev => [...prev, { id: 'cb-' + Date.now(), name: cbName, category: cbCat, limit: parseNominal(cbLimitStr) }]); setCbName(''); setCbLimitStr(''); }} className="space-y-2">
                    <input required placeholder={isEn ? 'Budget name' : 'Nama anggaran'} value={cbName} onChange={e => setCbName(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-[#EAE7DF] text-sm" />
                    <div className="flex gap-2">
                      <select value={cbCat} onChange={e => setCbCat(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border border-[#EAE7DF] text-sm bg-white">{categories.map(c => <option key={c} value={c}>{displayCat(c)}</option>)}</select>
                      <input type="text" inputMode="numeric" required placeholder="Rp" value={cbLimitStr} onChange={e => setCbLimitStr(formatNominalStr(parseNominal(e.target.value)))} className="w-32 px-3 py-2 rounded-xl border border-[#EAE7DF] text-sm" />
                      <button type="submit" className="px-4 py-2 rounded-xl bg-[#16A37B] text-white text-xs font-semibold">+</button>
                    </div>
                  </form>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customBudgets.map(b => {
                  const spent = monthExps.filter(e => e.category === b.category).reduce((s, e) => s + e.amount, 0);
                  return (
                    <div key={b.id} className="bg-white border border-[#EAE7DF] rounded-2xl p-5 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-sm">{b.name} <span className="text-xs font-normal text-[#5E6D7E]">({displayCat(b.category)})</span></div>
                        <div className="text-xs text-[#5E6D7E] mt-1">{formatIDR(spent)} / {formatIDR(b.limit)}</div>
                      </div>
                      <button onClick={() => setCustomBudgets(prev => prev.filter(x => x.id !== b.id))} className="p-2 text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activePage === 'bills' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold">{isEn ? 'Recurring Bills' : 'Tagihan Rutin'}</h1>
              <form onSubmit={e => { e.preventDefault(); const amt = parseNominal(billAmtStr); if (!billTitle || !amt) return; setBills(prev => [...prev, { id: 'b-' + Date.now(), title: billTitle, category: billCat, amount: amt, dueDate: billDue, frequency: billFreq, paidMonths: {} }]); setBillTitle(''); setBillAmtStr(''); }} className="bg-white border border-[#EAE7DF] rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input required placeholder={isEn ? 'Bill Name' : 'Nama Tagihan'} value={billTitle} onChange={e => setBillTitle(e.target.value)} className="px-3 py-2 rounded-xl border border-[#EAE7DF] text-sm" />
                <select value={billCat} onChange={e => setBillCat(e.target.value)} className="px-3 py-2 rounded-xl border border-[#EAE7DF] text-sm bg-white">{billCategories.map(c => <option key={c} value={c}>{displayCat(c)}</option>)}</select>
                <input type="text" inputMode="numeric" required placeholder="Rp" value={billAmtStr} onChange={e => setBillAmtStr(formatNominalStr(parseNominal(e.target.value)))} className="px-3 py-2 rounded-xl border border-[#EAE7DF] text-sm" />
                <button type="submit" className="px-4 py-2 rounded-xl bg-[#0E4D38] text-white text-xs font-semibold">{isEn ? 'Save Bill' : 'Simpan Tagihan'}</button>
              </form>
              <div className="bg-white border border-[#EAE7DF] rounded-2xl divide-y divide-[#F0EDE5]">
                {bills.map(b => {
                  const paid = Boolean(b.paidMonths?.[selectedMonth]);
                  return (
                    <div key={b.id} className="p-4 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-sm">{b.title}</div>
                        <div className="text-xs text-[#5E6D7E]">{formatIDR(b.amount)} • {displayCat(b.category)}</div>
                      </div>
                      <button onClick={() => setPayBillId(b.id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${paid ? 'bg-[#EEF7F3] text-[#16A37B]' : 'bg-[#FDF6EB] text-[#D97706]'}`}>
                        {paid ? (isEn ? 'Paid ✓' : 'Lunas ✓') : (isEn ? 'Mark Paid' : 'Tandai Lunas')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activePage === 'goals' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold">{isEn ? 'Shared Savings Goals' : 'Target Tabungan Bersama'}</h1>
              <form onSubmit={e => { e.preventDefault(); const amt = parseNominal(goalTargetStr); if (!goalTitle || !amt) return; setGoals(prev => [...prev, { id: 'g-' + Date.now(), title: goalTitle, category: goalCat, targetAmount: amt, targetDate: goalDate, contributions: [] }]); setGoalTitle(''); setGoalTargetStr(''); }} className="bg-white border border-[#EAE7DF] rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input required placeholder={isEn ? 'Goal Name' : 'Nama Target'} value={goalTitle} onChange={e => setGoalTitle(e.target.value)} className="px-3 py-2 rounded-xl border border-[#EAE7DF] text-sm" />
                <select value={goalCat} onChange={e => setGoalCat(e.target.value)} className="px-3 py-2 rounded-xl border border-[#EAE7DF] text-sm bg-white">{goalCategories.map(c => <option key={c} value={c}>{displayCat(c)}</option>)}</select>
                <input type="text" inputMode="numeric" required placeholder="Rp" value={goalTargetStr} onChange={e => setGoalTargetStr(formatNominalStr(parseNominal(e.target.value)))} className="px-3 py-2 rounded-xl border border-[#EAE7DF] text-sm" />
                <button type="submit" className="px-4 py-2 rounded-xl bg-[#0E4D38] text-white text-xs font-semibold">{isEn ? 'Save Goal' : 'Simpan Target'}</button>
              </form>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {goals.map(g => {
                  const col = g.contributions.reduce((s, c) => s + c.amount, 0);
                  const pct = g.targetAmount > 0 ? Math.min(100, Math.round((col / g.targetAmount) * 100)) : 0;
                  return (
                    <div key={g.id} className="bg-white border border-[#EAE7DF] rounded-2xl p-5">
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-[#16A37B]">{displayCat(g.category)}</span>
                        <button onClick={() => setGoals(prev => prev.filter(x => x.id !== g.id))} className="p-1 text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <div className="font-bold text-base mt-1">{g.title}</div>
                      <div className="text-xs text-[#5E6D7E] mt-1">{formatIDR(col)} / {formatIDR(g.targetAmount)} ({pct}%)</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activePage === 'settings' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold">{isEn ? 'Settings & Privacy' : 'Pengaturan & Privasi'}</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-[#EAE7DF] rounded-2xl p-6 space-y-4">
                  <div className="font-bold text-sm">{isEn ? 'Language Preference' : 'Preferensi Bahasa'}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setLang('id')} className={`py-2.5 rounded-xl border text-xs font-semibold ${!isEn ? 'bg-[#0F1E28] text-white' : 'bg-white'}`}>🇮🇩 Indonesia</button>
                    <button onClick={() => setLang('en')} className={`py-2.5 rounded-xl border text-xs font-semibold ${isEn ? 'bg-[#0F1E28] text-white' : 'bg-white'}`}>🇬🇧 English</button>
                  </div>
                </div>
                <div className="bg-white border border-[#EAE7DF] rounded-2xl p-6 space-y-3">
                  <div className="font-bold text-sm">{isEn ? 'Profile Picture' : 'Foto Profil'}</div>
                  <input type="file" accept="image/*" onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f || !currentUser) return;
                    const r = new FileReader();
                    r.onload = ev => {
                      const updated = { ...currentUser, avatar: String(ev.target?.result || '') };
                      setCurrentUser(updated);
                    };
                    r.readAsDataURL(f);
                  }} className="text-xs" />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add/Edit Expense Modal */}
      {showExpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F1E28]/50">
          <div className="bg-white rounded-2xl border border-[#EAE7DF] w-full max-w-lg p-6">
            <h3 className="text-lg font-bold mb-4">{editingExpId ? (isEn ? 'Edit Expense' : 'Edit Pengeluaran') : (isEn ? 'Add Expense' : 'Tambah Pengeluaran')}</h3>
            <form onSubmit={saveExpense} className="space-y-3">
              <input required placeholder={isEn ? 'Description' : 'Nama Transaksi'} value={expTitle} onChange={e => setExpTitle(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-[#EAE7DF] text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <select value={expCat} onChange={e => setExpCat(e.target.value)} className="px-3 py-2.5 rounded-xl border border-[#EAE7DF] text-sm bg-white">{categories.map(c => <option key={c} value={c}>{displayCat(c)}</option>)}</select>
                <input type="date" value={expDate} onChange={e => setExpDate(e.target.value)} className="px-3 py-2.5 rounded-xl border border-[#EAE7DF] text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" inputMode="numeric" required placeholder="750.000" value={expAmountStr} onChange={e => setExpAmountStr(formatNominalStr(parseNominal(e.target.value)))} className="px-3.5 py-2.5 rounded-xl border border-[#EAE7DF] text-sm" />
                <select value={expSource} onChange={e => setExpSource(e.target.value as PaymentSource)} className="px-3 py-2.5 rounded-xl border border-[#EAE7DF] text-sm bg-white">
                  <option value="talangan">{isEn ? 'Personal Advance' : 'Talangan Pribadi'}</option>
                  <option value="kas_bersama">{isEn ? 'Shared Pot' : 'Kas Bersama'}</option>
                </select>
              </div>
              {expSource === 'talangan' && (
                <div className="space-y-2">
                  <select value={expPaidBy} onChange={e => setExpPaidBy(e.target.value as PartnerId)} className="w-full px-3 py-2 rounded-xl border border-[#EAE7DF] text-sm bg-white">
                    <option value="partner_a">{partnerAName}</option>
                    <option value="partner_b">{partnerBName}</option>
                  </select>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => setExpSplit('50_50')} className={`py-2 rounded-xl border text-xs ${expSplit === '50_50' ? 'bg-[#0E4D38] text-white' : ''}`}>50 : 50</button>
                    <button type="button" onClick={() => setExpSplit('custom_pct')} className={`py-2 rounded-xl border text-xs ${expSplit === 'custom_pct' ? 'bg-[#0E4D38] text-white' : ''}`}>%</button>
                    <button type="button" onClick={() => setExpSplit('custom_amount')} className={`py-2 rounded-xl border text-xs ${expSplit === 'custom_amount' ? 'bg-[#0E4D38] text-white' : ''}`}>Rp</button>
                  </div>
                  {expSplit === 'custom_pct' && (
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" min={0} max={100} value={pctA} onChange={e => setPctA(Math.min(100, Math.max(0, Number(e.target.value))))} className="px-3 py-2 rounded-xl border text-sm" />
                      <input type="number" readOnly value={100 - pctA} className="px-3 py-2 rounded-xl border text-sm bg-[#F7F6F2]" />
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowExpModal(false)} className="px-4 py-2 rounded-xl border border-[#EAE7DF] text-sm">{isEn ? 'Cancel' : 'Batal'}</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-[#0E4D38] text-white text-sm font-semibold">{isEn ? 'Save' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDepModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F1E28]/50">
          <div className="bg-white rounded-2xl border border-[#EAE7DF] w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">{isEn ? 'Deposit to Shared Pot' : 'Setor ke Kas Bersama'}</h3>
            <form onSubmit={e => { e.preventDefault(); const amt = parseNominal(depAmountStr); if (!amt) return; setPoolDeposits(prev => [{ id: 'd-' + Date.now(), partner: depPartner, amount: amt, date: depDate, note: depNote || 'Setoran' }, ...prev]); setShowDepModal(false); notify(isEn ? 'Deposit added!' : 'Setoran masuk!'); }} className="space-y-3">
              <select value={depPartner} onChange={e => setDepPartner(e.target.value as PartnerId)} className="w-full px-3 py-2.5 rounded-xl border border-[#EAE7DF] text-sm bg-white">
                <option value="partner_a">{partnerAName}</option>
                <option value="partner_b">{partnerBName}</option>
              </select>
              <input type="text" inputMode="numeric" required placeholder="2.500.000" value={depAmountStr} onChange={e => setDepAmountStr(formatNominalStr(parseNominal(e.target.value)))} className="w-full px-3.5 py-2.5 rounded-xl border border-[#EAE7DF] text-sm" />
              <input type="date" value={depDate} onChange={e => setDepDate(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-[#EAE7DF] text-sm" />
              <input placeholder={isEn ? 'Note' : 'Catatan'} value={depNote} onChange={e => setDepNote(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-[#EAE7DF] text-sm" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowDepModal(false)} className="px-4 py-2 rounded-xl border text-sm">{isEn ? 'Cancel' : 'Batal'}</button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-[#16A37B] text-white text-sm font-semibold">{isEn ? 'Save' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bill Pay Modal */}
      {payBillId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F1E28]/50">
          <div className="bg-white rounded-2xl border border-[#EAE7DF] w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-3">{isEn ? 'Pay Bill' : 'Lunasi Tagihan'}</h3>
            <select value={payBillChoice} onChange={e => setPayBillChoice(e.target.value as any)} className="w-full px-3 py-2.5 rounded-xl border border-[#EAE7DF] text-sm bg-white mb-4">
              <option value="kas_bersama">{isEn ? 'Shared Pot' : 'Kas Bersama'}</option>
              <option value="talangan_a">{isEn ? 'Advance — ' : 'Talangan — '}{partnerAName}</option>
              <option value="talangan_b">{isEn ? 'Advance — ' : 'Talangan — '}{partnerBName}</option>
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPayBillId(null)} className="px-4 py-2 rounded-xl border text-sm">{isEn ? 'Cancel' : 'Batal'}</button>
              <button onClick={() => {
                const b = bills.find(x => x.id === payBillId);
                if (!b) return;
                const isKas = payBillChoice === 'kas_bersama';
                const paidBy = isKas ? 'kas_bersama' : (payBillChoice === 'talangan_a' ? 'partner_a' : 'partner_b');
                setBills(prev => prev.map(x => x.id === b.id ? { ...x, paidMonths: { ...x.paidMonths, [selectedMonth]: { source: isKas ? 'kas_bersama' : 'talangan', paidBy } } } : x));
                const shareA = Math.round(b.amount / 2);
                setExpenses(prev => [{ id: `exp-bill-${b.id}-${selectedMonth}`, title: `Tagihan: ${b.title}`, category: 'Utilitas', amount: b.amount, date: `${selectedMonth}-20`, paymentSource: isKas ? 'kas_bersama' : 'talangan', paidBy, splitMethod: '50_50', partnerAShare: shareA, partnerBShare: b.amount - shareA }, ...prev]);
                setPayBillId(null);
              }} className="px-4 py-2 rounded-xl bg-[#16A37B] text-white text-sm font-semibold">{isEn ? 'Mark Paid' : 'Catat Lunas'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Wrap-Up Modal */}
      {showWrapup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F1E28]/50">
          <div className="bg-white rounded-2xl border border-[#EAE7DF] w-full max-w-md p-6 space-y-3">
            <h3 className="text-lg font-bold">{isEn ? 'Monthly Wrap-Up' : 'Ringkasan Tutup Buku'}</h3>
            <div className="text-xs space-y-1.5 bg-[#F7F6F2] p-4 rounded-xl">
              <div className="flex justify-between"><span>{isEn ? 'Total Expenses:' : 'Total Pengeluaran:'}</span><strong>{formatIDR(totalSpent)}</strong></div>
              <div className="flex justify-between"><span>{isEn ? 'Shared Pot:' : 'Kas Bersama:'}</span><strong>{formatIDR(kas.saldoTotal)}</strong></div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={exportCSV} className="px-3 py-2 rounded-xl border text-xs font-semibold">CSV</button>
              <button onClick={exportPDF} className="px-3 py-2 rounded-xl border text-xs font-semibold">PDF</button>
              <button onClick={() => setShowWrapup(false)} className="px-4 py-2 rounded-xl bg-[#0E4D38] text-white text-xs font-semibold">{isEn ? 'Close' : 'Tutup'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0F1E28] text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#16A37B]" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
