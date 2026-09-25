import { SignInForm } from "@/components/sign-in-form";

export const metadata = { title: "Sign in — AdSetGo" };

/** The platform's own sign-in screen, and the one the home page links to. */
export default function LoginPage() {
  return (
    <SignInForm
      eyebrow="AdSetGo"
      title="Sign in"
      subtitle="Manage agencies, connections and client access."
      placeholder="name@company.com"
      returnTo="/login"
      devShortcut
    />
  );
}
