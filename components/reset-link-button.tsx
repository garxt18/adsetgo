"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/**
 * Issues a password-reset link for someone this person manages, and shows it to
 * copy and send however they like (WhatsApp, email, a call).
 *
 * The link is only created when asked for, never on page load: each one is a
 * working credential and each issue is audited, so none should exist that
 * nobody requested.
 */
export function ResetLinkButton({
  endpoint,
  who,
  size = "sm",
}: {
  /** The API route that issues the link. */
  endpoint: string;
  /** Whose password this resets, as a person would say it: "Apps", "the owner". */
  who: string;
  size?: "sm" | "nav";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function issue() {
    setOpen(true);
    setBusy(true);
    setLink("");
    setError("");
    setCopied(false);

    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "The link could not be created.");
        return;
      }

      setLink(data.link);
      setEmail(data.email ?? "");
    } catch {
      setError("The link could not be created. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size={size} onClick={issue}>
        Reset password
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Password reset for ${who}`}
        subtitle="Send this link to them. It works once."
      >
        {busy ? (
          <p className="text-sm text-ink-soft">Creating the link…</p>
        ) : error ? (
          <p className="rounded-xl bg-negative-tint px-3.5 py-2.5 text-sm text-negative">{error}</p>
        ) : (
          <div>
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                aria-label="Password reset link"
                className="w-full rounded-xl bg-surface-sunken px-3 py-2.5 text-sm text-ink ring-1 ring-line"
              />
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(link);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="mt-3 text-xs text-ink-soft">
              {email ? (
                <>
                  It signs in as <strong className="font-medium text-ink">{email}</strong> and
                  asks for a new password.{" "}
                </>
              ) : null}
              Anyone holding it can do the same, so send it only to them. Creating a link is
              recorded in the activity log.
            </p>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </Modal>
    </>
  );
}
