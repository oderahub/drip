import * as React from "react";
import { cn } from "@/lib/utils";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  optional?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, optional, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "inline-flex items-center gap-2 text-sm font-medium text-foreground",
        className
      )}
      {...props}
    >
      <span>{children}</span>
      {optional && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
          optional
        </span>
      )}
    </label>
  )
);
Label.displayName = "Label";
