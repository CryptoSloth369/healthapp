"use client";

/** 1–5 segmented radio group. Tapping the selected value again clears it (when optional). */
export function ScalePicker({
  name,
  labels,
  value,
  onChange,
  required = false,
  legend,
}: {
  name: string;
  labels: Record<number, string>;
  value: number | null;
  onChange: (v: number | null) => void;
  required?: boolean;
  legend: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm text-muted">
        {legend}
        {!required && <span className="text-xs"> (optional)</span>}
      </legend>
      <input type="hidden" name={name} value={value ?? ""} />
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={legend}>
        {[1, 2, 3, 4, 5].map((v) => {
          const on = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(on && !required ? null : v)}
              className={`flex flex-col items-center rounded-xl border px-1 py-2 transition ${
                on ? "border-accent bg-accent/15 text-foreground" : "border-border text-muted"
              }`}
            >
              <span className="text-lg font-semibold">{v}</span>
              <span className="text-[11px] leading-tight">{labels[v]}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
