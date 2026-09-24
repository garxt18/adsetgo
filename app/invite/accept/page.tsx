import { Suspense } from "react";

import { SetPassword } from "@/components/set-password";

/** Where an invitation link lands. The work is shared with password reset. */
export default function AcceptInvitePage() {
  return (
    <Suspense>
      <SetPassword mode="invite" />
    </Suspense>
  );
}
