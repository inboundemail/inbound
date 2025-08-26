import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "appearance-none inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[9px] dark:rounded-xl font-medium relative cursor-pointer select-none touch-manipulation vertical-align-middle border box-border transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          // Light mode
          "bg-[var(--button-primary-bg)] text-white border-none disabled:cursor-default disabled:opacity-60 shadow-[0_-1px_1.25px_0_var(--button-primary-shadow-top)_inset,1px_1.25px_2.3px_0_var(--button-primary-shadow-bottom)_inset] hover:brightness-105 active:brightness-95 focus-visible:ring-primary/50 dark:bg-[#4a0198] dark:text-white dark:shadow-[1px_1.25px_2.3px_0px_inset_rgba(255,255,255,0.1)] dark:hover:bg-[#5201a8] dark:active:bg-[#3e017f]",
        secondary:
          // Light mode
          "bg-[var(--button-secondary-bg)] text-foreground border border-border disabled:cursor-default disabled:opacity-60 hover:bg-accent active:bg-accent/80 focus-visible:ring-primary/50 dark:bg-[#2a0b35] dark:text-white dark:border dark:border-white/10 dark:rounded-[9px] dark:shadow-[1px_1.25px_2.3px_0px_inset_rgba(255,255,255,0.08)] dark:hover:bg-[#321142] dark:active:bg-[#220b2b]",
        outline:
          // Light mode
          "border border-border bg-transparent text-foreground disabled:cursor-default disabled:opacity-60 hover:bg-accent hover:text-accent-foreground active:bg-accent/90 focus-visible:ring-border dark:border dark:border-border dark:bg-background dark:text-foreground dark:shadow-[0_4px_12px_rgba(0,0,0,0.1),inset_0_-1px_0.5px_1px_rgba(0,0,0,0.05),inset_0_1px_0.5px_1px_rgba(255,255,255,0.1)] dark:hover:bg-accent dark:hover:text-accent-foreground dark:active:bg-accent/90",
        ghost:
          "bg-transparent text-foreground disabled:cursor-default shadow-none border-none disabled:opacity-60 hover:bg-accent/50 hover:text-accent-foreground hover:shadow-[0_4px_12px_rgba(0,0,0,0.1),inset_0_-1px_0.5px_1px_rgba(0,0,0,0.05),inset_0_1px_0.5px_1px_rgba(255,255,255,0.1)] active:bg-accent/90 active:shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_2px_rgba(0,0,0,0.1)] focus-visible:ring-accent",
        destructive:
          // Light mode
          "bg-[var(--button-destructive-bg)] text-[var(--badge-destructive-text)] border border-transparent disabled:cursor-default disabled:opacity-60 hover:bg-[rgba(255,237,237,0.9)] active:bg-[rgba(255,237,237,0.8)] focus-visible:ring-destructive/50 dark:bg-[rgba(109,29,29,0.4)] dark:text-[#ffb9ba] dark:border dark:border-white/10 dark:rounded-[9px] dark:shadow-[1px_1.25px_2.3px_0px_inset_rgba(255,255,255,0.08)] dark:hover:bg-[rgba(109,29,29,0.55)] dark:active:bg-[rgba(109,29,29,0.35)]",
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
