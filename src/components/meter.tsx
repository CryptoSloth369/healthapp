/** Horizontal progress meter. Turns the warning color when over target. */
export function Meter({
  value,
  target,
  height = 8,
  label,
}: {
  value: number;
  target: number;
  height?: number;
  label: string;
}) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const over = target > 0 && value > target;
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-border"
      style={{ height }}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={value}
    >
      <div
        className={`h-full rounded-full transition-[width] ${over ? "bg-warn" : "bg-accent"}`}
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  );
}
