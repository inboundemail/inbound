import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function ExternalLink2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="12" width="12" {...props} viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="m8.75,0h-4c-1.517,0-2.75,1.233-2.75,2.75v4.5c0,.485.137.935.358,1.331l4.081-4.081h-1.439c-.414,0-.75-.336-.75-.75s.336-.75.75-.75h3.25c.414,0,.75.336.75.75v3.25c0,.414-.336.75-.75.75s-.75-.336-.75-.75v-1.439l-4.081,4.081c.396.221.846.358,1.331.358h4c1.517,0,2.75-1.233,2.75-2.75V2.75c0-1.517-1.233-2.75-2.75-2.75Z" fill={fill} strokeWidth="0"/>
		<path d="m2.358,8.581L.22,10.72c-.293.293-.293.768,0,1.061.146.146.338.22.53.22s.384-.073.53-.22l2.139-2.139c-.446-.249-.811-.615-1.061-1.061Z" fill={secondaryfill} strokeWidth="0"/>
	</g>
</svg>
	);
};

export default ExternalLink2;