-- Fix Row Level Security policies from 20260824_multitenant.sql.
--
-- Three real defects are addressed:
--
--   1. The clients INSERT policy referenced `new.agency_id`. `new` is trigger
--      syntax and is not available inside an RLS policy; a WITH CHECK expression
--      refers to the candidate row's columns directly.
--
--   2. Every policy on `profiles` ran a subquery against `profiles`. A policy on
--      a table that reads the same table re-enters policy evaluation, which
--      Postgres rejects as infinite recursion. Role lookups now go through
--      SECURITY DEFINER helpers that run with the definer's rights and therefore
--      do not re-trigger RLS.
--
--   3. audit_logs allowed any authenticated user to read every row, so one
--      tenant could read another tenant's activity. Reads are now scoped.
--
-- This migration is written to be re-runnable.

-- ---------------------------------------------------------------------------
-- Helper functions: read the caller's own profile without re-entering RLS.
-- ---------------------------------------------------------------------------

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_profile_agency_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select agency_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_profile_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.profiles where id = auth.uid()
$$;

revoke all on function public.current_profile_role() from public;
revoke all on function public.current_profile_agency_id() from public;
revoke all on function public.current_profile_client_id() from public;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_profile_agency_id() to authenticated;
grant execute on function public.current_profile_client_id() to authenticated;

-- ---------------------------------------------------------------------------
-- agencies
-- ---------------------------------------------------------------------------

drop policy if exists "Master admins can create agencies" on public.agencies;
drop policy if exists "Agency and master admins can select agency" on public.agencies;
drop policy if exists "Master admins can update agencies" on public.agencies;

create policy "Master admins can create agencies" on public.agencies
for insert with check (public.current_profile_role() = 'master_admin');

create policy "Agency and master admins can select agency" on public.agencies
for select using (
  public.current_profile_role() = 'master_admin'
  or (
    public.current_profile_role() = 'agency_admin'
    and public.current_profile_agency_id() = id
  )
);

create policy "Master admins can update agencies" on public.agencies
for update using (public.current_profile_role() = 'master_admin');

-- ---------------------------------------------------------------------------
-- profiles  (these were the recursive ones)
-- ---------------------------------------------------------------------------

drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Master admins can view all profiles" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can view own profile" on public.profiles
for select using (id = auth.uid());

create policy "Master admins can view all profiles" on public.profiles
for select using (public.current_profile_role() = 'master_admin');

create policy "Users can insert own profile" on public.profiles
for insert with check (id = auth.uid());

-- Role and tenant columns are assigned by the server, never by the user editing
-- their own row, so they are pinned to their existing values here.
create policy "Users can update own profile" on public.profiles
for update
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = public.current_profile_role()
  and agency_id is not distinct from public.current_profile_agency_id()
  and client_id is not distinct from public.current_profile_client_id()
);

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------

drop policy if exists "Master admins can select all clients" on public.clients;
drop policy if exists "Agency admins can select clients in their agency" on public.clients;
drop policy if exists "Clients can select their own record" on public.clients;
drop policy if exists "Agency admins can insert clients for their agency" on public.clients;
drop policy if exists "Agency admins can update clients in their agency" on public.clients;
drop policy if exists "Agency admins can delete clients in their agency" on public.clients;

create policy "Master admins can select all clients" on public.clients
for select using (public.current_profile_role() = 'master_admin');

create policy "Agency admins can select clients in their agency" on public.clients
for select using (
  public.current_profile_role() = 'agency_admin'
  and public.current_profile_agency_id() = agency_id
);

-- Previously contained the tautology `auth.uid() = auth.uid()`.
create policy "Clients can select their own record" on public.clients
for select using (auth.uid() is not null and auth.uid() = auth_user_id);

-- Previously used `new.agency_id`, which is not valid inside a policy.
create policy "Agency admins can insert clients for their agency" on public.clients
for insert with check (
  public.current_profile_role() = 'master_admin'
  or (
    public.current_profile_role() = 'agency_admin'
    and public.current_profile_agency_id() = agency_id
  )
);

create policy "Agency admins can update clients in their agency" on public.clients
for update using (
  public.current_profile_role() = 'master_admin'
  or (
    public.current_profile_role() = 'agency_admin'
    and public.current_profile_agency_id() = agency_id
  )
);

create policy "Agency admins can delete clients in their agency" on public.clients
for delete using (
  public.current_profile_role() = 'master_admin'
  or (
    public.current_profile_role() = 'agency_admin'
    and public.current_profile_agency_id() = agency_id
  )
);

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------

drop policy if exists "Anyone can read audit logs" on public.audit_logs;
drop policy if exists "Anyone can create audit logs" on public.audit_logs;

create policy "Audit logs are readable within your tenant" on public.audit_logs
for select using (
  public.current_profile_role() = 'master_admin'
  or (
    public.current_profile_role() = 'agency_admin'
    and public.current_profile_agency_id() = agency_id
  )
  or (
    public.current_profile_role() = 'client'
    and public.current_profile_client_id() = client_id
  )
);

create policy "Audit logs are written for your own tenant" on public.audit_logs
for insert with check (
  public.current_profile_role() = 'master_admin'
  or (
    public.current_profile_role() in ('agency_admin', 'client')
    and public.current_profile_agency_id() = agency_id
  )
);
