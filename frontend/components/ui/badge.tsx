import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-primary/10 text-primary",
        secondary:
          "border border-transparent bg-muted text-muted-foreground",
        outline:
          "border border-border text-foreground",
        success:
          "border border-transparent bg-success/15 text-success",
        warning:
          "border border-transparent bg-warning/15 text-warning",
        destructive:
          "border border-transparent bg-destructive/15 text-destructive",
        accent:
          "border border-transparent bg-accent/25 text-accent-foreground",
        // For dark-section pills
        onDark:
          "border border-white/15 bg-white/[0.06] text-white/85 backdrop-blur",
        // Stream lifecycle / verdict states — locked palette,
        // see docs/UI_DESIGN_DECISIONS.md
        active:
          "border border-transparent bg-primary/10 text-primary",
        paused:
          "border border-transparent bg-state-paused-bg text-state-paused dark:bg-state-paused/15",
        inconclusive:
          "border border-transparent bg-state-inconclusive-bg text-state-inconclusive dark:bg-state-inconclusive/15",
        completed:
          "border border-transparent bg-state-completed-bg text-state-completed dark:bg-state-completed/15",
        cancelled:
          "border border-transparent bg-state-cancelled-bg text-state-cancelled dark:bg-state-cancelled/15",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
