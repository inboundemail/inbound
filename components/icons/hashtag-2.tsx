import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Hashtag2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="12" width="12" {...props} viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="m11.25,4.441H1.59c-.414,0-.75-.336-.75-.75s.336-.75.75-.75h9.66c.414,0,.75.336.75.75s-.336.75-.75.75Z" fill={secondaryfill} strokeWidth="0"/>
		<path d="m10.41,9.061H.75c-.414,0-.75-.336-.75-.75s.336-.75.75-.75h9.66c.414,0,.75.336.75.75s-.336.75-.75.75Z" fill={secondaryfill} strokeWidth="0"/>
		<path d="m2.884,12.001c-.046,0-.092-.004-.139-.013-.407-.077-.675-.468-.599-.875L4.114.613c.076-.407.464-.677.875-.599.407.077.675.468.599.875l-1.969,10.5c-.068.36-.383.612-.736.612Z" fill={fill} strokeWidth="0"/>
		<path d="m7.149,12.001c-.046,0-.092-.004-.139-.013-.407-.077-.675-.468-.599-.875L8.38.613c.076-.407.464-.677.875-.599.407.077.675.468.599.875l-1.969,10.5c-.068.36-.383.612-.736.612Z" fill={fill} strokeWidth="0"/>
	</g>
</svg>
	);
};

export default Hashtag2;