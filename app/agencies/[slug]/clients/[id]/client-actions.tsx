"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { formatGoogleAdsCustomerId } from "@/lib/google-ads/format";
import { FormError } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

type Client = { id: string; name: string; email: string; googleAdsCustomerId: string | null };

/**
 * Rename a client or point it at another Google Ads account. The email is
 * shown but not editable: it is their sign-in address (see the PATCH route).
 */
export function EditClientButton({ slug, client }: { slug: string; client: Client }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(client.name);
  const [customerId, setCustomerId] = useState(
    formatGoogleAdsCustomerId(client.googleAdsCustomerId)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function start() {
    // Always open on what is saved now, not on an earlier abandoned edit.
    setName(client.name);
    setCustomerId(formatGoogleAdsCustomerId(client.googleAdsCustomerId));
    setError("");
    setOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/agencies/${slug}/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, google_ads_customer_id: customerId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "The client could not be updated.");
        return;
      }

      setOpen(false);
      // The page reads the client on the server, so it is asked again.
      router.refresh();
    } catch {
      setError("The client could not be updated. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="nav" onClick={start}>
        Edit
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Edit client">
        <FormError message={error} />

        <form onSubmit={save} className="space-y-4">
          <Field label="Client name" value={name} onChange={setName} />
          <Field
            label="Google Ads customer ID"
            value={customerId}
            onChange={setCustomerId}
            placeholder="123-456-7890"
            hint="Ten digits, shown at the top of their Google Ads account."
          />

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Sign-in email</p>
            <p className="rounded-xl bg-surface-sunken px-3.5 py-2.5 text-sm text-ink-soft ring-1 ring-line">
              {client.email}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              This is the address they sign in with, so it cannot be changed here. To use a
              different one, remove the client and add them again.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Remove a client and their login, after saying plainly what that means. */
export function RemoveClientButton({ slug, client }: { slug: string; client: Client }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState(false);

  const backToClients = () => router.push(`/agencies/${slug}/dashboard`);

  async function remove() {
    setRemoving(true);
    setError("");

    try {
      const res = await fetch(`/api/agencies/${slug}/clients/${client.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "The client could not be removed.");
        return;
      }

      // Gone either way; a login left behind keeps that address from being
      // invited again, so it is worth saying before leaving the page.
      if (data.loginsFailed > 0) {
        setRemoved(true);
        setError(
          `${client.name} was removed, but their login could not be deleted. Remove it in Supabase under Authentication, Users, before inviting ${client.email} again.`
        );
        return;
      }

      backToClients();
    } catch {
      setError("The client could not be removed. Try again in a moment.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <Button variant="danger" size="nav" onClick={() => setOpen(true)}>
        Remove
      </Button>

      <Modal
        open={open}
        onClose={() => (removed ? backToClients() : setOpen(false))}
        title={`Remove ${client.name}?`}
        subtitle="This cannot be undone."
      >
        <FormError message={error} />

        {removed ? (
          <div className="flex justify-end">
            <Button onClick={backToClients}>Back to clients</Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-soft">
              Their login (<strong className="font-medium text-ink">{client.email}</strong>) is
              deleted, so they can no longer sign in or see their reports. Their Google Ads
              account itself is not touched, and they can be added again later.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Keep client
              </Button>
              <Button variant="danger" onClick={remove} disabled={removing}>
                {removing ? "Removing…" : "Remove client"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
