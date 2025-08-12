import React from 'react';

interface ConnectingArrowProps {
  color?: string;
  className?: string;
  width?: number;
  height?: number;
}

export const ConnectingArrow: React.FC<ConnectingArrowProps> = ({ 
  color = '#8b5cf6', 
  className = '',
  width = 120,
  height = 120
}) => {
  return (
    <svg 
      width={width} 
      height={height} 
      viewBox="0 0 156.7668770458763 167.43399801843407" 
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g strokeLinecap="round">
        <g transform="translate(144.36022763163783 11.82220421051602) rotate(0 -66.6368711439195 72.85935176011446)">
          <path 
            d="M0.08 -0.51 C-1.82 15.94, 10.77 73.72, -11.64 97.93 C-34.04 122.15, -114.06 136.83, -134.36 144.78 M-1.34 -1.82 C-2.85 14.87, 12.32 74.77, -9.46 99.34 C-31.24 123.91, -111.39 137.7, -132.04 145.61" 
            stroke={color} 
            strokeWidth="3" 
            fill="none"
          />
        </g>
        <g transform="translate(144.36022763163783 11.82220421051602) rotate(0 -66.6368711439195 72.85935176011446)">
          <path 
            d="M-111.73 131.03 C-118.34 133.42, -123.59 137.37, -132.04 145.61 M-111.73 131.03 C-115.86 134.66, -121.77 136.92, -132.04 145.61" 
            stroke={color} 
            strokeWidth="3" 
            fill="none"
          />
        </g>
        <g transform="translate(144.36022763163783 11.82220421051602) rotate(0 -66.6368711439195 72.85935176011446)">
          <path 
            d="M-107.11 147.49 C-114.91 145.29, -121.44 144.65, -132.04 145.61 M-107.11 147.49 C-112.24 147.47, -119.18 146.07, -132.04 145.61" 
            stroke={color} 
            strokeWidth="3" 
            fill="none"
          />
        </g>
      </g>
    </svg>
  );
};

export default ConnectingArrow;
