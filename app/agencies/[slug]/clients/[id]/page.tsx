import Link from "next/link";
import { redirect } from "next/navigation";

import { canManageAgency } from "@/lib/api-auth";
import { findAgency } from "@/lib/agencies";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/supabase/server";
import { PageMessage } from "@/components/ui/card";
import { ClientView } from "./client-view";

/**
 * An agency's page for one client.
 *
 * Access is decided here, on the server, before any HTML is sent. The page
 * used to load, then fetch the client, then fetch the agency's name, and only
 * then ask for the report -- three waits in a row before a figure appeared.
 */
export default async function AgencyClientPage({
  params,
}: PageProps<"/agencies/[slug]/clients/[id]">) {
  const { slug, id } = await params;

  const [profile, agency] = await Promise.all([
    getCurrentProfile(),
    findAgency(slug),
  ]);

  if (!profile) redirect(`/agencies/${slug}/login`);

  if (!agency) {
    return <PageMessage message="This workspace could not be found." />;
  }

  if (!canManageAgency(profile, agency.id)) {
    return <PageMessage message="You do not have access to this client." />;
  }

  // Scoped to the agency as well as the id, so a client id from another
  // agency reads as not found rather than leaking that it exists.
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, name, email, status, google_ads_customer_id")
    .eq("id", id)
    .eq("agency_id", agency.id)
    .maybeSingle();

  if (!client) {
    return (
      <PageMessage
        message="This client could not be found."
        action={
          <Link
            href={`/agencies/${slug}/dashboard`}
            className="mt-3 inline-block text-sm text-brand underline"
          >
            Back to clients
          </Link>
        }
      />
    );
  }

  return (
    // Keyed on the account, so pointing the client at another Google Ads
    // account starts the view afresh and its report is loaded again.
    <ClientView
      key={client.google_ads_customer_id}
      slug={slug}
      agencyName={agency.name}
      client={{
        id: client.id,
        name: client.name,
        email: client.email,
        status: client.status,
        googleAdsCustomerId: client.google_ads_customer_id,
      }}
    />
  );
}
