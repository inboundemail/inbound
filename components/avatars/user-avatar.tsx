"use client"
import * as React from "react"

type UserAvatarProps = {
  name?: string
  email?: string
  width?: number
  height?: number
  className?: string
}

function hashString(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    // djb2
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return hash >>> 0
}

const BASE_COLORS = [
  "#4762EB",
  "#6C47FF",
  "#4A0198",
  "#0FA3B1",
  "#FF6A00",
  "#0EA5E9",
  "#EF4444",
  "#10B981",
]

export default function UserAvatar({
  name,
  email,
  width = 32,
  height = 32,
  className,
}: UserAvatarProps) {
  const seed = (email || name || "user").toLowerCase()
  const hash = React.useMemo(() => hashString(seed), [seed])
  const base = BASE_COLORS[hash % BASE_COLORS.length]

  // ensure unique ids per instance to avoid collisions
  const uid = React.useMemo(() => `ua_${hash.toString(36)}` as const, [hash])
  const filter0 = `${uid}_f0`
  const filter1 = `${uid}_f1`
  const mask0 = `${uid}_m0`
  const clip0 = `${uid}_c0`

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 35 34"
      className={className}
      aria-hidden
    >
      <g clipPath={`url(#${clip0})`}>
        <mask id={mask0} style={{ maskType: "luminance" as const }} maskUnits="userSpaceOnUse" x="0" y="0" width="35" height="34">
          <path d="M34.5332 0H0.533203V34H34.5332V0Z" fill="#fff" />
        </mask>
        <g mask={`url(#${mask0})`}>
          <path d="M34.5332 0H0.533203V34H34.5332V0Z" fill={base} />
          <g style={{ mixBlendMode: "screen" as const }} opacity="0.6" filter={`url(#${filter0})`}>
            <path d="M68.7548 17.3888L36.2996 54.7243L27.8317 47.3633L31.4019 16.0483L31.1453 15.8253L14.1036 35.4296L4.01913 26.6634L36.4744 -10.6721L45.0705 -3.19961L41.3396 27.8856L41.6475 28.1533L58.6447 8.60027L68.7548 17.3888Z" fill="white" />
          </g>
          <g style={{ mixBlendMode: "screen" as const }} opacity="0.6" filter={`url(#${filter1})`}>
            <path d="M44.7886 25.819L48.5098 36.0428L8.09359 50.7531L4.37241 40.5293L18.3663 35.4359L5.14449 -0.890725L17.6048 -5.42591L30.8383 30.9327L44.7886 25.819Z" fill="white" />
          </g>
        </g>
      </g>
      <defs>
        <filter id={filter0} x="-27.981" y="-42.6721" width="128.736" height="129.396" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="16" result="effect1_foregroundBlur" />
        </filter>
        <filter id={filter1} x="-27.6277" y="-37.4259" width="108.137" height="120.179" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="16" result="effect1_foregroundBlur" />
        </filter>
        <clipPath id={clip0}>
          <rect x="0.533203" width="34" height="34" rx="6" fill="white" />
        </clipPath>
      </defs>
    </svg>
  )
}


