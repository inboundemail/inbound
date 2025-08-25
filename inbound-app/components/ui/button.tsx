import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "appearance-none inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium relative cursor-pointer select-none touch-manipulation vertical-align-middle border box-border transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-[#4a0198] text-white disabled:cursor-default border-none disabled:opacity-60 shadow-[1px_1.25px_2.3px_0px_inset_rgba(255,255,255,0.1)] hover:bg-[#5201a8] active:bg-[#3e017f] focus-visible:ring-primary/50",
        secondary:
          "bg-[#2a0b35] text-white border border-white/10 rounded-[9px] disabled:cursor-default disabled:opacity-60 shadow-[1px_1.25px_2.3px_0px_inset_rgba(255,255,255,0.08)] hover:bg-[#321142] active:bg-[#220b2b] focus-visible:ring-primary/50",
        outline:
          "border border-border bg-background text-foreground disabled:cursor-default shadow-[0_4px_12px_rgba(0,0,0,0.1),inset_0_-1px_0.5px_1px_rgba(0,0,0,0.05),inset_0_1px_0.5px_1px_rgba(255,255,255,0.1)] disabled:opacity-60 hover:bg-accent hover:text-accent-foreground hover:shadow-[0_6px_16px_rgba(0,0,0,0.15),inset_0_-1px_0.5px_1px_rgba(0,0,0,0.05),inset_0_1px_0.5px_1px_rgba(255,255,255,0.1)] active:bg-accent/90 active:shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_2px_rgba(0,0,0,0.15)] focus-visible:ring-border",
        ghost:
          "bg-transparent text-foreground disabled:cursor-default shadow-none border-none disabled:opacity-60 hover:bg-accent/50 hover:text-accent-foreground hover:shadow-[0_4px_12px_rgba(0,0,0,0.1),inset_0_-1px_0.5px_1px_rgba(0,0,0,0.05),inset_0_1px_0.5px_1px_rgba(255,255,255,0.1)] active:bg-accent/90 active:shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_2px_rgba(0,0,0,0.1)] focus-visible:ring-accent",
        destructive:
          "bg-[rgba(109,29,29,0.4)] text-[#ffb9ba] border border-white/10 rounded-[9px] disabled:cursor-default disabled:opacity-60 shadow-[1px_1.25px_2.3px_0px_inset_rgba(255,255,255,0.08)] hover:bg-[rgba(109,29,29,0.55)] active:bg-[rgba(109,29,29,0.35)] focus-visible:ring-destructive/50",
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
