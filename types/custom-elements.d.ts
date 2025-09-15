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


// Linkify-it typings shim
declare module 'linkify-it' {
  export default class LinkifyIt {
    constructor(...args: any[])
    match(text: string): Array<{ index: number; lastIndex?: number; raw: string; url: string }> | null
  }
}
