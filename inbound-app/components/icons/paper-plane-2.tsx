import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function PaperPlane2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="12" width="12" {...props} viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="m11.544.458c-.413-.414-1.016-.562-1.573-.381L1.078,2.935C.486,3.125.077,3.627.01,4.244c-.068.618.224,1.197.761,1.511l2.784,1.63,2.74-2.74c.293-.293.768-.293,1.061,0,.293.293.293.768,0,1.061l-2.736,2.736,1.626,2.789c.283.486.784.771,1.334.771.058,0,.116-.003.175-.01.618-.067,1.12-.476,1.311-1.068l2.858-8.894c.179-.557.033-1.159-.38-1.572Z" fill={fill} strokeWidth="0"/>
	</g>
</svg>
	);
};

export default PaperPlane2;