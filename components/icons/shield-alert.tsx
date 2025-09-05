import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function ShieldAlert({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M9.533 1.133L14.783 2.813C15.511 3.046 16 3.716 16 4.48V11.001C16 14.509 11.054 16.38 9.538 16.87C9.362 16.927 9.182 16.955 9 16.955C8.818 16.955 8.637 16.926 8.46 16.869C6.946 16.379 2 14.508 2 11V4.48C2 3.716 2.488 3.046 3.216 2.813L8.467 1.133C8.815 1.022 9.184 1.021 9.533 1.133ZM8 12C8 12.551 8.449 13 9 13C9.551 13 10 12.551 10 12C10 11.449 9.551 11 9 11C8.449 11 8 11.449 8 12ZM9.75 5.75C9.75 5.33579 9.41421 5 9 5C8.58579 5 8.25 5.33579 8.25 5.75V9C8.25 9.41421 8.58579 9.75 9 9.75C9.41421 9.75 9.75 9.41421 9.75 9V5.75Z" fill={fill} fillRule="evenodd"/>
	</g>
</svg>
	);
};

export default ShieldAlert;