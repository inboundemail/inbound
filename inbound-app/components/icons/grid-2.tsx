import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Grid2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<rect height="6" width="6" fill={fill} rx="1.75" ry="1.75" x="2" y="10"/>
		<rect height="6" width="6" fill={fill} rx="1.75" ry="1.75" x="10" y="10"/>
		<rect height="6" width="6" fill={fill} rx="1.75" ry="1.75" x="2" y="2"/>
		<path d="M16.005,3.763l-1.769-1.769c-.681-.68-1.791-.681-2.474,0l-1.769,1.769c-.681,.682-.681,1.792,0,2.474l1.769,1.769c.341,.34,.789,.511,1.237,.511s.896-.17,1.237-.511l1.769-1.769c.681-.682,.681-1.792,0-2.474,0,0,0,0,0,0Z" fill={secondaryfill}/>
	</g>
</svg>
	);
};

export default Grid2;