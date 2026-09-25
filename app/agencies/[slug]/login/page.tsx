import { findAgency } from "@/lib/agencies";
import { SignInForm } from "@/components/sign-in-form";
import { AuthShell } from "@/components/ui/auth-shell";

export const metadata = { title: "Sign in — AdSetGo" };

/**
 * The address a platform admin gives an agency. The agency's name is read on
 * the server and arrives with the page, so there is no "Loading…" screen while
 * the browser looks it up.
 */
export default async function AgencyLoginPage({
  params,
}: PageProps<"/agencies/[slug]/login">) {
  const { slug } = await params;
  const agency = await findAgency(slug);

  if (!agency) {
    return (
      <AuthShell eyebrow="Agency access" title="Workspace not found">
        <p className="text-sm text-ink-soft">
          Check the link your platform administrator sent you, or ask them to send it again.
        </p>
      </AuthShell>
    );
  }

  return (
    <SignInForm
      eyebrow="Agency access"
      title={agency.name}
      subtitle="Sign in to manage your clients and campaigns."
      footer={`Accounts are created by invitation. Check your email for a link from ${agency.name}.`}
      placeholder="you@agency.com"
      returnTo={`/agencies/${slug}/login`}
    />
  );
}
