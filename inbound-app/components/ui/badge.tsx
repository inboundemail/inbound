import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-[10px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-[var(--badge-default-border)] bg-[var(--badge-default-bg)] text-[var(--badge-default-text)]",
        secondary:
          "border-[var(--badge-secondary-border)] bg-[var(--badge-secondary-bg)] text-[var(--badge-secondary-text)]",
        destructive:
          "border-[var(--badge-destructive-border)] bg-[var(--badge-destructive-bg)] text-[var(--badge-destructive-text)]",
        outline:
          "border-[var(--badge-outline-border)] bg-[var(--badge-outline-bg)] text-[var(--badge-outline-text)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
