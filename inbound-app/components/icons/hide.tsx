import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Hide({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="24" width="24" {...props} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill} strokeLinecap="butt" strokeLinejoin="miter">
		<path d="m6.07,17.93c-3.226-2.37-4.945-5.93-4.945-5.93,0,0,3.864-8,10.875-8,2.334,0,4.32.887,5.93,2.07" fill="none" stroke={fill} strokeMiterlimit="10" strokeWidth="2"/>
		<path d="m20.804,8.853c1.362,1.678,2.071,3.147,2.071,3.147,0,0-3.865,8-10.875,8-.734,0-1.434-.088-2.098-.245" fill="none" stroke={fill} strokeLinecap="square" strokeMiterlimit="10" strokeWidth="2"/>
		<circle cx="12" cy="12" fill={secondaryfill} r="3" stroke={secondaryfill} strokeLinecap="square" strokeMiterlimit="10" strokeWidth="2"/>
		<line fill="none" stroke={secondaryfill} strokeLinecap="square" strokeMiterlimit="10" strokeWidth="2" x1="22" x2="2" y1="2" y2="22"/>
	</g>
</svg>
	);
};

export default Hide;