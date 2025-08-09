import * as React from "react";

interface InboundIconProps extends React.SVGProps<SVGSVGElement> {
  variant?: "white" | "black";
}

const InboundIcon = ({ variant = "white", className, ...props }: InboundIconProps) => (
  <svg width="250" height="250" viewBox="0 0 316 316" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <rect x="0.822754" y="0.797363" width="315.142" height="315.142" rx="94.5428" fill="#6C47FF" />
    <rect x="0.822754" y="0.797363" width="315.142" height="315.142" rx="94.5428" fill="url(#paint0_linear_206_6)" fillOpacity="0.15" />
    <rect x="1.26015" y="1.23476" width="314.268" height="314.268" rx="94.1054" stroke="url(#paint1_linear_206_6)" strokeOpacity="0.12" strokeWidth="0.874784" />
    <g filter="url(#filter0_d_206_6)">
      <path d="M104.985 84.4141C108.128 80.9697 112.39 79.0346 116.835 79.0346H158.734V162.212C155.424 162.212 152.187 161.137 149.433 159.124L104.202 130.542C103.049 129.71 102.102 128.579 101.444 127.25C100.786 125.92 100.438 124.433 100.431 122.92L100.076 97.4016C100.076 92.5303 101.841 87.8586 104.985 84.4141Z" fill="url(#paint2_linear_206_6)" />
      <path d="M212.484 84.4142C209.341 80.9698 205.078 79.0347 200.634 79.0347L158.734 79.0346V162.212C162.045 162.212 165.282 161.137 168.036 159.124L213.977 130.542C215.13 129.711 216.077 128.58 216.735 127.25C217.393 125.92 217.741 124.433 217.748 122.92L217.393 97.4017C217.393 92.5305 215.627 87.8587 212.484 84.4142Z" fill="url(#paint3_linear_206_6)" />
      <g filter="url(#filter1_d_206_6)">
        <path d="M243.625 147.656V221.598C243.625 225.894 241.837 230.014 238.653 233.051C235.469 236.089 231.15 237.795 226.647 237.795H90.8213C86.3184 237.795 81.9999 236.089 78.8159 233.051C75.6319 230.014 73.8431 225.894 73.8431 221.598V147.656C73.8334 144.72 74.6607 141.836 76.2365 139.314C77.8122 136.791 80.0772 134.724 82.7891 133.335C85.501 131.946 88.5577 131.286 91.6323 131.426C94.7069 131.567 97.6837 132.502 100.244 134.132L151.164 166.564C155.782 169.505 161.686 169.505 166.305 166.564L217.224 134.132C219.785 132.502 222.762 131.567 225.836 131.426C228.911 131.286 231.968 131.946 234.679 133.335C237.391 134.724 239.656 136.791 241.232 139.314C242.808 141.836 243.635 144.72 243.625 147.656Z" fill="url(#paint4_linear_206_6)" shapeRendering="crispEdges" />
      </g>
    </g>
    <defs>
      <filter id="filter0_d_206_6" x="39.6457" y="61.936" width="238.177" height="227.155" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
        <feOffset dy="17.0987" />
        <feGaussianBlur stdDeviation="17.0987" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix type="matrix" values="0 0 0 0 0.0891864 0 0 0 0 0.0267151 0 0 0 0 0.0443126 0 0 0 0.5 0" />
        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_206_6" />
        <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_206_6" result="shape" />
      </filter>
      <filter id="filter1_d_206_6" x="72.3857" y="131.408" width="172.697" height="109.302" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
        <feOffset dy="1.45736" />
        <feGaussianBlur stdDeviation="0.72868" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_206_6" />
        <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_206_6" result="shape" />
      </filter>
      <linearGradient id="paint0_linear_206_6" x1="158.394" y1="0.797363" x2="158.394" y2="315.94" gradientUnits="userSpaceOnUse">
        <stop stopColor="white" />
        <stop offset="1" stopColor="white" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="paint1_linear_206_6" x1="158.394" y1="0.797363" x2="158.394" y2="315.94" gradientUnits="userSpaceOnUse">
        <stop stopColor="white" />
        <stop offset="1" stopColor="white" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="paint2_linear_206_6" x1="158.912" y1="78.9427" x2="158.912" y2="162.212" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F5F3FF" />
        <stop offset="1" stopColor="#F5F3FF" stopOpacity="0.7" />
      </linearGradient>
      <linearGradient id="paint3_linear_206_6" x1="158.912" y1="78.9427" x2="158.912" y2="162.212" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F5F3FF" />
        <stop offset="1" stopColor="#F5F3FF" stopOpacity="0.7" />
      </linearGradient>
      <linearGradient id="paint4_linear_206_6" x1="158.734" y1="131.408" x2="158.734" y2="237.795" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F5F3FF" />
        <stop offset="1" stopColor="#F5F3FF" stopOpacity="0.7" />
      </linearGradient>
    </defs>
  </svg>


);
export default InboundIcon;
