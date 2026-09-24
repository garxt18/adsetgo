import { redirect } from "next/navigation";

/**
 * The agency workspace lives at /agencies/[slug]/dashboard.
 *
 * This path used to render a second, near-duplicate workspace that read the
 * agencies table directly with the anon key. That read returns no rows unless
 * the viewer holds a Supabase session for that agency, so the page could sit on
 * "Loading..." forever, and it offered no way to connect Google Ads. Rather
 * than maintain two workspaces, this one sends people to the real dashboard.
 */
export default async function AgencyIndexPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  redirect(`/agencies/${slug}/dashboard`);
}
