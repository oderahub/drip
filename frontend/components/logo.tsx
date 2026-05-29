import { cn } from "@/lib/utils";

/**
 * Drip wordmark.
 *
 * The "i" is replaced by a small emerald droplet — the only place we
 * use a visual metaphor for the brand. The rest of the mark relies on
 * typography only, kept understated like arcpay's.
 */
export function Logo({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-3xl",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-semibold tracking-tight",
        sizes[size],
        className
      )}
    >
      <span>Dr</span>
      <Droplet
        className={cn(
          "mx-[0.04em] inline-block translate-y-[0.06em]",
          size === "sm" && "h-3.5 w-3.5",
          size === "md" && "h-4 w-4",
          size === "lg" && "h-6 w-6"
        )}
      />
      <span>p</span>
    </span>
  );
}

function Droplet({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3.5c-1.6 2.6-6 7.5-6 11.5a6 6 0 1 0 12 0c0-4-4.4-8.9-6-11.5Z"
        fill="hsl(var(--primary))"
      />
      <circle cx="14.3" cy="12.5" r="1.8" fill="white" fillOpacity=".35" />
    </svg>
  );
}
