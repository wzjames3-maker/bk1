-- 启用 UUID 扩展
create extension if not exists "uuid-ossp";

-- 用户业务扩展
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  avatar_url text,
  balance decimal(10,4) not null default 1.0000,  -- 注册赠送 $1
  created_at timestamptz not null default now()
);

-- 自动创建 profile
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data->>'name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 播客项目
create table projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  voice_config jsonb default '{}',
  bgm_config jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 单期节目
create table episodes (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete set null,
  user_id uuid not null references profiles(id) on delete cascade,
  title text,
  status text not null default 'pending'
    check (status in ('pending','parsing','scripting','script_ready',
                      'confirming','tts_processing','mixing',
                      'post_processing','completed','failed')),
  failed_at_step text,
  topic text not null,
  params jsonb not null default '{"duration_min":10,"style":"casual","roles_count":2}',
  materials jsonb default '[]',
  script jsonb,
  audio_url text,
  show_notes text,
  chapters jsonb,
  cover_url text,
  preview_url text,
  tts_segments jsonb,
  estimated_cost decimal(10,4),
  actual_cost decimal(10,4),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- 任务步骤日志
create table episode_steps (
  id uuid primary key default uuid_generate_v4(),
  episode_id uuid not null references episodes(id) on delete cascade,
  step text not null,
  status text not null default 'pending'
    check (status in ('pending','running','done','failed')),
  attempt int not null default 1,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz
);

-- 用量记录
create table usage_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  episode_id uuid references episodes(id) on delete set null,
  type text not null check (type in ('llm_token','tts_char','storage_mb','mixing')),
  quantity decimal not null,
  cost decimal(10,6) not null,
  created_at timestamptz not null default now()
);

-- 交易记录
create table transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('charge','refund','topup')),
  amount decimal(10,4) not null,
  stripe_payment_id text,
  description text,
  created_at timestamptz not null default now()
);

-- 预设音色
create table voices (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  gender text not null check (gender in ('male','female')),
  style text not null,
  provider text not null check (provider in ('aliyun','mimo')),
  provider_voice_id text not null,
  sample_url text,
  is_active boolean not null default true
);

-- RLS 策略
alter table profiles enable row level security;
alter table projects enable row level security;
alter table episodes enable row level security;
alter table episode_steps enable row level security;
alter table usage_logs enable row level security;
alter table transactions enable row level security;
alter table voices enable row level security;

-- profiles: 用户只能读写自己的
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

-- projects: 用户 CRUD 自己的
create policy "Users can CRUD own projects" on projects
  for all using (auth.uid() = user_id);

-- episodes: 用户 CRUD 自己的
create policy "Users can CRUD own episodes" on episodes
  for all using (auth.uid() = user_id);

-- episode_steps: 通过 episode 关联
create policy "Users can view own episode steps" on episode_steps
  for select using (
    exists (select 1 from episodes where episodes.id = episode_id and episodes.user_id = auth.uid())
  );

-- usage_logs: 用户查看自己的
create policy "Users can view own usage" on usage_logs
  for select using (auth.uid() = user_id);

-- transactions: 用户查看自己的
create policy "Users can view own transactions" on transactions
  for select using (auth.uid() = user_id);

-- voices: 所有人可读
create policy "Voices are publicly readable" on voices
  for select using (true);

-- updated_at 自动更新
create function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on projects
  for each row execute procedure update_updated_at();

-- 余额原子操作函数
create or replace function adjust_balance(uid uuid, delta numeric)
returns numeric
language sql
security definer
as $$
  update profiles set balance = balance + delta where id = uid returning balance;
$$;

create or replace function deduct_if_sufficient(uid uuid, amount numeric)
returns numeric
language sql
security definer
as $$
  update profiles set balance = balance - amount where id = uid and balance >= amount returning balance;
$$;

-- 改稿/确认的原子状态变更；完整定义见 rewrite-lock-setup.sql，供已有项目补充执行。
-- 新项目初始化时同样需要执行该文件。

-- Webhook 幂等性唯一索引
create unique index idx_transactions_stripe_payment_id
  on transactions (stripe_payment_id) where stripe_payment_id is not null;
