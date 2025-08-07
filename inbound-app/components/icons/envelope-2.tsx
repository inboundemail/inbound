import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Envelope2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="12" width="12" {...props} viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="m6,5.935l5.962-2.556c-.183-1.34-1.323-2.378-2.712-2.378H2.75C1.361,1.001.221,2.04.038,3.38l5.962,2.555Z" fill={secondaryfill} strokeWidth="0"/>
		<path d="m6.295,7.441c-.094.041-.195.061-.295.061s-.201-.02-.295-.061L0,4.996v3.255c0,1.517,1.233,2.75,2.75,2.75h6.5c1.517,0,2.75-1.233,2.75-2.75v-3.256l-5.705,2.445Z" fill={fill} strokeWidth="0"/>
	</g>
</svg>
	);
};

export default Envelope2;