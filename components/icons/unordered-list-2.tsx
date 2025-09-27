import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function UnorderedList2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="12" width="12" {...props} viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<circle cx="1.5" cy="1.75" fill={fill} r="1.5" strokeWidth="0"/>
		<circle cx="1.5" cy="6" fill={secondaryfill} r="1.5" strokeWidth="0"/>
		<circle cx="1.5" cy="10.25" fill={fill} r="1.5" strokeWidth="0"/>
		<path d="m11.25,1h-6.25c-.414,0-.75.336-.75.75s.336.75.75.75h6.25c.414,0,.75-.336.75-.75s-.336-.75-.75-.75Z" fill={fill} strokeWidth="0"/>
		<path d="m11.25,5.25h-6.25c-.414,0-.75.336-.75.75s.336.75.75.75h6.25c.414,0,.75-.336.75-.75s-.336-.75-.75-.75Z" fill={secondaryfill} strokeWidth="0"/>
		<path d="m11.25,9.5h-6.25c-.414,0-.75.336-.75.75s.336.75.75.75h6.25c.414,0,.75-.336.75-.75s-.336-.75-.75-.75Z" fill={fill} strokeWidth="0"/>
	</g>
</svg>
	);
};

export default UnorderedList2;