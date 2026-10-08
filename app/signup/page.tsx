import Link from "next/link";

import { SignInForm } from "@/components/sign-in-form";
import { AuthShell } from "@/components/ui/auth-shell";
import { agencySignupOpen } from "@/lib/agency-signup";
import { signInError } from "@/lib/sign-in-page";

export const metadata = { title: "Create your agency — AdSetGo" };

/**
 * Where an agency starts its own workspace: sign in with Google here, then
 * name the agency on the next screen (/signup/agency). Nobody has to send
 * them a link first.
 */
export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { error } = await searchParams;

  if (!agencySignupOpen()) {
    return (
      <AuthShell eyebrow="Create an agency" title="Sign-ups are closed">
        <p className="text-sm text-ink-soft">New agency sign-ups are closed at the moment. Already have a workspace?</p>
        <Link href="/login" className="mt-4 inline-block text-sm text-brand underline-offset-4 hover:underline">
          Sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <SignInForm
      eyebrow="Create an agency"
      title="Start your workspace"
      subtitle="Sign in with Google, then name your agency. Your clients each get their own private report."
      from="/signup"
      error={signInError(error)}
      footer={
        <>
          Already have a workspace?{" "}
          <Link href="/login" className="text-brand underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    />
  );
}
