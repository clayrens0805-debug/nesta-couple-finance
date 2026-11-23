-- NESTA: Couple Finance Platform — Supabase PostgreSQL Schema & RLS Policies
-- Philosophy: Separate Money. Shared Life.
-- Personal data is strictly isolated via auth.uid() = user_id.
-- Shared data is strictly scoped to verified couple_members.

create extension if not exists "uuid-ossp";

-- 1. PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_initials text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
create policy "Users can view own profile or partner profile in same couple"
  on public.profiles for select
  using (
    id = auth.uid()
    or id in (
      select cm2.user_id from public.couple_members cm1
      join public.couple_members cm2 on cm1.couple_id = cm2.couple_id
      where cm1.user_id = auth.uid()
    )
  );
create policy "Users can update own profile"
  on public.profiles for update using (id = auth.uid());

-- 2. PRIVATE PERSONAL VAULT (NEVER EXPOSED TO PARTNER)
create table if not exists public.personal_vaults (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  personal_balance numeric not null default 0,
  monthly_personal_target numeric not null default 0,
  private_notes text,
  updated_at timestamptz default now()
);

alter table public.personal_vaults enable row level security;
create policy "Strict personal isolation: only owner can read/write"
  on public.personal_vaults for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3. COUPLES WORKSPACE
create table if not exists public.couples (
  id uuid primary key default uuid_generate_v4(),
  name text not null default 'Rumah Tangga Bersama',
  invite_code text unique not null,
  monthly_budget numeric not null default 12000000,
  currency text not null default 'IDR',
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists public.couple_members (
  id uuid primary key default uuid_generate_v4(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('partner_a', 'partner_b')),
  display_name text not null,
  joined_at timestamptz default now(),
  unique(couple_id, user_id)
);

alter table public.couples enable row level security;
alter table public.couple_members enable row level security;

create policy "Members can view their couple workspace"
  on public.couples for select
  using (id in (select couple_id from public.couple_members where user_id = auth.uid()));

create policy "Members can update their couple workspace"
  on public.couples for update
  using (id in (select couple_id from public.couple_members where user_id = auth.uid()));

create policy "Members can view couple members"
  on public.couple_members for select
  using (couple_id in (select couple_id from public.couple_members where user_id = auth.uid()));

-- 4. SHARED EXPENSES
create table if not exists public.shared_expenses (
  id uuid primary key default uuid_generate_v4(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  title text not null,
  category text not null check (category in ('Sewa', 'Belanja Harian', 'Utilitas', 'Transportasi', 'Makan & Minum', 'Hiburan', 'Rumah Tangga', 'Lainnya')),
  amount numeric not null check (amount > 0),
  expense_date date not null default current_date,
  paid_by uuid not null references auth.users(id),
  split_method text not null check (split_method in ('50_50', 'custom_pct', 'custom_amount')),
  partner_a_share numeric not null,
  partner_b_share numeric not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table public.shared_expenses enable row level security;
create policy "Couple members manage shared expenses"
  on public.shared_expenses for all
  using (couple_id in (select couple_id from public.couple_members where user_id = auth.uid()))
  with check (couple_id in (select couple_id from public.couple_members where user_id = auth.uid()));

-- 5. SETTLEMENTS
create table if not exists public.settlements (
  id uuid primary key default uuid_generate_v4(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  from_user uuid not null references auth.users(id),
  to_user uuid not null references auth.users(id),
  amount numeric not null check (amount > 0),
  note text,
  settled_at timestamptz default now()
);

alter table public.settlements enable row level security;
create policy "Couple members manage settlements"
  on public.settlements for all
  using (couple_id in (select couple_id from public.couple_members where user_id = auth.uid()))
  with check (couple_id in (select couple_id from public.couple_members where user_id = auth.uid()));

-- 6. CATEGORY BUDGETS
create table if not exists public.category_budgets (
  id uuid primary key default uuid_generate_v4(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  category text not null,
  monthly_limit numeric not null check (monthly_limit >= 0),
  unique(couple_id, category)
);

alter table public.category_budgets enable row level security;
create policy "Couple members manage category budgets"
  on public.category_budgets for all
  using (couple_id in (select couple_id from public.couple_members where user_id = auth.uid()))
  with check (couple_id in (select couple_id from public.couple_members where user_id = auth.uid()));

-- 7. RECURRING BILLS
create table if not exists public.recurring_bills (
  id uuid primary key default uuid_generate_v4(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  title text not null,
  category text not null check (category in ('Sewa', 'Listrik', 'Internet', 'Air', 'Langganan', 'Lainnya')),
  amount numeric not null check (amount > 0),
  due_date date not null,
  frequency text not null check (frequency in ('Bulanan', 'Tahunan', 'Mingguan')),
  is_paid boolean not null default false,
  paid_by uuid references auth.users(id),
  last_paid_at timestamptz
);

alter table public.recurring_bills enable row level security;
create policy "Couple members manage recurring bills"
  on public.recurring_bills for all
  using (couple_id in (select couple_id from public.couple_members where user_id = auth.uid()))
  with check (couple_id in (select couple_id from public.couple_members where user_id = auth.uid()));

-- 8. SAVINGS GOALS & CONTRIBUTIONS
create table if not exists public.savings_goals (
  id uuid primary key default uuid_generate_v4(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  title text not null,
  target_amount numeric not null check (target_amount > 0),
  target_date date not null,
  created_at timestamptz default now()
);

create table if not exists public.savings_contributions (
  id uuid primary key default uuid_generate_v4(),
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  amount numeric not null check (amount > 0),
  contributed_at timestamptz default now()
);

alter table public.savings_goals enable row level security;
alter table public.savings_contributions enable row level security;

create policy "Couple members manage savings goals"
  on public.savings_goals for all
  using (couple_id in (select couple_id from public.couple_members where user_id = auth.uid()))
  with check (couple_id in (select couple_id from public.couple_members where user_id = auth.uid()));

create policy "Couple members manage savings contributions"
  on public.savings_contributions for all
  using (couple_id in (select couple_id from public.couple_members where user_id = auth.uid()))
  with check (couple_id in (select couple_id from public.couple_members where user_id = auth.uid()));
