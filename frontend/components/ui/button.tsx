import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        // Primary — emerald, soft glow on hover
        default:
          "bg-primary text-primary-foreground hover:bg-primary/92 active:scale-[0.985] shadow-sm hover:shadow-md hover:ring-glow-primary",
        // Outline on light, ghost-feeling on dark
        outline:
          "border border-border bg-card text-foreground hover:bg-muted/60 active:scale-[0.985]",
        // For destructive actions (cancel stream, disable policy)
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.985] shadow-sm",
        // Subtle, inline
        ghost:
          "text-foreground hover:bg-muted/60 active:scale-[0.985]",
        // Looks like a link
        link:
          "text-primary underline-offset-4 hover:underline",
        // For the dark-section CTAs ("Connect wallet" on the dark band)
        onDark:
          "bg-white text-foreground hover:bg-white/92 active:scale-[0.985] shadow-sm",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3.5 text-xs",
        lg: "h-12 px-7 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
