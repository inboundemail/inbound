import React from 'react';
import { IconType } from 'react-icons';

interface CustomInboundIconProps {
  /** Size of the icon container in pixels */
  size?: number;
  /** Background color of the rounded container */
  backgroundColor?: string;
  /** React icon component to display (optional if using text) */
  Icon?: IconType;
  /** Text to display (1-2 letters, optional if using Icon) */
  text?: string;
  /** Size of the inner icon relative to container (0-1) */
  iconScale?: number;
  /** Color of the inner icon or text */
  iconColor?: string;
  /** Additional CSS classes */
  className?: string;
}

export const CustomInboundIcon: React.FC<CustomInboundIconProps> = ({
  size = 64,
  backgroundColor = '#A50A3E',
  Icon,
  text,
  iconScale = 0.5,
  iconColor = 'white',
  className = '',
}) => {
  const iconSize = size * iconScale;
  const borderRadius = size * 0.3; // Maintains the rounded rectangle proportion
  
  // Create unique gradient ID for each instance
  const gradientId = `icon-gradient-${Math.random().toString(36).substr(2, 9)}`;
  
  // Calculate font size based on container size
  const fontSize = size * 0.4; // Adjust this ratio as needed

  return (
    <div
      className={`inline-flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor,
        borderRadius,
        // Add subtle gradient overlay like the original
        background: `linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 100%), ${backgroundColor}`,
        // Add subtle shadow for depth
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      {Icon ? (
        // Render icon
        <svg width={iconSize} height={iconSize} style={{ 
          filter: 'drop-shadow(0px 174.83px 349.66px rgba(23, 7, 11, 0.5))'
        }}>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#F5F3FF" stopOpacity="1" />
              <stop offset="100%" stopColor="#F5F3FF" stopOpacity="0.7" />
            </linearGradient>
          </defs>
          <foreignObject width={iconSize} height={iconSize}>
            <div style={{ 
              width: iconSize, 
              height: iconSize, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: `url(#${gradientId})`
            }}>
              <Icon
                size={iconSize}
                style={{ 
                  fill: `url(#${gradientId})`,
                  color: `url(#${gradientId})`
                }}
              />
            </div>
          </foreignObject>
        </svg>
      ) : text ? (
        // Render text
        <span
          style={{
            fontSize: fontSize,
            fontWeight: 'bold',
            color: iconColor,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            textShadow: '0 1px 2px rgba(0,0,0,0.1)',
          }}
        >
          {text.slice(0, 2)}
        </span>
      ) : null}
    </div>
  );
};

export default CustomInboundIcon;
