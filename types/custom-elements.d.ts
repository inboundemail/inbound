// Custom elements typings for dotlottie web component
// Allows usage of <dotlottie-player /> in TSX without type errors

declare namespace JSX {
  interface IntrinsicElements {
    "dotlottie-player": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      src?: string
      background?: string
      speed?: number
      loop?: boolean
      autoplay?: boolean
      style?: React.CSSProperties
    }
  }
}


