# Multi-Tenant Authentication - Quick Reference

## User Journey Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MASTER ADMIN FLOW                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  1. Login at /login                                                  │
│     ↓                                                                 │
│  2. View /dashboard                                                  │
│     ↓                                                                 │
│  3. Click "Create Agency" → /agencies/new                            │
│     ↓                                                                 │
│  4. Fill form & create agency                                        │
│     ↓                                                                 │
│  5. Share signup link with agency owner                              │
│     Link: http://yoursite.com/agencies/[slug]/login                 │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      AGENCY ADMIN FLOW                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  1. Receive signup link: /agencies/[slug]/login                      │
│     ↓                                                                 │
│  2. Click "Sign Up"                                                  │
│     ↓                                                                 │
│  3. Enter name, email, password                                      │
│     ↓                                                                 │
│  4. Account created, redirected to /agencies/[slug]/dashboard        │
│     ↓                                                                 │
│  5. View client list & click "+ Invite Client"                       │
│     ↓                                                                 │
│  6. Enter client name & email                                        │
│     ↓                                                                 │
│  7. Copy & share signup link with client                             │
│     Link: http://yoursite.com/agencies/[slug]/client-signup/[id]    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT FLOW                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  OPTION A: Via Invitation                                            │
│  ────────────────────────────                                        │
│  1. Receive signup link: /agencies/[slug]/client-signup/[id]         │
│     ↓                                                                 │
│  2. Pre-filled info is shown (name, email)                           │
│     ↓                                                                 │
│  3. Create password & sign up                                        │
│     ↓                                                                 │
│  4. Redirected to /agencies/[slug]/client-dashboard                  │
│     ✓ Can only see their own data (RLS enforced)                    │
│                                                                       │
│  OPTION B: Returning Client                                          │
│  ──────────────────────────                                          │
│  1. Navigate to /agencies/[slug]/client-login                        │
│     ↓                                                                 │
│  2. Enter email & password                                           │
│     ↓                                                                 │
│  3. Logged in, redirected to /agencies/[slug]/client-dashboard       │
│     ✓ Can only see their own data (RLS enforced)                    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Role-Based Access Matrix

```
┌─────────────────────┬──────────────┬────────────┬────────┐
│ Feature             │ Master Admin  │ Agency Adm │ Client │
├─────────────────────┼──────────────┼────────────┼────────┤
│ Create Agencies     │ ✓            │ ✗          │ ✗      │
│ View Dashboard      │ /dashboard   │ /agencies/ │ /agenci│
│                     │              │ [slug]/dash│ es/[s] │
│                     │              │            │ /clien │
│                     │              │            │ t-dash │
│ View All Agencies   │ ✓            │ ✗          │ ✗      │
│ View Own Agency     │ ✓ (all)      │ ✓          │ ✗      │
│ Invite Clients      │ ✗            │ ✓          │ ✗      │
│ View Clients        │ ✓ (all)      │ ✓ (own)    │ ✗      │
│ View Own Data       │ ✓ (all)      │ ✓ (all)    │ ✓      │
│ See Other Clients   │ ✓            │ ✓          │ ✗      │
│ Data Isolation      │ None         │ By Agency  │ By Clnt│
└─────────────────────┴──────────────┴────────────┴────────┘
```

## URL Structure

```
Base: http://yoursite.com

Master Admin:
  /login                          - Master admin login
  /signup                         - Master admin signup  
  /dashboard                      - Master admin dashboard
  /agencies/new                   - Create new agency

Agency Admin:
  /agencies/[slug]/login          - Agency admin login/signup
  /agencies/[slug]/dashboard      - Agency dashboard

Clients:
  /agencies/[slug]/client-login   - Client login
  /agencies/[slug]/client-signup/[id]   - Client signup (invitation)
  /agencies/[slug]/client-dashboard     - Client dashboard
```

## Authentication Flow Diagram

```
┌──────────────┐
│   Supabase   │
│   Auth       │
└──────┬───────┘
       │
       ├─→ Create User (auth.users table)
       │
       └─→ JWT Token (stored in cookie)
           ↓
       ┌──────────────┐
       │ Supabase DB  │
       │ Profiles TBL │ ← Link user to role & agency
       └──────────────┘
           ↓
       ┌──────────────┐
       │ RLS Policies │ ← Enforce data access
       └──────────────┘
```

## Database Constraints

```
auth.users (Supabase managed)
  ├─ id (UUID)
  ├─ email
  └─ password (hashed)
       ↓ (FK)
  
profiles
  ├─ id = auth.users.id
  ├─ role (master_admin | agency_admin | client)
  ├─ agency_id (FK)
  └─ client_id (FK)
       ↓ ↓
  
  agencies              clients
  ├─ id                 ├─ id
  ├─ slug (unique)      ├─ agency_id (FK)
  ├─ name               ├─ auth_user_id (FK) ← Links to auth.users
  └─ ...                └─ ...
```

## How Data Isolation Works

```
EXAMPLE: Two Agencies (Agency A & B), Two Clients per agency

┌─────────────────────────────────────────────────────────────┐
│                      Agency A                               │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Admin User (admin-a@agency-a.com)                 │    │
│  │ Role: agency_admin                                 │    │
│  │ Agency ID: a1b2c3d4                               │    │
│  │ CAN VIEW: All clients in Agency A ✓               │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌───────────────────────┐    ┌───────────────────────┐    │
│  │ Client A1             │    │ Client A2             │    │
│  │ auth_user_id: uuid-1  │    │ auth_user_id: uuid-2  │    │
│  │ SEES: Only own data ✓ │    │ SEES: Only own data ✓ │    │
│  │ Sees A2? ✗ (blocked)  │    │ Sees A1? ✗ (blocked)  │    │
│  └───────────────────────┘    └───────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      Agency B                               │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Admin User (admin-b@agency-b.com)                 │    │
│  │ Role: agency_admin                                 │    │
│  │ Agency ID: e5f6g7h8                               │    │
│  │ CAN VIEW: All clients in Agency B ✓               │    │
│  │ Sees Agency A clients? ✗ (blocked by RLS)         │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌───────────────────────┐    ┌───────────────────────┐    │
│  │ Client B1             │    │ Client B2             │    │
│  │ auth_user_id: uuid-3  │    │ auth_user_id: uuid-4  │    │
│  │ SEES: Only own data ✓ │    │ SEES: Only own data ✓ │    │
│  │ Sees B2? ✗ (blocked)  │    │ Sees B1? ✗ (blocked)  │    │
│  │ Sees A1/A2? ✗ (blocked)│   │ Sees A1/A2? ✗ (blocked)│  │
│  └───────────────────────┘    └───────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

RLS Policies enforce isolation at database level - cannot be bypassed!
```

## Common Operations

### Create Agency & Invite Admin
```
1. Master admin creates agency at /agencies/new
2. Receives signup URL: /agencies/abc-marketing/login
3. Shares with agency owner
4. Agency owner signs up
5. Gets account with role='agency_admin' + agency_id set
```

### Agency Admin Invites Client
```
1. Agency admin clicks "Invite Client" on dashboard
2. Enters client name & email
3. System generates unique signup link
4. Link: /agencies/abc-marketing/client-signup/[client-id]
5. Client signs up using that link
6. Gets account with role='client' + client_id + agency_id set
```

### Client Accesses Their Data
```
1. Client logs in at /agencies/abc-marketing/client-login
2. System verifies: role='client' AND agency_id matches URL
3. Shows client dashboard at /agencies/abc-marketing/client-dashboard
4. All queries filtered by client_id (RLS policy enforced)
5. Client cannot see other clients' data (database level enforcement)
```

---

## Testing Checklist

- [ ] Create agency as master admin
- [ ] Share signup link with agency owner
- [ ] Agency owner signs up
- [ ] Agency owner logs in to dashboard
- [ ] Agency owner invites a client
- [ ] Client signs up using invitation
- [ ] Client logs in
- [ ] Client can only see their own data
- [ ] Create second client
- [ ] Verify first client cannot see second client's data
- [ ] Verify second client cannot see first client's data
- [ ] Agency owner can see both clients
- [ ] Master admin can see all agencies/clients

