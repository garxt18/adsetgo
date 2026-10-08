"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { AuthShell, FormError } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { checkAgencySignup } from "@/lib/agency-signup";
import { signOut } from "@/lib/sign-out";

/**
 * Naming a new agency. The owner is whoever is signed in with Google, so the
 * form asks only for the name and web address; the server checks both again.
 */
export function AgencySignupForm({ email }: { email: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const preview = checkAgencySignup({ name, slug });
  const address = preview.ok ? preview.slug : "your-agency";

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!preview.ok) return setError(preview.error);

    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/signup/agency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.path) {
        setError(data.error ?? "Your agency could not be created. Try again in a moment.");
        setBusy(false);
        return;
      }

      router.push(data.path);
    } catch {
      setError("Your agency could not be created. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function useAnotherAccount() {
    await signOut();
    router.push("/signup");
  }

  return (
    <AuthShell
      eyebrow="Create an agency"
      title="Name your agency"
      subtitle={`You will own it, signed in as ${email}.`}
      footer={
        <button type="button" onClick={useAnotherAccount} className="text-ink-soft underline-offset-4 hover:text-brand hover:underline">
          Use a different Google account
        </button>
      }
    >
      <FormError message={error} />

      <form onSubmit={create} className="space-y-4" noValidate>
        <Field label="Agency name" value={name} onChange={setName} placeholder="Ram Marketing Agency" />
        <Field
          label="Web address"
          value={slug}
          onChange={setSlug}
          placeholder={preview.ok ? preview.slug : "ram-marketing"}
          required={false}
          hint={`Your clients sign in at /agencies/${address}/client-login`}
        />
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Creating…" : "Create agency"}
        </Button>
      </form>
    </AuthShell>
  );
}
