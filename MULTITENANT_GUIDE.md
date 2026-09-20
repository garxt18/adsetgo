# Multi-Tenant Authentication Guide

This guide explains how the multi-tenant authentication system works for your Google Ads SaaS platform.

## Architecture Overview

The system has **three user roles** with complete data isolation:

1. **Master Admin** - Creates and manages agencies
2. **Agency Admin** - Manages their own agency and invites clients
3. **Client** - Views only their own data within an agency

Each level is protected by **Row Level Security (RLS)** policies and role-based access control.

---

## How It Works

### 1. Create an Agency (Master Admin)

**Location:** `/agencies/new`

1. Master admin logs in to master dashboard (`/dashboard`)
2. Clicks "Create Agency"
3. Fills in:
   - Agency Name (e.g., "ABC Marketing")
   - Agency Slug (URL slug, auto-generated)
   - Agency Owner Name
   - Agency Owner Email
   - Google Ads MCC ID (optional)
4. Clicks "Create Agency"
5. **A signup link is displayed** - share this with the agency owner

### 2. Agency Admin Registration (Agency Owner)

**Location:** `/agencies/[slug]/login`

1. Agency owner receives the signup link: `http://yoursite.com/agencies/abc-marketing/login`
2. Opens the link and clicks "Sign Up"
3. Fills in:
   - First Name & Last Name
   - Email
   - Password (minimum 8 characters)
4. Clicks "Create Account"
5. **Redirected to Agency Dashboard** (`/agencies/[slug]/dashboard`)

### 3. Agency Admin Manages Clients

**Location:** `/agencies/[slug]/dashboard`

Agency admins can:
- View list of all their clients
- Invite new clients by email
- See client status (Active/Invited)
- View total clients and statistics

**To Invite a Client:**
1. Click "+ Invite Client" button
2. Enter client name and email
3. Click "Send Invitation"
4. **A signup link is displayed** - share with the client

### 4. Client Signup (via Invitation)

**Location:** `/agencies/[slug]/client-signup/[id]`

1. Client receives invitation with signup link: `http://yoursite.com/agencies/abc-marketing/client-signup/[client-id]`
2. Opens link - sees their pre-filled information
3. Creates a password
4. Clicks "Create Account"
5. **Redirected to Client Dashboard** (`/agencies/[slug]/client-dashboard`)

### 5. Client Login (Existing Account)

**Location:** `/agencies/[slug]/client-login`

1. Client navigates to: `http://yoursite.com/agencies/abc-marketing/client-login`
2. Enters email and password
3. **Only sees their own data** due to RLS policies

---

## Multi-Tenancy & Data Isolation

### How It Works

**URL Slug Routing:**
- Each agency has a unique slug: `/agencies/[slug]/`
- All pages are scoped to that agency
- Users can only access their assigned agency

**Database Level (RLS):**
- All tables have RLS policies enabled
- Admins can only see their agency's data
- Clients can only see their own records
- Master admin sees all data

### User Profile Structure

```
Profile Row:
- id: User's auth.users.id
- email: User's email
- role: 'master_admin' | 'agency_admin' | 'client'
- agency_id: Which agency they belong to
- client_id: (if role='client') Their client record
```

### Data Access by Role

| Feature | Master Admin | Agency Admin | Client |
|---------|-------------|-------------|--------|
| Create Agencies | ✓ | ✗ | ✗ |
| View Own Agency | ✓ (all) | ✓ | ✗ |
| Invite Clients | ✗ | ✓ | ✗ |
| View Own Clients | ✗ | ✓ | ✗ |
| View Own Data | ✓ (all) | ✓ | ✓ |
| Edit Campaigns | ✗ | ✓ | (via agency) |

---

## API Endpoints

### Agency Admin Signup
```
POST /api/auth/agency-admin/signup

Body:
{
  "email": "admin@agency.com",
  "password": "SecurePass123",
  "agencyId": "uuid",
  "agencySlug": "abc-marketing",
  "firstName": "John",
  "lastName": "Doe"
}

Response (201):
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "email": "admin@agency.com",
    "agencyId": "agency-uuid",
    "agencySlug": "abc-marketing"
  }
}
```

### Client Signup
```
POST /api/auth/client/signup

Body:
{
  "email": "client@business.com",
  "password": "SecurePass123",
  "clientId": "uuid",
  "agencySlug": "abc-marketing"
}

Response (201):
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "email": "client@business.com",
    "clientId": "client-uuid",
    "agencySlug": "abc-marketing"
  }
}
```

---

## Page Structure

### Public Routes
- `/login` - Master admin login
- `/signup` - Master admin signup
- `/agencies/[slug]/login` - Agency admin login/signup
- `/agencies/[slug]/client-login` - Client login
- `/agencies/[slug]/client-signup/[id]` - Client signup via invitation

### Protected Routes
- `/dashboard` - Master admin dashboard (master_admin only)
- `/agencies/[slug]/dashboard` - Agency admin dashboard (agency_admin only)
- `/agencies/[slug]/client-dashboard` - Client dashboard (client only)

---

## Security Features

1. **Row Level Security (RLS)**
   - All tables have RLS enabled
   - Policies checked at database level
   - Cannot be bypassed even with direct queries

2. **Role-Based Access Control**
   - All pages verify user role and agency
   - Redirects to login if unauthorized
   - Session validation on each load

3. **Data Isolation**
   - Clients can only access their own records
   - Admins can only access their agency's data
   - Master admin can access all data

4. **Secure Authentication**
   - Uses Supabase Auth with JWT tokens
   - Passwords minimum 8 characters
   - Automatic session management

---

## Testing the System

### Test Flow 1: Create Agency and Add Client

1. Login as master admin
2. Go to `/agencies/new`
3. Create agency: "Test Agency"
4. Share signup link with agency owner
5. Agency owner signs up at `/agencies/test-agency/login`
6. Agency admin invites a client
7. Client signs up via invitation link
8. Client logs in and sees their own data only

### Test Flow 2: Verify Data Isolation

1. As Agency Admin:
   - Add Client A and Client B
   - Verify you see both in dashboard

2. As Client A:
   - Login at `/agencies/test-agency/client-login`
   - Verify you see only your own data
   - You should NOT see Client B's information

3. As Client B:
   - Login at `/agencies/test-agency/client-login`
   - Verify you see only your own data
   - You should NOT see Client A's information

---

## Troubleshooting

### Issue: "Agency not found" on login page
- Verify the slug is correct (URL should be `/agencies/[slug]/login`)
- Check that agency exists in database
- Verify agency slug hasn't been changed

### Issue: "You do not have access to this agency"
- User's profile agency_id doesn't match URL slug's agency
- Verify the user was created with correct agency_id
- Check profiles table in Supabase

### Issue: Client sees other clients' data
- **Critical:** Check RLS policies on clients table
- Verify client profile has correct client_id set
- Verify profile row has correct role='client'

### Issue: "Could not verify permissions" on dashboard
- Profile not created for user
- Check profiles table to ensure record exists
- Verify role is set correctly

---

## Customization & Enhancement Ideas

1. **Email Invitations**
   - Send actual emails with signup links
   - Add Resend or SendGrid integration

2. **Custom Agency Domains**
   - Map custom domains to agency slugs
   - Use middleware to detect domain

3. **Agency Branding**
   - Let each agency customize colors/logo
   - Store branding in agencies table

4. **Audit Logging**
   - audit_logs table already exists
   - Log all client management actions

5. **Team Members**
   - Add multiple admins per agency
   - Additional role: 'agency_team_member'

6. **Client Permissions**
   - Some clients view-only vs. edit
   - Granular permission control

---

## Database Schema

### Key Tables

**agencies**
- id (uuid, PK)
- name (text)
- slug (text, unique) - Used in URLs
- google_ads_manager_customer_id (text)
- created_at, updated_at

**profiles**
- id (uuid, PK, FK auth.users)
- email (text)
- role ('master_admin' | 'agency_admin' | 'client')
- agency_id (uuid, FK agencies)
- client_id (uuid, FK clients)

**clients**
- id (uuid, PK)
- agency_id (uuid, FK agencies) - Multi-tenancy key
- name (text)
- email (text)
- google_ads_customer_id (text)
- auth_user_id (uuid, FK auth.users)
- status ('invited' | 'active')

**audit_logs**
- id (uuid, PK)
- agency_id (uuid, FK agencies)
- client_id (uuid, FK clients)
- user_id (uuid, FK auth.users)
- action, resource_type, resource_id
- previous_value, new_value

---

## Support

For issues or questions:
1. Check RLS policies in Supabase dashboard
2. Verify profile records have correct role and agency_id
3. Review browser console for auth errors
4. Check Supabase logs for API errors

