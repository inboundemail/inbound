import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function ChartBarAxisX2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="12" width="12" {...props} viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="m11.25,11H.75c-.414,0-.75-.336-.75-.75s.336-.75.75-.75h10.5c.414,0,.75.336.75.75s-.336.75-.75.75Z" fill={secondaryfill} strokeWidth="0"/>
		<path d="m2.75,8.5c-.414,0-.75-.336-.75-.75v-3.5c0-.414.336-.75.75-.75s.75.336.75.75v3.5c0,.414-.336.75-.75.75Z" fill={fill} strokeWidth="0"/>
		<path d="m9.25,8.5c-.414,0-.75-.336-.75-.75v-1.5c0-.414.336-.75.75-.75s.75.336.75.75v1.5c0,.414-.336.75-.75.75Z" fill={fill} strokeWidth="0"/>
		<path d="m6,8.5c-.414,0-.75-.336-.75-.75V1.75c0-.414.336-.75.75-.75s.75.336.75.75v6c0,.414-.336.75-.75.75Z" fill={fill} strokeWidth="0"/>
	</g>
</svg>
	);
};

export default ChartBarAxisX2;