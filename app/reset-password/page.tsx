import { Suspense } from "react";

import { SetPassword } from "@/components/set-password";

export const metadata = { title: "Reset your password — AdSetGo" };

/** Where a password-reset link lands, whether emailed or issued by an admin. */
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <SetPassword mode="reset" />
    </Suspense>
  );
}
