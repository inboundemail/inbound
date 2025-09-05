import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function View({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="24" width="24" {...props} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill} strokeLinecap="butt" strokeLinejoin="miter">
		<circle cx="12" cy="12" fill={secondaryfill} r="3" stroke={secondaryfill} strokeLinecap="square" strokeMiterlimit="10" strokeWidth="2"/>
		<path d="m1.125,12S4.989,4,12,4s10.875,8,10.875,8c0,0-3.865,8-10.875,8S1.125,12,1.125,12Z" fill="none" stroke={fill} strokeLinecap="square" strokeMiterlimit="10" strokeWidth="2"/>
	</g>
</svg>
	);
};

export default View;