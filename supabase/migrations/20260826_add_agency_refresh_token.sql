-- Add per-agency Google Ads refresh token storage
alter table public.agencies
add column if not exists google_ads_refresh_token text;

-- Index for quick lookup (not strictly necessary)
create index if not exists idx_agencies_refresh_token on public.agencies (google_ads_refresh_token);
