"use client";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import Copy2 from "@/components/icons/copy-2";
import Check2 from "@/components/icons/check-2";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight, vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

const codeBlockVariants = cva(
  "relative w-full self-stretch flex items-center gap-2.5 text-xs font-mono border border-border bg-card rounded-md overflow-x-auto",
  {
    variants: {
      variant: {
        default: "",
        subtle: "bg-muted/30",
        ghost: "bg-transparent",
      },
      size: {
        sm: "p-2",
        md: "p-3",
        lg: "p-5",
      },
      wrap: {
        false: "whitespace-pre",
        true: "whitespace-pre-wrap",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
      wrap: false,
    },
  }
);

export interface CodeBlockProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof codeBlockVariants> {
  code: string;
  language?: string;
  copy?: boolean;
  syntaxHighlighting?: boolean;
}

export const CodeBlock = React.forwardRef<HTMLDivElement, CodeBlockProps>(
  (
    { code, language, variant, size, wrap, copy = true, syntaxHighlighting = false, className, ...props },
    ref
  ) => {
    const [copied, setCopied] = React.useState(false);
    const [isDark, setIsDark] = React.useState(false);

    React.useEffect(() => {
      try {
        const d = document.documentElement;
        const check = () => setIsDark(d.classList.contains("dark"));
        check();
        const observer = new MutationObserver(check);
        observer.observe(d, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
      } catch {
        // no-op
      }
    }, []);

    const handleCopy = React.useCallback(async () => {
      try {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      } catch {
        // no-op fallback
      }
    }, [code]);

    const codeContent = (
      syntaxHighlighting ? (
        <SyntaxHighlighter
          language={language}
          style={isDark ? vscDarkPlus : oneLight}
          customStyle={{
            margin: 0,
            background: "transparent",
            padding: 0,
          }}
          codeTagProps={{
            style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }
          }}
          PreTag={(props) => (
            <pre {...props} className={cn("m-0 flex-1 overflow-x-auto", wrap ? "whitespace-pre-wrap" : "whitespace-pre")} />
          )}
        >
          {code}
        </SyntaxHighlighter>
      ) : (
        <pre className={cn("m-0 flex-1 overflow-x-auto text-foreground/60", wrap ? "whitespace-pre-wrap" : "whitespace-pre") }>
          <code data-language={language}>{code}</code>
        </pre>
      )
    );

    return (
      <div
        ref={ref}
        className={cn(codeBlockVariants({ variant, size, wrap }), className)}
        {...props}
      >
        {codeContent}
        {copy && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy code"}
            title={copied ? "Copied" : "Copy"}
            className="shrink-0 p-0 m-0 bg-transparent border-0 text-foreground/60 hover:text-foreground transition-colors"
          >
            {copied ? (
              <Check2 width="14" height="14" />
            ) : (
              <Copy2 width="14" height="14" />
            )}
          </button>
        )}
      </div>
    );
  }
);

CodeBlock.displayName = "CodeBlock";


