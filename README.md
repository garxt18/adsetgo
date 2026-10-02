# AdSetGo

Google Ads reporting for agencies and their clients.

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

## Calls

Each report has a **Calls** tab for the client and for the agency: calls,
answered, missed, average call length, calls per day, the campaigns that
brought them, and whether they were dialled from the ad or from the website.

The figures come from Google Ads (`call_view`), so they cover only calls to
Google's forwarding numbers: call assets, call-only ads, and website numbers
with call reporting switched on. Calls from other channels are invisible to
Google, and it hides callers' numbers, so there are no "first-time caller" or
Facebook/Bing figures; those would need a call-tracking service such as
CallRail. The tab loads through its own route (`/api/google-ads/calls`) only
when opened, so the Google queries it costs are spent only when someone looks.

## Report periods

Every report screen has the presets (7, 14 and 30 days, this month, last month)
and a **Custom** range. A custom range travels as one value,
`dateRange=2026-09-01..2026-09-15`, so the figures, the Calls tab and the PDF
all read the same days through `resolveRange` in `lib/google-ads/date-range.ts`.
It can cover up to 366 days and end yesterday at the latest (Google reports
today only partly), and it is compared with the same number of days just
before. The picker refuses anything else with a reason; the server, given a
range the picker would refuse, falls back to the default week and shows its
dates.

## PDF reports

A client downloads their whole report as a PDF from their dashboard, and an
agency can download the same PDF from that client's page. An agency also
downloads its own overview (summary figures and the client list). Each PDF
covers the period on screen and is built on the server with
`@react-pdf/renderer`: `/api/google-ads/pdf` for a client, and
`/api/agencies/[slug]/overview/pdf` for an agency. Both use the same access
checks and the same cached Google Ads data as the dashboards, so downloading a
report already on screen costs no extra quota.

The PDF's wording and figures come from the dashboard's own sources
(`lib/report-copy.ts`, `lib/google-ads/report.ts`, `lib/agency-overview.ts`),
so the two cannot disagree. The standard PDF fonts cannot draw ₹, so Inter is
embedded from `lib/pdf/fonts/` (SIL Open Font License, `OFL.txt` alongside).

## Password reset

There are two ways back in for someone who forgot their password.

- **Self-service.** Every sign-in page links to `/forgot-password`. Supabase
  emails a link that lands on `/reset-password`. The confirmation reads the
  same whether or not the address has an account, so the form cannot be used
  to find out who is on the platform.
- **Issued by whoever manages the account.** An agency can create a reset link
  for any of its clients from the client's page, and the platform admin can do
  the same for an agency's owner from the agencies table. The link is shown to
  copy and send directly, so it does not depend on email delivery. Every issue
  is written to `audit_logs`, because holding the link means being able to set
  that person's password.

Invitations and resets share one screen (`components/set-password.tsx`), and
after either one the server decides where the person belongs
(`/api/auth/home`). A client cannot read the `agencies` table, so working that
out in the browser used to send clients back to the sign-in page.

**Supabase settings this depends on** (Authentication, in the Supabase
dashboard):

1. **URL Configuration → Redirect URLs** must include
   `http://localhost:3001/reset-password` and the production equivalent.
   Without it Supabase silently sends people to the Site URL instead.
2. **SMTP.** The built-in mailer allows only a few emails an hour and, without
   custom SMTP, may not deliver to addresses outside the project team. Set up
   a provider (Resend, Postmark, SES) before relying on self-service reset.
3. **Optional, recommended: Reset Password email template.** Supabase's default
   link can only be completed in the browser that requested it. Changing the
   link to
   `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery`
   makes it work on any device; `/reset-password` accepts both forms.

## Editing and removing clients

An agency edits or removes a client from the client's page. Editing can change
the name and the Google Ads account, never the email: the email is the
client's sign-in address, and moving someone's sign-in to another address is
how an account is taken over. To change it, remove the client and add them
again. Customer ids are stored as ten digits however they were typed, so
"358-312-5339" and "3583125339" cannot become two clients.

## Removing an agency or client deletes their logins

Deleting an agency deletes its clients (the foreign key cascades) and then the
Supabase logins of its owner and every client; deleting a client deletes that
client's login. Left behind, a login could not reach any data, but it kept its
email address taken, so the same person could never be invited again.

The logins are worked out *before* the row goes (`loginsBelongingTo` in
`lib/invites.ts`), because deleting an agency clears `agency_id` on its
profiles and nothing afterwards says whose they were. Only agency admins and
clients are ever deleted this way, never a platform admin. The removal of an
agency is audited at platform level (`agency_id` null), since the agency's own
audit entries are deleted with it.

## Google Ads API notes

- **Queries are snake_case, replies are camelCase.** A query selects
  `metrics.cost_micros`; the JSON reply calls it `metrics.costMicros`. Row types
  (`GoogleAdsRow`, `CallRow` in `lib/google-ads/auth.ts`) follow the reply, and
  the sample generator writes the reply's spelling too. Reading the query's
  spelling once made every live report show ₹0 spend while sample mode looked
  fine; `report.test.ts` now fails if that happens again.
- The API version lives in exactly one place, `GOOGLE_ADS_API_VERSION` in
  `lib/google-ads/auth.ts`. Google sunsets versions (v18 and below now 404), and
  duplicated copies drift apart.
- A developer token at **Explorer** access allows production accounts but caps
  usage at **2,880 operations per day**, shared across every agency on the
  platform. Reports and the account tree are cached for five minutes
  (`lib/google-ads/report-cache.ts`), but a large agency list is still the first
  limit you will hit.
- Each agency's access token is reused for 50 minutes rather than minted per
  request, which took about 600 ms (a database read, a call to Google and a
  status write). It is dropped whenever the agency reconnects or Google refuses
  a request, so a revoked connection is still noticed and marked expired.

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
  api/google-ads/         OAuth, account tree, metrics, campaign controls
  api/dev/                local bootstrap helpers, disabled in production
  invite/accept/          where an invitation link lands
  forgot-password/        self-service reset request
  reset-password/         where a reset link lands (shares the invite screen)
  api/auth/home/          where the signed-in person belongs
lib/
  api-auth.ts             requireApiAuth / requireAgencyAccess / canManageAgency
  agencies.ts             finds an agency by its address, for pages (server only)
  invites.ts              invitations and admin-issued reset links
  audit.ts                writes sensitive actions to audit_logs
  home-path.ts            asks the server where a signed-in person goes
  safe-return.ts          keeps back links on this site
  dev-only-env.ts         refuses deployments carrying dev-login variables
  google-ads/auth.ts      tokens, account tree and metrics queries
  google-ads/report.ts    the report arithmetic, shared by every figure on screen
  google-ads/calls.ts     the Calls tab's arithmetic
  report-copy.ts          metric names and the summary sentence, for screen and PDF
  agency-overview.ts      the agency's client list with figures, for screen and PDF
  pdf/                    PDF reports: kit.tsx (layout, charts), one file per report, fonts
  google-ads/format.ts    pure helpers, safe for browser bundles
  google-ads/state.ts     signed OAuth state
  google-ads/date-range.ts  report periods and their labels, shared by routes and pages
  supabase/browser.ts     cookie-backed client for pages
  supabase/server.ts      request-scoped client, resolves the caller
  supabase/admin.ts       service-role client, server only
  supabase/env.ts         required configuration, fails fast
```

Code under `app/` imports these through the `@/` alias (`@/lib/supabase/browser`).
Modules inside `lib/` import each other relatively and with a `.ts` extension,
because `npm test` runs those files directly through Node, which resolves
neither the alias nor extensionless paths.

## Security rules that must not be relaxed

- **PDF fonts must stay traced into the deployment.** `lib/pdf/kit.tsx` reads
  them from disk by a path built at run time, which output tracing cannot see,
  so `next.config.ts` lists them under `outputFileTracingIncludes` for both PDF
  routes. A new PDF route needs adding there too, or its downloads fail on
  Vercel while working locally.

- **Every API route authorises itself.** The proxy (`proxy.ts`) matcher covers only
  `/dashboard` and `/agencies`, never `/api/*`, so there is no ambient
  protection to inherit.
- **There is no platform-wide Google Ads token.** Every agency uses the
  refresh token it stored when it connected, and nothing else. A global
  `GOOGLE_ADS_REFRESH_TOKEN` fallback used to exist: an agency that had never
  connected silently borrowed it, so its admin could add any customer id that
  token could see and read that account's figures.
- **Sessions are verified locally, access is read fresh.** `proxy.ts` and
  `getCurrentProfile` check the session with `getClaims()`, which verifies its
  signature on this server (the project signs with ES256) instead of asking
  Supabase each time; that took about 210 ms off every API call. The profile
  is still read from the database on every request, so removing someone's
  profile or changing their role takes effect immediately. The one trade-off:
  a stolen access token keeps working until it expires (at most an hour), even
  after its owner signs out. If the project is ever switched back to a shared
  (HS256) secret, `getClaims()` quietly falls back to a network call, which is
  slower but still safe.
- **A server page checks the profile before it reads tenant data.** The two
  report pages (`client-dashboard` and `clients/[id]`) settle who is asking on
  the server and read with the service-role client, which ignores row level
  security. So each one checks `getCurrentProfile()` and `canManageAgency` (or
  the client's own id) first, and scopes every query by agency id, before
  anything is rendered. A page that skips that check shows one tenant's data
  to another.
- **Never select `*` from `agencies` into a response.** That table holds
  `google_ads_refresh_token`, a standing credential for the agency's ads.
- **Nothing that imports `lib/supabase/admin.ts` may be imported by a client
  component.** Pure helpers belong in `lib/google-ads/format.ts`.
- **`DEV_ADMIN_*` and `NEXT_PUBLIC_DEV_ADMIN_*` never accompany a deployment.**
  They configure the local login shortcut in `app/login/page.tsx`, and the
  `NEXT_PUBLIC_` half is readable by the browser. A build on Vercel or CI that
  carries them fails deliberately (`lib/dev-only-env.ts`).
- **The browser Supabase client must stay `createBrowserClient` from
  `@supabase/ssr`.** The plain `createClient` keeps the session in
  localStorage, which the server cannot read, so people sign in successfully
  and are bounced straight back to the login page with no error.
- **Pages read roles, they never write them.** Roles are set when an invitation
  is created. A page that upserts its own profile can demote an agency admin,
  or hand itself `master_admin`.
- **Back links only ever point at this site.** Sign-in pages pass a `from`
  path around; it goes through `lib/safe-return.ts`, which rejects anything a
  browser would read as another website (`//x`, `/\x`, full URLs).
- **In production there is no login shortcut.** The master admin's Supabase
  password is the only way in, so it must be a strong one; the local
  development value is not a credential to reuse.
