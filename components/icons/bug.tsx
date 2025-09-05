import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Bug({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<line fill="none" stroke={secondaryfill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" x1="9" x2="9" y1="15.25" y2="10.75"/>
		<line fill="none" stroke={fill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" x1="4.75" x2="1.75" y1="9.75" y2="9.75"/>
		<line fill="none" stroke={fill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" x1="13.25" x2="16.25" y1="9.75" y2="9.75"/>
		<path d="M6.75,5.75v-1.25c0-1.243,1.007-2.25,2.25-2.25h0c1.243,0,2.25,1.007,2.25,2.25v1.25" fill="none" stroke={secondaryfill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
		<path d="M4.75,7.25c-1.519,0-2.75-1.231-2.75-2.75" fill="none" stroke={fill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
		<path d="M4.75,12.25c-1.519,0-2.75,1.231-2.75,2.75" fill="none" stroke={fill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
		<path d="M13.25,7.25c1.519,0,2.75-1.231,2.75-2.75" fill="none" stroke={fill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
		<path d="M13.25,12.25c1.519,0,2.75,1.231,2.75,2.75" fill="none" stroke={fill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
		<path d="M6.75,5.75h4.5c1.104,0,2,.896,2,2v3.25c0,2.346-1.904,4.25-4.25,4.25h0c-2.346,0-4.25-1.904-4.25-4.25v-3.25c0-1.104,.896-2,2-2Z" fill="none" stroke={fill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
	</g>
</svg>
	);
};

export default Bug;