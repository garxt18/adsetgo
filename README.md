# AdSetGo

Google Ads reporting for agencies and their clients.

A multi-tenant dashboard where a platform owner onboards agencies, each agency
connects its own Google Ads manager account (MCC), and each of its clients sees
only their own campaign data.

## Who is who

| Role | Created by | Sees |
| --- | --- | --- |
| `master_admin` | Bootstrapped locally (see below) | Every agency |
| `agency_admin` | Signs up at `/signup`, or invited by a master admin | Their own agency and its clients |
| `client` | Invited by their agency | Their own client record only |

One agency corresponds to one Google Ads MCC. The client accounts under that MCC
become `clients` rows.

## How accounts are made

- **Agencies sign themselves up** at `/signup`: Continue with Google, then name
  the agency and pick its web address (`/signup/agency`). The owner is whoever
  is signed in, taken from the session, never from the request; one Google
  account owns at most one workspace, and a login that already has a role
  (a client, say) cannot make itself an agency owner
  (`app/api/signup/agency/route.ts`, rules in `lib/agency-signup.ts`).
- **The platform admin can still create an agency** at `/agencies/new` and
  invite its owner.
- **Clients exist only by their agency's invitation.** Adding a client creates
  the login for the address entered, with its role (`lib/invites.ts`), and
  returns the client sign-in page to send them. Nothing is emailed.

The role is fixed by the server when the agency or invitation is made, so
signing in can never choose what you become. An earlier public sign-up
endpoint, keyed on the agency id and slug, let anyone register as any agency's
admin or bind their login to an existing client; nothing like it may return.

**Closing sign-ups.** Set `AGENCY_SIGNUP_CLOSED=1` (in Vercel's environment
variables, then redeploy) and `/signup` says sign-ups are closed and the API
refuses new agencies. Invitations keep working.

## Signing in with Google

Agencies and clients sign in with **Continue with Google**, and only with it,
from their own sign-in page or from `/login`; the server sends each person to
their own workspace.
The platform admin can too, and keeps a password as a backup on `/login`, so a
problem with one Google account can never lock the owner out of the platform.

1. The invitation creates a login for the invited address, marked confirmed and
   with no password.
2. The person signs in with the Google account for that address. Supabase
   attaches Google to the existing login because the addresses match, so it
   keeps its role.
3. `/auth/callback` checks the login has a profile. A Google account with none
   goes on to name its agency only if it started from `/signup`; from any
   other screen it is signed out, its Google-only login is deleted, and the
   page says it was not invited. Someone trying a client's sign-in page with
   the wrong Google account is never steered into creating an agency.

The invited address must be a Google account: Gmail, or a work address on
Google Workspace (or one registered as a Google account).

**Google only is enforced on the server, not just in the page.** Supabase's
sign-in API is public, so an old password, or a reset email, could still make
a session. Each session records how it was made (`amr`), and
`getCurrentProfile` treats an agency or client session not made with Google as
signed out (`lib/sign-in-methods.ts`). In local development a one-time admin
sign-in link is also accepted, for testing as an agency or client; production
never accepts it.

**Setup this depends on** (once per project):

1. **Google Cloud Console → APIs & Services → Credentials → Create OAuth client
   ID → Web application**, in a project of its own for sign-in. Add the
   Supabase callback, `https://<project-ref>.supabase.co/auth/v1/callback`, as
   an authorised redirect URI. Its consent screen asks only for name and email
   (no sensitive scopes), so it can be published to production without
   Google's review; keep it separate from the Google Ads connection client,
   whose Ads scope does need review, so sign-in never waits on that.
2. **Supabase → Authentication → Sign In / Providers → Google**: switch on and
   paste that client's ID and secret.
3. **Supabase → Authentication → URL Configuration → Redirect URLs**: add
   `http://localhost:3001/**` (the production address needs no entry when it is
   the Site URL, which Supabase always allows). Supabase matches
   the whole return address, including `?from=...`, so an exact
   `/auth/callback` entry does not match and sign-in lands on the Site URL
   instead.
4. **Supabase → Authentication → Sign In / Providers → "Allow new users to sign
   up": on.** Agency sign-up needs Supabase to create a login for a new Google
   account. This also lets anyone make a bare email login through Supabase's
   public API, but such a login has no role and reaches nothing, and only a
   Google session can create an agency.

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

## Currency

Every client is reported in **their own Google Ads account's currency**
(`customer.currency_code`, fetched by `fetchAccountCurrency` and remembered for
a day): a UK client in pounds, an Indian one in rupees, on the dashboard, the
PDF and the CSV. Google states figures in the account's currency, so labelling
them in another was simply wrong. Rupee amounts keep Indian grouping
(₹1,89,449); every other currency uses international grouping (£189,449).

An agency can have clients in several currencies. Money is never added across
them: the agency dashboard and PDF show spend and cost per conversion per
currency ("₹3,543 · £1,279"), each client row in its own currency, and the
client-list CSV has a Currency column. Counts (clicks, conversions,
impressions) are the same in any currency and are totalled as one. Sorting the
client list by spend compares raw amounts, so in a mixed-currency agency it
orders within each currency rather than by true value; converting would need
exchange rates from an outside service.

Daily charts cover every day of the period, with quiet days as zero, so ads
that stopped mid-period show as stopping rather than stretching across it.

## Campaign highlights

The **Campaigns** tab opens with four answers for the chosen period: total
campaigns (and how many are active now), the best campaign, the lowest
performing and the most costly (with its share of spend). Each is a button:
pressing it orders the table to match and marks that campaign in it.

- **Best**: most conversions; the cheaper wins a tie.
- **Lowest performing**: fewest conversions among campaigns that spent; the
  dearer comes first on a tie, so money spent for nothing leads. Not shown
  with only one campaign, since it would only repeat the best.
- **Most costly**: highest spend.

They are worked out from the campaigns the report already loads
(`campaignHighlights` in `lib/google-ads/report.ts`), so they follow every
period, custom ranges included, and cost no extra Google queries. The PDF
prints the same four, worded by the same code (`highlightTiles`).

## Ads and keywords

The **Ads** tab, next to Calls, lists every ad shown in the period with the
campaign and ad group it runs in, and opens with four answers: ads shown, the
best ad (most conversions), best reach and most clicks. As on the Campaigns
tab, each answer is a button that orders the table to match and marks that ad.
Below the ads are the **best performing keywords**: the 25 with the most
conversions, then clicks, with match type, campaign and ad group.

- An ad is named by its first three headlines, pinned ones in place. Google
  mixes a responsive ad's headlines each time it shows, so this is how it
  usually reads. Insertion codes read as the ad shows them:
  `{KeyWord:Cheap Flights}` as "Cheap Flights", `{LOCATION(City)}` as "[city]".
- "Reach" is times shown (impressions). Google counts unique people only for
  video and display campaigns, so impressions are the measure every ad has.
- Status is the ad's own: an ad can be active inside a paused campaign.
- Performance Max builds its ads from asset groups, so its campaigns have no
  ads listed; keywords belong to Search campaigns only.

The tab loads through `/api/google-ads/ads`, guarded like every report route
(a client sees only their own account, agency staff only their clients). It
costs two Google queries per period, only when opened, and both are cached.
Google sorts and trims the keywords, so a large account sends 25 rows, not
thousands. The PDF prints the same highlights, the top 10 ads and the top 10
keywords; if only those fail, the rest of the PDF still prints.

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

Every report screen offers **Download CSV** and **Download PDF** for the period
on screen. On the client's dashboard and the agency's page for a client, the CSV
is the period's campaigns and the PDF is the whole report; on the agency
dashboard, the CSV is the client list and the PDF the agency overview. CSVs are
built in the browser from the figures already loaded (`components/download-csv.tsx`),
with money and rates as plain numbers a spreadsheet can add up, and cells that
a spreadsheet would run as a formula neutralised (`lib/export.ts`). Each PDF
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

The app sends no email of any kind, so there is no "Forgot password" link.
Agencies and clients have no password. The platform admin's password is a
backup to Google: if it is forgotten, sign in with Google, or change it in
Supabase (Authentication → Users). `/reset-password` remains as the landing
page for a reset link sent from the Supabase dashboard; a reset session for an
agency or client is refused by the server.

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
  agencies/new/           master admin creates an agency and gets its sign-in link
  api/agencies/           agency and client CRUD (authorised per tenant)
  api/google-ads/         OAuth, account tree, metrics, campaign controls
  api/dev/                local bootstrap helpers, disabled in production
  auth/callback/          where Google sign-in returns; lets in logins with a role
  signup/                 an agency creates its own workspace (then signup/agency/)
  reset-password/         where a reset link sent from Supabase lands
  api/auth/home/          where the signed-in person belongs
lib/
  api-auth.ts             requireApiAuth / requireAgencyAccess / canManageAgency
  agencies.ts             finds an agency by its address, for pages (server only)
  invites.ts              invitations: the login, its role, and the sign-in link
  sign-in-methods.ts      agencies and clients must have signed in with Google
  sign-in-page.ts         the sign-in screens and their Google error messages
  agency-signup.ts        rules for an agency's own sign-up: name, address, on/off
  home.ts                 where a signed-in person belongs (server)
  audit.ts                writes sensitive actions to audit_logs
  home-path.ts            asks the server where a signed-in person goes
  dev-only-env.ts         refuses deployments carrying dev-login variables
  google-ads/auth.ts      tokens, account tree and metrics queries
  google-ads/report.ts    the report arithmetic, shared by every figure on screen
  google-ads/calls.ts     the Calls tab's arithmetic
  google-ads/ads.ts       the Ads tab's arithmetic: ads, highlights, keywords
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

## Phone layout rules

Every page must fit a 360px-wide phone exactly: any element wider than the
screen widens the whole page, and people scroll sideways into an empty strip.
Three rules keep that from happening; break one and the strip comes back.

- **Wide content scrolls inside `ScrollX`** (`components/ui/scroll-x.tsx`),
  never in a bare `overflow-x-auto` box. The box must be `relative`, or the
  hidden screen-reader labels inside it (every change chip has one) escape and
  widen the page. That is what made the agency dashboard 360px too wide.
- **Every grid states its phone columns**: `grid grid-cols-1 sm:grid-cols-2`,
  never `grid sm:grid-cols-2`. A grid without them sizes its column to its
  widest content, such as a campaign name that does not wrap.
- **Pop-overs are pinned to the screen on phones** (`max-sm:fixed
  max-sm:inset-x-4`), as the custom date panel and the PDF error are. A pop-over
  anchored to a button opens off one edge when the button wraps.

To check a page, open it at 360px wide (DevTools device toolbar) and run
`document.documentElement.scrollWidth - innerWidth` in the console: it must be 0.

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
- **In production there is no login shortcut.** The master admin signs in with
  Google or their Supabase password, so the password must be a strong one; the
  local development value is not a credential to reuse.
- **Agencies and clients get in with Google only, checked on the server.**
  `getCurrentProfile` refuses their sessions unless `amr` says Google
  (`lib/sign-in-methods.ts`). Hiding a form is not a control: the Supabase
  sign-in API is public.
- **A Google sign-in gives no role by itself.** `/auth/callback` lets in a
  login only if it has a profile. The only ways to get one are an invitation
  and `/api/signup/agency`, which makes the caller the owner of a new, empty
  agency and nothing else. Never create a profile from what the callback
  receives, and never let sign-up attach a login to an existing agency or
  client, or anyone with a Google account could give themselves access.
- **The callback returns only to a real sign-in screen.** Its `from` value is
  checked against the three sign-in paths (`lib/sign-in-page.ts`), so it
  cannot be turned into a redirect to another site.
