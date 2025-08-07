import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function ArchiveDownload({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="12" width="12" {...props} viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="m10.75,2c-.414,0-.75.336-.75.75v3.25h-1.25c-.414,0-.75.336-.75.75v1.25h-4v-1.25c0-.414-.336-.75-.75-.75h-1.25v-3.25c0-.414-.336-.75-.75-.75s-.75.336-.75.75v6c0,1.517,1.233,2.75,2.75,2.75h5.5c1.517,0,2.75-1.233,2.75-2.75V2.75c0-.414-.336-.75-.75-.75Z" fill={fill} strokeWidth="0"/>
		<path d="m7.72,1.72l-.97.97V.75c0-.414-.336-.75-.75-.75s-.75.336-.75.75v1.939l-.97-.97c-.293-.293-.768-.293-1.061,0s-.293.768,0,1.061l2.25,2.25c.146.146.338.22.53.22s.384-.073.53-.22l2.25-2.25c.293-.293.293-.768,0-1.061s-.768-.293-1.061,0Z" fill={secondaryfill} strokeWidth="0"/>
	</g>
</svg>
	);
};

export default ArchiveDownload;