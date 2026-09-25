"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { FilterChips } from "@/components/ui/filter-chips";
import { StatusPill } from "@/components/ui/status-pill";

/**
 * The agency's Google Ads view: the connection itself, then every account under
 * the manager account, filterable by status.
 *
 * Status groups follow Google's own account states rather than inventing new
 * ones, because an agency will check them against Google Ads itself:
 *   active    ENABLED    can serve ads
 *   suspended SUSPENDED  stopped by Google, usually billing or policy
 *   cancelled CANCELED   stopped by a person, and an admin can reactivate it
 *   closed    CLOSED     permanent; Google's test accounts are always closed
 */

type Account = {
  customerId: string;
  formattedCustomerId: string;
  name: string;
  status: string;
  hidden: boolean;
  manager: boolean;
  testAccount: boolean;
  currencyCode?: string | null;
};

type Group = "all" | "active" | "suspended" | "cancelled" | "closed";

function groupOf(status: string): Exclude<Group, "all"> {
  switch (status.toUpperCase()) {
    case "ENABLED":
      return "active";
    case "SUSPENDED":
      return "suspended";
    case "CANCELED":
      return "cancelled";
    default:
      return "closed";
  }
}

const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

/**
 * The Google Ads accounts an agency's connection can see, from the accounts
 * route (cached there for five minutes). Shared by the Google Ads view and the
 * account picker, so both show the same list from the same request.
 */
export function useGoogleAdsAccounts(slug: string) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/google-ads/accounts?agencySlug=${encodeURIComponent(slug)}`);
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok || data.connected === false) {
          setMessage(
            data.error ??
              data.message ??
              "The account list is not available until Google Ads is connected."
          );
          setState("unavailable");
          return;
        }

        setAccounts((data.accounts ?? []) as Account[]);
        setState("ready");
      } catch {
        if (cancelled) return;
        setMessage("The account list could not be loaded. Try again in a moment.");
        setState("unavailable");
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { accounts, state, message };
}

export function GoogleAdsAccounts({
  slug,
  connectionStatus,
  managerCustomerId,
  clientCustomerIds,
  onReconnect,
  onAddClient,
}: {
  slug: string;
  connectionStatus: string | null;
  managerCustomerId: string | null;
  /** Accounts already set up as clients, so they are not offered twice. */
  clientCustomerIds: string[];
  onReconnect: () => void;
  onAddClient: (account: { name: string; customerId: string }) => void;
}) {
  const { accounts, state, message } = useGoogleAdsAccounts(slug);
  const [filter, setFilter] = useState<Group>("all");

  const existing = useMemo(() => new Set(clientCustomerIds.map(digits)), [clientCustomerIds]);

  const counts = useMemo(() => {
    const result: Record<Exclude<Group, "all">, number> = {
      active: 0,
      suspended: 0,
      cancelled: 0,
      closed: 0,
    };
    for (const account of accounts) result[groupOf(account.status)] += 1;
    return result;
  }, [accounts]);

  const visible = useMemo(
    () =>
      accounts
        .filter((account) => filter === "all" || groupOf(account.status) === filter)
        // Managers first, then by name: the MCC itself is the anchor of the list.
        .sort((a, b) => Number(b.manager) - Number(a.manager) || a.name.localeCompare(b.name)),
    [accounts, filter]
  );

  return (
    <div className="space-y-4">
      <Card className="animate-rise p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-ink">Google Ads connection</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Your manager account supplies the figures for every client in this workspace.
            </p>
          </div>
          <Button size="nav" onClick={onReconnect}>
            {connectionStatus === "connected" ? "Reconnect" : "Connect Google Ads"}
          </Button>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-[0.1em] text-ink-faint">Status</dt>
            <dd className="mt-1.5">
              <StatusPill status={connectionStatus} />
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.1em] text-ink-faint">Manager account</dt>
            <dd className="tabular mt-1.5 text-sm text-ink">{managerCustomerId ?? "Not set"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.1em] text-ink-faint">Accounts found</dt>
            <dd className="tabular mt-1.5 text-sm text-ink">
              {state === "ready" ? accounts.length : "—"}
            </dd>
          </div>
        </dl>
      </Card>

      <section className="animate-rise rounded-2xl bg-surface ring-1 ring-line">
        <header className="border-b border-line px-5 py-3.5">
          <h2 className="text-base font-medium tracking-[-0.01em] text-ink">
            Accounts under this manager account
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            Filter by status to see which clients can run ads today.
          </p>
        </header>

        {state === "loading" ? (
          <p className="px-5 py-10 text-sm text-ink-soft">Loading accounts…</p>
        ) : state === "unavailable" ? (
          <div className="px-5 py-10">
            <p className="text-sm font-medium text-ink">Accounts are not available</p>
            <p className="mt-1 text-sm text-ink-soft">{message}</p>
          </div>
        ) : (
          <>
            <div className="border-b border-line px-5 py-3">
              <FilterChips
                label="Filter accounts by status"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All", count: accounts.length },
                  { value: "active", label: "Active", count: counts.active },
                  { value: "suspended", label: "Suspended", count: counts.suspended },
                  { value: "cancelled", label: "Cancelled", count: counts.cancelled },
                  { value: "closed", label: "Closed", count: counts.closed },
                ]}
              />
            </div>

            {visible.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-soft">
                {accounts.length === 0
                  ? "No accounts were found under this manager account."
                  : "No accounts have this status."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-[0.1em] text-ink-faint">
                      <th className="px-5 py-2.5">Account</th>
                      <th className="px-5 py-2.5">Customer ID</th>
                      <th className="px-5 py-2.5">Status</th>
                      <th className="px-5 py-2.5">Currency</th>
                      <th className="px-5 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((account) => {
                      const isClient = existing.has(digits(account.customerId));

                      return (
                        <tr
                          key={account.customerId}
                          className="border-b border-line transition last:border-0 hover:bg-surface-sunken"
                        >
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-ink">{account.name}</span>
                              {account.manager ? <Tag label="Manager" /> : null}
                              {account.testAccount ? <Tag label="Test" /> : null}
                            </div>
                          </td>
                          <td className="tabular px-5 py-3 text-ink-soft">
                            {account.formattedCustomerId}
                          </td>
                          <td className="px-5 py-3">
                            <StatusPill status={account.status} />
                          </td>
                          <td className="px-5 py-3 text-ink-soft">
                            {account.currencyCode ?? "—"}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex justify-end gap-2">
                              <CopyButton
                                variant="ghost"
                                size="sm"
                                label="Copy ID"
                                text={account.formattedCustomerId}
                              />

                              {/* A manager account holds other accounts; it is never a client. */}
                              {account.manager ? null : isClient ? (
                                <span className="inline-flex items-center px-3 text-xs text-ink-faint">
                                  Already a client
                                </span>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() =>
                                    onAddClient({
                                      name: account.name,
                                      customerId: account.formattedCustomerId,
                                    })
                                  }
                                >
                                  Add as client
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-[11px] font-medium text-ink-soft ring-1 ring-line">
      {label}
    </span>
  );
}

const GROUP_LABEL: Record<Exclude<Group, "all">, string> = {
  active: "Active",
  suspended: "Suspended",
  cancelled: "Cancelled",
  closed: "Closed",
};

/**
 * Which Google Ads account a client is, chosen from the accounts the agency's
 * connection can see instead of typed: a ten-digit id is easy to mistype, and
 * a mistyped one silently reports on the wrong account or none.
 *
 * Manager accounts are left out (they hold accounts, they are never a client).
 * Accounts that are already clients are listed but cannot be chosen. Without a
 * connection there is no list, so the id is typed instead.
 */
export function GoogleAdsAccountPicker({
  slug,
  value,
  onChange,
  taken = [],
}: {
  slug: string;
  /** The chosen customer id, in any format. */
  value: string;
  /** `name` is the account's name in Google Ads, or null when the id was typed. */
  onChange: (account: { customerId: string; name: string | null }) => void;
  /** Customer ids that are already clients. */
  taken?: string[];
}) {
  const { accounts, state } = useGoogleAdsAccounts(slug);
  const selected = digits(value);
  const takenIds = new Set(taken.map(digits));
  const options = accounts
    .filter((account) => !account.manager)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (state === "loading") {
    return (
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Google Ads account</p>
        <p className="rounded-xl bg-surface-sunken px-3.5 py-2.5 text-sm text-ink-soft ring-1 ring-line">
          Fetching your accounts from Google Ads…
        </p>
      </div>
    );
  }

  if (state === "unavailable" || options.length === 0) {
    return (
      <Field
        label="Google Ads customer ID"
        value={value}
        onChange={(customerId) => onChange({ customerId, name: null })}
        placeholder="123-456-7890"
        hint={
          state === "unavailable"
            ? "Connect Google Ads to choose from your accounts instead of typing the ID."
            : "No client accounts were found under your manager account, so type the ID."
        }
      />
    );
  }

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">Google Ads account</span>
      <select
        required
        value={selected}
        onChange={(event) => {
          const account = options.find((option) => option.customerId === event.target.value);
          if (account) onChange({ customerId: account.customerId, name: account.name });
        }}
        className="w-full rounded-xl bg-surface px-3.5 py-2.5 text-sm text-ink ring-1 ring-line transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <option value="" disabled>
          Choose an account
        </option>
        {/* A client pointed at an account this connection cannot see still shows as chosen. */}
        {selected && !options.some((option) => option.customerId === selected) ? (
          <option value={selected}>{value} (not under your manager account)</option>
        ) : null}
        {options.map((account) => {
          const isTaken = takenIds.has(account.customerId) && account.customerId !== selected;
          const status = groupOf(account.status);

          return (
            <option key={account.customerId} value={account.customerId} disabled={isTaken}>
              {account.name} · {account.formattedCustomerId}
              {status === "active" ? "" : ` · ${GROUP_LABEL[status]}`}
              {isTaken ? " · already a client" : ""}
            </option>
          );
        })}
      </select>
      <span className="mt-1 block text-xs text-ink-soft">
        Fetched from your Google Ads manager account.
      </span>
    </label>
  );
}
