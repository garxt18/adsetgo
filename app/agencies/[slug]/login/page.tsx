import { findAgency } from "@/lib/agencies";
import { SignInForm } from "@/components/sign-in-form";
import { signInError } from "@/lib/sign-in-page";
import { AuthShell } from "@/components/ui/auth-shell";

export const metadata = { title: "Sign in — AdSetGo" };

/**
 * The address a platform admin gives an agency. The agency's name is read on
 * the server and arrives with the page, so there is no "Loading…" screen while
 * the browser looks it up.
 */
export default async function AgencyLoginPage({
  params,
  searchParams,
}: PageProps<"/agencies/[slug]/login">) {
  const [{ slug }, { error }] = await Promise.all([params, searchParams]);
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
      footer="Use the Google account for the address your platform administrator invited."
      from={`/agencies/${slug}/login`}
      error={signInError(error)}
    />
  );
}
