import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string | undefined;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-2xl border border-border bg-card px-3.5 py-2 text-sm font-medium",
          "placeholder:text-muted-foreground/70 placeholder:font-normal",
          "transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          error && "border-destructive/60 focus-visible:ring-destructive/40",
          className
        )}
        aria-invalid={error ? true : undefined}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
