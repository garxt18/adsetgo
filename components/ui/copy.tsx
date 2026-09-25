"use client";

import { useState, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";

/**
 * A button that copies text and then says so.
 *
 * Each one keeps its own "Copied" state, so a table of rows needs no record of
 * which row was clicked. `text` may be a function, read on click: anything
 * built from window.location must be, since the server has no window and
 * reading it while rendering is a hydration mismatch.
 */
export function CopyButton({
  text,
  label,
  copiedLabel = "Copied",
  ...props
}: {
  text: string | (() => string);
  label: string;
  copiedLabel?: string;
} & Omit<ComponentProps<typeof Button>, "onClick" | "children">) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      {...props}
      onClick={() => {
        navigator.clipboard.writeText(typeof text === "function" ? text() : text);
        setCopied(true);
      }}
    >
      {copied ? copiedLabel : label}
    </Button>
  );
}

/** A link shown in full, so it can be checked before it is sent, with a copy button. */
export function CopyField({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(event) => event.target.select()}
        className="w-full rounded-xl bg-surface-sunken px-3 py-2.5 text-sm text-ink ring-1 ring-line"
      />
      <CopyButton text={value} label="Copy" />
    </div>
  );
}
