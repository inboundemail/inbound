import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function MediaPause({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<rect height="14" width="5" fill={fill} rx="1.75" ry="1.75" x="2" y="2"/>
		<rect height="14" width="5" fill={secondaryfill} rx="1.75" ry="1.75" x="11" y="2"/>
	</g>
</svg>
	);
};

export default MediaPause;