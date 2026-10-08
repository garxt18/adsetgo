import { Suspense } from "react";

import { SetPassword } from "@/components/set-password";

export const metadata = { title: "Reset your password — AdSetGo" };

/** Where a platform admin reset link lands, if one is sent from Supabase. */
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <SetPassword />
    </Suspense>
  );
}
