import { findAgency } from "@/lib/agencies";
import { SignInForm } from "@/components/sign-in-form";
import { signInError } from "@/lib/sign-in-page";
import { AuthShell } from "@/components/ui/auth-shell";

export const metadata = { title: "Sign in — AdSetGo" };

/** The address an agency gives its clients, carrying the agency's name. */
export default async function ClientLoginPage({
  params,
  searchParams,
}: PageProps<"/agencies/[slug]/client-login">) {
  const [{ slug }, { error }] = await Promise.all([params, searchParams]);
  const agency = await findAgency(slug);

  if (!agency) {
    return (
      <AuthShell eyebrow="Client portal" title="Workspace not found">
        <p className="text-sm text-ink-soft">
          Check the link your agency sent you, or ask them to send it again.
        </p>
      </AuthShell>
    );
  }

  return (
    <SignInForm
      eyebrow="Client portal"
      title={agency.name}
      subtitle="Sign in to see how your campaigns are performing."
      footer={`Use the Google account for the address ${agency.name} invited.`}
      from={`/agencies/${slug}/client-login`}
      error={signInError(error)}
    />
  );
}
