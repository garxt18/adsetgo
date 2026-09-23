# Google Ads Agency Platform

A multi-tenant dashboard where a platform owner onboards agencies, each agency
connects its own Google Ads manager account (MCC), and each of its clients sees
only their own campaign data.

## Who is who

| Role | Created by | Sees |
| --- | --- | --- |
| `master_admin` | Bootstrapped locally (see below) | Every agency |
| `agency_admin` | Invited by a master admin | Their own agency and its clients |
| `client` | Invited by their agency | Their own client record only |

One agency corresponds to one Google Ads MCC. The client accounts under that MCC
become `clients` rows.

## Accounts are invitation only

There is no public sign-up anywhere in this app, and adding one would reopen a
tenant-takeover hole: a public endpoint keyed on the agency id and slug let
anyone who read those public values register themselves as an agency's admin.

Creating an agency or a client creates the account server side and returns a
single-use link (`lib/invites.ts`). Send that link to the person; they set a
password at `/invite/accept` and land on their dashboard. The role is fixed when
the invitation is created, so accepting one can never choose what you become.

## Connecting Google Ads

1. An agency admin clicks **Connect Google Ads** on their dashboard.
2. `/api/google-ads/auth` checks they may act for that agency, then signs the
   agency id into the OAuth `state` (`lib/google-ads/state.ts`).
3. Google returns the browser to `/api/google-ads/callback`, which verifies that
   signature before storing the refresh token.

The signature is what stops a legitimately obtained authorization code from
being pointed at another tenant's agency. The callback has no session of its
own, so `state` is the only thing tying a code to an agency.

If Google later rejects the stored token, the agency is marked `expired` and the
dashboard shows a reconnect prompt rather than claiming to be connected.

## Google Ads API notes

- The API version lives in exactly one place, `GOOGLE_ADS_API_VERSION` in
  `lib/google-ads/auth.ts`. Google sunsets versions (v18 and below now 404), and
  duplicated copies drift apart.
- A developer token at **Explorer** access allows production accounts but caps
  usage at **2,880 operations per day**, shared across every agency on the
  platform. There is no caching yet, so this is the first limit you will hit.

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3001
```

Apply the SQL in `supabase/migrations/` to your Supabase project in filename
order.

To create the first master admin locally, set `DEV_ADMIN_EMAIL` and
`DEV_ADMIN_PASSWORD` in `.env.local` and open
`/api/dev/create-master-admin`. Every route under `/api/dev/` refuses to run
when `NODE_ENV=production`.

## Commands

```bash
npm run dev     # dev server on port 3001
npm run build   # production build
npm run lint    # eslint
npm test        # node --test, no test framework needed
```

## Layout

```
app/
  agencies/[slug]/        tenant pages: login, dashboard, clients, client portal
  agencies/new/           master admin creates an agency and gets an invite link
  api/agencies/           agency and client CRUD (authorised per tenant)
  api/public/agencies/    unauthenticated name lookup, for login screens only
  api/google-ads/         OAuth, account tree, metrics, campaign controls
  api/dev/                local bootstrap helpers, disabled in production
  invite/accept/          where an invitation link lands
lib/
  api-auth.ts             requireApiAuth / requireAgencyAccess
  invites.ts              invitation creation
  google-ads/state.ts     signed OAuth state
  google-ads/format.ts    pure helpers, safe for browser bundles
  google-ads/auth.ts      tokens and Google Ads queries
  supabase*.ts            browser, server and service-role clients
```

## Security rules that must not be relaxed

- **Every API route authorises itself.** The middleware matcher covers only
  `/dashboard` and `/agencies`, never `/api/*`, so there is no ambient
  protection to inherit.
- **Never select `*` from `agencies` into a response.** That table holds
  `google_ads_refresh_token`, a standing credential for the agency's ads.
- **Nothing that imports `lib/supabase-admin.ts` may be imported by a client
  component.** Pure helpers belong in `lib/google-ads/format.ts`.
- **`DEV_ADMIN_*` and `NEXT_PUBLIC_DEV_ADMIN_*` never accompany a deployment.**
  They configure the local login shortcut in `app/login/page.tsx`, and the
  `NEXT_PUBLIC_` half is readable by the browser. A build on Vercel or CI that
  carries them fails deliberately (`lib/dev-only-env.ts`).
- **In production there is no login shortcut.** The master admin's Supabase
  password is the only way in, so it must be a strong one; the local
  development value is not a credential to reuse.
