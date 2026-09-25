"use client";

import { useState } from "react";

import { sanitizeAgencySlug } from "@/lib/google-ads/format";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyField } from "@/components/ui/copy";
import { Field } from "@/components/ui/field";
import { BrandLockup } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/ui/theme";
import { TopBar, TopBarLink } from "@/components/ui/top-bar";

export default function NewAgencyPage() {
  const [agencyName, setAgencyName] = useState("");
  const [agencySlug, setAgencySlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [mccId, setMccId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdAgency, setCreatedAgency] = useState<{
    id: string;
    slug: string;
    name: string;
    inviteLink: string | null;
    inviteError?: string | null;
  } | null>(null);

  async function handleCreateAgency(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const finalSlug = sanitizeAgencySlug(agencySlug || agencyName);

    if (!finalSlug) {
      setError("That name does not make a usable web address. Add one yourself below.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/agencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agencyName,
          slug: finalSlug,
          google_ads_manager_customer_id: mccId || null,
          ownerEmail,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "The agency could not be created.");
        return;
      }

      setCreatedAgency({
        id: data.id,
        slug: data.slug,
        name: data.name,
        inviteLink: data.inviteLink ?? null,
        inviteError: data.inviteError ?? null,
      });
    } catch {
      setError("The agency could not be created. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <TopBar
        identity={<BrandLockup href="/dashboard" subtitle="Platform admin" />}
        nav={
          <>
            <TopBarLink href="/dashboard" label="Agencies" />
            <TopBarLink href="/agencies/new" label="New agency" active />
          </>
        }
        actions={<ThemeToggle />}
      />

      <main className="mx-auto max-w-3xl px-5 py-8">
        {createdAgency ? (
          <div className="animate-rise">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-positive">
              Agency created
            </p>
            <h1 className="mt-1 text-2xl font-medium tracking-[-0.025em] text-ink">
              {createdAgency.name}
            </h1>
            <p className="tabular mt-1 text-sm text-ink-soft">/agencies/{createdAgency.slug}</p>

            <Card className="mt-6 p-6">
              <h2 className="text-base font-medium text-ink">
                Send the owner their invitation
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                This link works once, and only for {ownerEmail}. They set a password and land
                in their own dashboard.
              </p>

              {createdAgency.inviteLink ? (
                <>
                  <div className="mt-4">
                    <CopyField value={createdAgency.inviteLink} label="Owner invitation link" />
                  </div>
                  <p className="mt-3 text-xs text-ink-faint">
                    Afterwards they sign in at /agencies/{createdAgency.slug}/login
                  </p>
                </>
              ) : (
                <p className="mt-4 rounded-xl bg-caution-tint px-3.5 py-2.5 text-sm text-caution">
                  The agency exists, but no invitation could be created:{" "}
                  {createdAgency.inviteError ?? "unknown reason"}. That address may already
                  have an account.
                </p>
              )}
            </Card>

            <Card className="mt-4 p-6">
              <h2 className="text-base font-medium text-ink">What happens next</h2>
              <ol className="mt-3 space-y-2 text-sm text-ink-soft">
                <li>1. The owner opens the link and sets a password.</li>
                <li>2. They connect the agency&apos;s Google Ads manager account.</li>
                <li>3. They add clients, each of whom gets their own private report.</li>
              </ol>
            </Card>

            <div className="mt-6 flex flex-wrap gap-2">
              <ButtonLink href="/dashboard">Back to agencies</ButtonLink>
              <Button
                variant="secondary"
                onClick={() => {
                  setCreatedAgency(null);
                  setAgencyName("");
                  setAgencySlug("");
                  setOwnerEmail("");
                  setMccId("");
                }}
              >
                Create another
              </Button>
            </div>
          </div>
        ) : (
          <div className="animate-rise">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand">
              New agency
            </p>
            <h1 className="mt-1 text-2xl font-medium tracking-[-0.025em] text-ink">
              Create an agency
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              They get their own address, their own login, and their own clients.
            </p>

            <Card className="mt-6 p-6">
              <form onSubmit={handleCreateAgency} className="space-y-5">
                {error ? (
                  <p className="rounded-xl bg-negative-tint px-3.5 py-2.5 text-sm text-negative">
                    {error}
                  </p>
                ) : null}

                <Field
                  label="Agency name"
                  value={agencyName}
                  onChange={setAgencyName}
                  placeholder="Ram Marketing Agency"
                />

                <Field
                  label="Workspace address"
                  value={agencySlug}
                  onChange={setAgencySlug}
                  placeholder={sanitizeAgencySlug(agencyName) || "ram-marketing"}
                  required={false}
                  hint={`/agencies/${
                    sanitizeAgencySlug(agencySlug || agencyName) || "your-address"
                  }`}
                />

                {/* Only the email: it is what the invitation is bound to, and the
                    owner's name was asked for here but never stored anywhere. */}
                <Field
                  label="Owner email"
                  value={ownerEmail}
                  onChange={setOwnerEmail}
                  type="email"
                  placeholder="ram@agency.com"
                  hint="The invitation works only for this address."
                />

                <Field
                  label="Google Ads manager account"
                  value={mccId}
                  onChange={setMccId}
                  placeholder="123-456-7890"
                  required={false}
                  hint="Optional. The owner can connect it themselves."
                />

                <div className="flex justify-end gap-2">
                  <ButtonLink href="/dashboard" variant="secondary">
                    Cancel
                  </ButtonLink>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Creating…" : "Create agency"}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
