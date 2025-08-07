import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function GripDotsVertical({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<circle cx="6.75" cy="9" fill={secondaryfill} r="1.25"/>
		<circle cx="6.75" cy="3.75" fill={fill} r="1.25"/>
		<circle cx="6.75" cy="14.25" fill={fill} r="1.25"/>
		<circle cx="11.25" cy="9" fill={secondaryfill} r="1.25"/>
		<circle cx="11.25" cy="3.75" fill={fill} r="1.25"/>
		<circle cx="11.25" cy="14.25" fill={fill} r="1.25"/>
	</g>
</svg>
	);
};

export default GripDotsVertical;