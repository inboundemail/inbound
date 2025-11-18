"use client";

export function TrustedBy() {
  return (
    <section className="py-12 border-b border-border/50">
      <div className="container px-4 mx-auto">
        <p className="text-center text-sm font-medium text-muted-foreground mb-8">
          TRUSTED BY INNOVATIVE TEAMS
        </p>
        <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-8 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
          {/* Neon */}
          <div className="flex items-center gap-2">
            <svg
              width="24"
              height="24"
              viewBox="0 0 58 57"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-foreground"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M0 9.82759C0 4.39996 4.47705 0 9.99976 0H47.9989C53.5216 0 57.9986 4.39996 57.9986 9.82759V41.5893C57.9986 47.2045 50.7684 49.6414 47.2618 45.2082L36.2991 31.3488V48.1552C36.2991 53.04 32.2698 57 27.2993 57H9.99976C4.47705 57 0 52.6 0 47.1724V9.82759ZM9.99976 7.86207C8.89522 7.86207 7.99981 8.74206 7.99981 9.82759V47.1724C7.99981 48.2579 8.89522 49.1379 9.99976 49.1379H27.5993C28.1516 49.1379 28.2993 48.6979 28.2993 48.1552V25.6178C28.2993 20.0027 35.5295 17.5656 39.0361 21.9989L49.9988 35.8583V9.82759C49.9988 8.74206 50.1034 7.86207 48.9988 7.86207H9.99976Z"
                fill="currentColor"
              />
              <path
                d="M48.0003 0C53.523 0 58 4.39996 58 9.82759V41.5893C58 47.2045 50.7699 49.6414 47.2633 45.2082L36.3006 31.3488V48.1552C36.3006 53.04 32.2712 57 27.3008 57C27.8531 57 28.3008 56.56 28.3008 56.0172V25.6178C28.3008 20.0027 35.5309 17.5656 39.0375 21.9989L50.0002 35.8583V1.96552C50.0002 0.879992 49.1048 0 48.0003 0Z"
                fill="currentColor"
              />
            </svg>
            <span className="font-bold text-xl tracking-tight">neon</span>
          </div>

          {/* Churchspace */}
          <div className="flex items-center gap-2">
            <svg
              height="24"
              width="24"
              viewBox="0 0 185 291"
              xmlns="http://www.w3.org/2000/svg"
              className="text-foreground"
            >
              <g fill="none">
                <path
                  d="M142.177 23.3423H173.437C179.612 23.3423 184.617 28.3479 184.617 34.5227V258.318C184.617 264.493 179.612 269.498 173.437 269.498H142.177V23.3423Z"
                  fill="currentColor"
                ></path>
                <path
                  d="M0 57.5604C0 52.8443 2.9699 48.6392 7.41455 47.0622L125.19 5.27404C132.441 2.70142 140.054 8.07871 140.054 15.7722V275.171C140.054 282.801 132.557 288.172 125.332 285.718L7.55682 245.715C3.03886 244.18 0 239.939 0 235.167V57.5604Z"
                  fill="currentColor"
                ></path>
              </g>
            </svg>
            <span className="font-bold text-xl tracking-tight">churchspace</span>
          </div>

          {/* Agentuity */}
          <div className="flex items-center gap-2 opacity-80">
            <img src="/images/agentuity.png" alt="Agentuity logo" className="h-6 w-auto grayscale" />
          </div>
        </div>
      </div>
    </section>
  );
}

