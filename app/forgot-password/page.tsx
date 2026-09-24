import { Suspense } from "react";

import { ForgotPassword } from "@/components/forgot-password";

export const metadata = { title: "Forgot your password — AdSetGo" };

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPassword />
    </Suspense>
  );
}
