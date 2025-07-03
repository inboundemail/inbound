import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "appearance-none inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium relative cursor-pointer select-none touch-manipulation vertical-align-middle border box-border transition-all duration-200 ease-out focus-visible:outline-none disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-[#6C47FF] text-white border-[rgba(27,31,35,0.15)] shadow-[rgba(27,31,35,0.1)_0_1px_0] font-semibold hover:bg-[#6341f2] hover:scale-[1.02] hover:shadow-[rgba(108,71,255,0.3)_0_4px_12px] focus:shadow-[rgba(108,71,255,0.4)_0_0_0_3px] focus:outline-none active:bg-[#5a3de6] active:scale-[0.98] active:shadow-[rgba(20,70,32,0.2)_0_1px_0_inset] disabled:bg-[#b3a3ff] disabled:border-[rgba(27,31,35,0.1)] disabled:text-[rgba(255,255,255,0.8)] disabled:cursor-default",
        secondary:
          "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-200 active:bg-gray-100 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-default",
        destructive:
          "bg-[#dc2626] text-white border-[rgba(27,31,35,0.15)] shadow-[rgba(27,31,35,0.1)_0_1px_0] font-semibold hover:bg-[#c82222] focus:shadow-[rgba(220,38,38,0.4)_0_0_0_3px] focus:outline-none active:bg-[#b41e1e] active:shadow-[rgba(20,70,32,0.2)_0_1px_0_inset] disabled:bg-[#f88383] disabled:border-[rgba(27,31,35,0.1)] disabled:text-[rgba(255,255,255,0.8)] disabled:cursor-default",
        ghost:
          "bg-transparent text-[#24292E] border-none shadow-none font-medium hover:bg-[#F3F4F6] hover:text-[#586069] hover:transition-duration-100 active:bg-[#EDEFF2] active:shadow-[rgba(225,228,232,0.2)_0_1px_0_inset] active:transition-none disabled:bg-[#FAFBFC] disabled:border-[rgba(27,31,35,0.15)] disabled:text-[#959DA5] disabled:cursor-default",
      },
      size: {
        default: "text-sm leading-5 px-4 py-1.5",
        sm: "text-xs leading-4 px-3 py-1",
        lg: "text-base leading-6 px-6 py-2",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
