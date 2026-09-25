/**
 * The one text field every form uses: sign-in, invitations, new agencies and
 * new clients. Three pages used to carry their own copy of it.
 */
export function Field({
  label,
  value,
  onChange,
  type = "text",
  required = true,
  placeholder,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl bg-surface px-3.5 py-2.5 text-sm text-ink ring-1 ring-line transition placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      />
      {hint ? <span className="mt-1 block break-words text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}
