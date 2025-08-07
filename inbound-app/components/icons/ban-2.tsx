import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Ban2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="12" width="12" {...props} viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<rect height="1.5" width="10.499" fill={secondaryfill} strokeWidth="0" transform="translate(-2.485 6) rotate(-45)" x=".751" y="5.25"/>
		<path d="m6,12c-3.309,0-6-2.691-6-6S2.691,0,6,0s6,2.691,6,6-2.691,6-6,6Zm0-10.5C3.519,1.5,1.5,3.519,1.5,6s2.019,4.5,4.5,4.5,4.5-2.019,4.5-4.5S8.481,1.5,6,1.5Z" fill={fill} strokeWidth="0"/>
	</g>
</svg>
	);
};

export default Ban2;