import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "appearance-none inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium relative cursor-pointer select-none touch-manipulation vertical-align-middle border box-border transition-all duration-200 ease-out focus-visible:outline-none disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-[#8466ff] to-[#6C47FF] text-white disabled:cursor-default shadow-[0_4px_12px_rgba(0,0,0,0.3),inset_0_-1px_0.5px_1px_rgba(40,27,93,0.15),inset_0_1px_0.5px_1px_rgba(255,255,255,0.2)] border-none disabled:opacity-60 hover:from-[#7557ff] hover:to-[#5d3eff] active:from-[#6647ff] active:to-[#4e35ff] active:shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_2px_rgba(40,27,93,0.3)]",
        secondary:
          "bg-gradient-to-b from-slate-100 to-slate-200 text-slate-700 disabled:cursor-default shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_-1px_0.5px_1px_rgba(0,0,0,0.05),inset_0_1px_0.5px_1px_rgba(255,255,255,0.8)] border-none disabled:opacity-60 hover:from-slate-200 hover:to-slate-300 active:from-slate-300 active:to-slate-400 active:shadow-[0_1px_4px_rgba(0,0,0,0.15),inset_0_1px_2px_rgba(0,0,0,0.1)]",
        outline:
          "bg-gradient-to-b from-white to-gray-50 text-slate-700 disabled:cursor-default shadow-[0_2px_8px_rgba(0,0,0,0.08),inset_0_-1px_0.5px_1px_rgba(0,0,0,0.03),inset_0_1px_0.5px_1px_rgba(255,255,255,0.9)] border-none disabled:opacity-60 hover:from-gray-50 hover:to-gray-100 hover:text-slate-800 active:from-gray-100 active:to-gray-200 active:shadow-[0_1px_4px_rgba(0,0,0,0.12),inset_0_1px_2px_rgba(0,0,0,0.08)]",
        ghost:
          "bg-transparent text-slate-600 disabled:cursor-default shadow-none border-none disabled:opacity-60 hover:bg-gradient-to-b hover:from-slate-100 hover:to-slate-150 hover:text-slate-700 hover:shadow-[0_1px_4px_rgba(0,0,0,0.05)] active:bg-gradient-to-b active:from-slate-200 active:to-slate-250 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]",
        destructive:
          "bg-gradient-to-b from-red-500 to-red-600 text-white disabled:cursor-default shadow-[0_4px_12px_rgba(220,38,38,0.3),inset_0_-1px_0.5px_1px_rgba(153,27,27,0.15),inset_0_1px_0.5px_1px_rgba(255,255,255,0.2)] border-none disabled:opacity-60 hover:from-red-600 hover:to-red-700 active:from-red-700 active:to-red-800 active:shadow-[0_2px_8px_rgba(220,38,38,0.4),inset_0_1px_2px_rgba(153,27,27,0.3)]",
      },
      size: {
        default: "text-sm leading-5 px-4 py-2",
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