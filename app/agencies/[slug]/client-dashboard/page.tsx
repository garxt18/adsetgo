import { redirect } from "next/navigation";

import { findAgency } from "@/lib/agencies";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/supabase/server";
import { PageMessage } from "@/components/ui/card";
import { ClientPortal } from "./client-portal";

/**
 * A client's report.
 *
 * Who is asking is settled here, on the server, before any HTML is sent. The
 * page used to do it in the browser after loading -- session, then profile,
 * then agency, then client record, each waiting for the last -- which cost
 * four round trips before the report could even be requested.
 *
 * A client cannot read the agencies table through row level security, so the
 * service-role client reads it here, and only after the profile shows this
 * client belongs to this agency.
 */
export default async function ClientDashboardPage({
  params,
}: PageProps<"/agencies/[slug]/client-dashboard">) {
  const { slug } = await params;

  const [profile, agency] = await Promise.all([
    getCurrentProfile(),
    findAgency(slug),
  ]);

  if (!profile) redirect(`/agencies/${slug}/client-login`);

  if (profile.role !== "client" || !profile.client_id) {
    return <PageMessage message="This page is for client accounts." />;
  }

  if (!agency) {
    return <PageMessage message="This workspace could not be found." />;
  }

  if (agency.id !== profile.agency_id) {
    return <PageMessage message="Your account belongs to a different agency." />;
  }

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, name, google_ads_customer_id")
    .eq("id", profile.client_id)
    .eq("agency_id", agency.id)
    .maybeSingle();

  if (!client) {
    return <PageMessage message="We could not load your account details." />;
  }

  return (
    <ClientPortal
      slug={slug}
      agencyName={agency.name}
      client={{
        id: client.id,
        name: client.name,
        googleAdsCustomerId: client.google_ads_customer_id,
      }}
    />
  );
}
