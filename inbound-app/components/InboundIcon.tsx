import * as React from "react";

interface InboundIconProps extends React.SVGProps<SVGSVGElement> {
  variant?: "white" | "black";
}

const InboundIcon = ({ variant = "white", className, ...props }: InboundIconProps) => (
  <svg width="250" height="250" viewBox="0 0 250 250" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <rect x="10.8333" y="10.8333" width="228.333" height="228.333" rx="39.1667" stroke="#6C47FF" strokeWidth="21.6667" />
    <path d="M83.3088 67.1993C85.7623 64.5105 89.0899 63 92.5596 63H125.266V161.901C122.682 161.901 120.155 161.062 118.005 159.49L82.4206 133.468C81.5208 132.818 80.7813 131.935 80.2678 130.897C79.7542 129.859 79.4826 128.699 79.4771 127.518V77.3373C79.4771 73.5348 80.8554 69.8881 83.3088 67.1993Z" fill="#6C47FF" />
    <path d="M167.223 67.271C164.77 64.5822 161.442 63.0717 157.972 63.0717H125.266V161.972C127.85 161.972 130.377 161.134 132.527 159.562L168.111 133.539C169.011 132.89 169.751 132.007 170.264 130.969C170.778 129.931 171.049 128.77 171.055 127.59V77.409C171.055 73.6065 169.677 69.9598 167.223 67.271Z" fill="#6C47FF" />
    <g filter="url(#filter0_d_112_135)">
      <path d="M191.532 116.638V174.356C191.532 177.71 190.136 180.926 187.65 183.297C185.165 185.668 181.794 187 178.279 187H72.2533C68.7383 187 65.3673 185.668 62.8818 183.297C60.3964 180.926 59.0001 177.71 59.0001 174.356V116.638C58.9925 114.345 59.6383 112.094 60.8683 110.125C62.0984 108.156 63.8664 106.543 65.9833 105.459C68.1002 104.374 70.4863 103.859 72.8863 103.969C75.2864 104.078 77.61 104.808 79.6088 106.08L125.266 135.161L170.923 106.08C172.922 104.808 175.246 104.078 177.646 103.969C180.046 103.859 182.432 104.374 184.549 105.459C186.666 106.543 188.434 108.156 189.664 110.125C190.894 112.094 191.54 114.345 191.532 116.638Z" fill={variant === "white" ? "white" : "black"} />
    </g>
    <defs>
      <filter id="filter0_d_112_135" x="57.8624" y="103.954" width="134.807" height="85.3211" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
        <feOffset dy="1.13761" />
        <feGaussianBlur stdDeviation="0.568807" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_112_135" />
        <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_112_135" result="shape" />
      </filter>
    </defs>
  </svg>

);
export default InboundIcon;
