'use client';

import React, { useState, useMemo } from 'react';
import {
  formatIDR,
  calculateSettlement,
  type SharedExpense,
  type SettlementRecord,
  type RecurringBill,
  type SavingsGoal,
  type PartnerId,
} from '../lib/nesta-core';
import { isSupabaseConfigured } from '../lib/supabase';

export default function NestaApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'expenses' | 'bills' | 'goals'>('dashboard');
  const [expenses] = useState<SharedExpense[]>([
    { id: '1', title: 'Sewa Apartemen', category: 'Sewa', amount: 3500000, date: '2026-11-01', paidBy: 'partner_a', splitMethod: '50_50', partnerAShare: 1750000, partnerBShare: 1750000 },
    { id: '2', title: 'Belanja Harian', category: 'Belanja Harian', amount: 1500000, date: '2026-11-05', paidBy: 'partner_b', splitMethod: '50_50', partnerAShare: 750000, partnerBShare: 750000 },
    { id: '3', title: 'Utilitas Listrik & Air', category: 'Utilitas', amount: 750000, date: '2026-11-10', paidBy: 'partner_a', splitMethod: '50_50', partnerAShare: 375000, partnerBShare: 375000 },
    { id: '4', title: 'Makan Malam', category: 'Makan & Minum', amount: 1000000, date: '2026-11-14', paidBy: 'partner_b', splitMethod: '50_50', partnerAShare: 500000, partnerBShare: 500000 },
    { id: '5', title: 'Transportasi', category: 'Transportasi', amount: 800000, date: '2026-11-18', paidBy: 'partner_a', splitMethod: '50_50', partnerAShare: 400000, partnerBShare: 400000 },
  ]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [bills] = useState<RecurringBill[]>([]);
  const [goals] = useState<SavingsGoal[]>([]);

  const settle = useMemo(() => calculateSettlement(expenses, settlements), [expenses, settlements]);
  const totalSpent = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);

  const handleSettle = (from: PartnerId, to: PartnerId, amount: number) => {
    setSettlements(prev => [...prev, { id: String(Date.now()), from, to, amount, date: new Date().toISOString().slice(0, 10) }]);
  };

  return (
    <main className="min-h-screen bg-[#F5F2EA] text-[#101D2B] p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl font-semibold">NESTA</h1>
          <p className="text-xs text-[#5E6D7E]">Separate Money. Shared Life. • {isSupabaseConfigured ? 'Supabase Connected' : 'Demo Mode'}</p>
        </div>
        <nav className="flex gap-2">
          {(['dashboard', 'expenses', 'bills', 'goals'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize ${activeTab === tab ? 'bg-[#101D2B] text-white' : 'bg-white border border-[#E6E1D6]'}`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#E6E1D6]">
          <div className="text-xs text-[#5E6D7E]">Total Pengeluaran</div>
          <div className="text-2xl font-semibold mt-1">{formatIDR(totalSpent)}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-[#E6E1D6]">
          <div className="text-xs text-[#5E6D7E]">Sisa Anggaran (dari Rp12jt)</div>
          <div className="text-2xl font-semibold mt-1">{formatIDR(12000000 - totalSpent)}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-[#E6E1D6]">
          <div className="text-xs text-[#5E6D7E]">Saldo Penyelesaian</div>
          <div className="text-xl font-semibold text-[#16A37B] mt-1">
            {settle.outstandingAmount > 0 ? formatIDR(settle.outstandingAmount) : 'Seimbang'}
          </div>
          {settle.owesFrom && settle.owesTo && (
            <button
              onClick={() => handleSettle(settle.owesFrom!, settle.owesTo!, settle.outstandingAmount)}
              className="mt-2 px-3 py-1.5 rounded-lg bg-[#101D2B] text-white text-xs"
            >
              Tandai Lunas
            </button>
          )}
        </div>
      </section>
      <div className="mt-6 text-xs text-[#5E6D7E]">
        Active view: {activeTab} • Bills: {bills.length} • Goals: {goals.length}
      </div>
    </main>
  );
}
