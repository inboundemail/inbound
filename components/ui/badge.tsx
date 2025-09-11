import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-[10px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-(--badge-default-border) bg-(--badge-default-bg) text-(--badge-default-text)",
        secondary:
          "border-(--badge-secondary-border) bg-(--badge-secondary-bg) text-(--badge-secondary-text)",
        destructive:
          "border-(--badge-destructive-border) bg-(--badge-destructive-bg) text-(--badge-destructive-text)",
        outline:
          "border-(--badge-outline-border) bg-(--badge-outline-bg) text-(--badge-outline-text)",
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
