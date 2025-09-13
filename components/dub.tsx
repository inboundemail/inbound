import React from 'react'
import { cn } from '@/lib/utils'

interface DubProps extends React.SVGProps<SVGSVGElement> {
  size?: number
  variant?: 'default' | 'muted' | 'accent'
}

const Dub = React.forwardRef<SVGSVGElement, DubProps>(
  ({ className, size = 24, variant = 'default', ...props }, ref) => {
    const variantStyles = {
      default: 'fill-foreground',
      muted: 'fill-muted-foreground',
      accent: 'fill-primary'
    }

    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(
          'transition-colors duration-200',
          variantStyles[variant],
          className
        )}
        {...props}
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M32 64c17.673 0 32-14.327 32-32 0-11.844-6.435-22.186-16-27.719V48h-8v-2.14A15.9 15.9 0 0 1 32 48c-8.837 0-16-7.163-16-16s7.163-16 16-16c2.914 0 5.647.78 8 2.14V1.008A32 32 0 0 0 32 0C14.327 0 0 14.327 0 32s14.327 32 32 32"
        />
      </svg>
    )
  }
)

Dub.displayName = 'Dub'

export default Dub
