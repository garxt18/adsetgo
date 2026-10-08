import Link from "next/link";

import { SignInForm } from "@/components/sign-in-form";
import { signInError } from "@/lib/sign-in-page";

export const metadata = { title: "Sign in — AdSetGo" };

/**
 * The general sign-in screen, the one the home page links to. Anyone with a
 * workspace can use it: the server sends each person to their own. It alone
 * keeps the password form, the platform admin's backup to Google.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;

  return (
    <SignInForm
      eyebrow="AdSetGo"
      title="Sign in"
      subtitle="Continue with Google to open your workspace."
      from="/login"
      error={signInError(error)}
      adminPassword
      footer={
        <>
          New agency?{" "}
          <Link href="/signup" className="text-brand underline-offset-4 hover:underline">
            Create your workspace
          </Link>
        </>
      }
    />
  );
}
