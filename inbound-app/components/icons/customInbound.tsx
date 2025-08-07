import React from 'react';

interface CustomInboundIconProps {
  /** Size of the icon container in pixels */
  size?: number;
  /** Background color of the rounded container */
  backgroundColor?: string;
  /** React icon component to display (optional if using text) */
  Icon?: React.ComponentType<{ width: string | number; height: string | number; className?: string; style?: React.CSSProperties }>;
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
        // Render icon with Nucleo-compatible props
        <Icon
          width={iconSize}
          height={iconSize}
          style={{ 
            color: iconColor,
            filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.1))'
          }}
        />
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
