"use client";

import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/ui/theme";
import { Identity, TopBar, TopBarLink } from "@/components/ui/top-bar";

/**
 * Frame for an agency's workspace.
 *
 * The agency's own name and initial lead the bar -- this is their workspace,
 * not ours -- and the destinations sit in the same bar, at the same size, as
 * on every other page. It used to be a narrow icon rail with 10px labels,
 * which was hard to read and was the one navigation that looked unlike the
 * rest of the product.
 */
export function AgencyShell({
  agencyName,
  slug,
  active,
  children,
  actions,
}: {
  agencyName: string;
  slug: string;
  active: "clients" | "connection";
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <TopBar
        identity={
          <Identity
            name={agencyName}
            subtitle="Agency workspace"
            href={`/agencies/${slug}/dashboard`}
          />
        }
        nav={
          <>
            <TopBarLink
              href={`/agencies/${slug}/dashboard`}
              label="Clients"
              active={active === "clients"}
            />
            <TopBarLink
              href={`/agencies/${slug}/dashboard?view=connection`}
              label="Google Ads"
              active={active === "connection"}
            />
          </>
        }
        actions={
          <>
            <ThemeToggle />
            {actions}
          </>
        }
      />

      <main className="mx-auto max-w-[1400px] px-5 py-6 sm:px-8">{children}</main>
    </div>
  );
}
