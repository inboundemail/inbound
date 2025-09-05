import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function StackPerspective2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="20" width="20" {...props} viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="m4.217,5.77l7,1.556c.458.102.783.507.783.976v7.951c0,.64-.592,1.115-1.217.976l-7-1.556c-.458-.102-.783-.507-.783-.976v-7.951c0-.64.592-1.115,1.217-.976Z" fill={fill} stroke={fill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
		<path d="m15,14.056l.783.174c.625.139,1.217-.336,1.217-.976v-7.951c0-.469-.326-.875-.783-.976l-7-1.556c-.556-.123-1.084.24-1.193.773" fill="none" stroke={secondaryfill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
	</g>
</svg>
	);
};

export default StackPerspective2;