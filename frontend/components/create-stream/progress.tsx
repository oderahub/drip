"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { num: 1, label: "Stream" },
  { num: 2, label: "Policy" },
  { num: 3, label: "Review" },
] as const;

export function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center gap-3 sm:gap-4">
        {STEPS.map((s, i) => {
          const done = current > s.num;
          const active = current === s.num;
          return (
            <li key={s.num} className="flex flex-1 items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2">
                <span
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary bg-primary/10 text-primary",
                    !done && !active && "border-border text-muted-foreground"
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : s.num}
                </span>
                <span
                  className={cn(
                    "text-sm font-medium",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "hidden h-px flex-1 sm:inline-block",
                    done ? "bg-primary/40" : "bg-border"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
