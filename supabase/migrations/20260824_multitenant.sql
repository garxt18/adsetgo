-- Drop existing tables and policies (fresh start)
-- Drop tables first (this cascades and removes policies automatically)
drop table if exists public.audit_logs cascade;
drop table if exists public.clients cascade;
drop table if exists public.profiles cascade;
drop table if exists public.agencies cascade;

drop function if exists public.handle_updated_at();

create extension if not exists "uuid-ossp";

create table public.agencies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  google_ads_manager_customer_id text,
  google_ads_connection_status text not null default 'disconnected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'client' check (role in ('master_admin', 'agency_admin', 'client')),
  agency_id uuid references public.agencies(id) on delete set null,
  client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default uuid_generate_v4(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  email text not null,
  google_ads_customer_id text not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, google_ads_customer_id)
);

create table public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  agency_id uuid references public.agencies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null default 'campaign',
  resource_id text,
  previous_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index idx_agencies_slug on public.agencies (slug);
create index idx_agencies_manager_customer_id on public.agencies (google_ads_manager_customer_id);
create index idx_profiles_agency_id on public.profiles (agency_id);
create index idx_profiles_client_id on public.profiles (client_id);
create index idx_profiles_role on public.profiles (role);
create index idx_clients_agency_id on public.clients (agency_id);
create index idx_clients_auth_user_id on public.clients (auth_user_id);
create index idx_audit_logs_agency_id on public.audit_logs (agency_id);
create index idx_audit_logs_client_id on public.audit_logs (client_id);

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger agencies_updated_at before update on public.agencies
for each row execute procedure public.handle_updated_at();

create trigger profiles_updated_at before update on public.profiles
for each row execute procedure public.handle_updated_at();

create trigger clients_updated_at before update on public.clients
for each row execute procedure public.handle_updated_at();

alter table public.agencies enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.audit_logs enable row level security;

-- Agencies: Allow authenticated users to insert, application layer handles authorization
-- Agencies: only master_admin can create agencies; agency admins can select their own agency
create policy "Master admins can create agencies" on public.agencies
for insert with check (
  exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master_admin'
  )
);

create policy "Agency and master admins can select agency" on public.agencies
for select using (
  exists (
    select 1 from public.profiles p where p.id = auth.uid() and (
      p.role = 'master_admin' OR (p.role = 'agency_admin' AND p.agency_id = public.agencies.id)
    )
  )
);

create policy "Master admins can update agencies" on public.agencies
for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master_admin')
);

-- Profiles: Allow users to manage their own, admins can view all
-- Profiles: users can view/update their own profile; master_admin can view all
create policy "Users can view own profile" on public.profiles
for select using (id = auth.uid());

create policy "Master admins can view all profiles" on public.profiles
for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master_admin')
);

create policy "Users can insert own profile" on public.profiles
for insert with check (id = auth.uid());

create policy "Users can update own profile" on public.profiles
for update using (id = auth.uid());

-- Clients: Allow authenticated users, application layer handles role-based access
-- Clients: enforce multi-tenant access
create policy "Master admins can select all clients" on public.clients
for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master_admin')
);

create policy "Agency admins can select clients in their agency" on public.clients
for select using (
  exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'agency_admin' and p.agency_id = public.clients.agency_id
  )
);

create policy "Clients can select their own record" on public.clients
for select using (auth.uid() is not null and auth.uid() = auth.uid() and auth.uid() = public.clients.auth_user_id);

create policy "Agency admins can insert clients for their agency" on public.clients
for insert with check (
  exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'agency_admin' and p.agency_id = new.agency_id
  ) OR exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master_admin'
  )
);

create policy "Agency admins can update clients in their agency" on public.clients
for update using (
  exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'agency_admin' and p.agency_id = public.clients.agency_id
  ) OR exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master_admin'
  )
);

create policy "Agency admins can delete clients in their agency" on public.clients
for delete using (
  exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'agency_admin' and p.agency_id = public.clients.agency_id
  ) OR exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master_admin'
  )
);

-- Audit Logs: Allow authenticated users to read/write
create policy "Anyone can read audit logs" on public.audit_logs
for select using (auth.uid() is not null);

create policy "Anyone can create audit logs" on public.audit_logs
for insert with check (auth.uid() is not null);
