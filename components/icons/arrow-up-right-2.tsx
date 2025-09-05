import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function ArrowUpRight2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="12" width="12" {...props} viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="m1.75,11c-.192,0-.384-.073-.53-.22-.293-.293-.293-.768,0-1.061L9.543,1.396c.293-.293.768-.293,1.061,0s.293.768,0,1.061L2.28,10.78c-.146.146-.338.22-.53.22Z" fill={secondaryfill} strokeWidth="0"/>
		<path d="m10.25,7.25c-.414,0-.75-.336-.75-.75V2.5h-4c-.414,0-.75-.336-.75-.75s.336-.75.75-.75h4.75c.414,0,.75.336.75.75v4.75c0,.414-.336.75-.75.75Z" fill={fill} strokeWidth="0"/>
	</g>
</svg>
	);
};

export default ArrowUpRight2;