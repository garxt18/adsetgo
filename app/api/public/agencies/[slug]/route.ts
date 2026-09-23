import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Public agency lookup for the tenant login pages.
 *
 * The login pages are reachable before anyone has signed in, so they cannot use
 * the authenticated /api/agencies/[slug] route (it answers 401) nor a direct
 * table read (row level security returns no rows to an anonymous caller). This
 * route deliberately exposes only what a login screen has to render: never the
 * Google Ads manager id, connection status, or refresh token.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/public/agencies/[slug]">
) {
  const { slug } = await ctx.params;

  if (!slug) {
    return NextResponse.json({ error: "Agency not found." }, { status: 404 });
  }

  const { data: agency, error } = await supabaseAdmin
    .from("agencies")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Public agency lookup failed:", error);
    return NextResponse.json({ error: "Agency not found." }, { status: 404 });
  }

  if (!agency) {
    return NextResponse.json({ error: "Agency not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: agency.id,
    name: agency.name,
    slug: agency.slug,
  });
}
