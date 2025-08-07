import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Cloud2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="12" width="12" {...props} viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="m8.518,3.51c-.749-1.524-2.291-2.51-4.018-2.51C2.019,1,0,3.019,0,5.5s2.019,4.5,4.5,4.5h4.25c1.792,0,3.25-1.458,3.25-3.25,0-1.868-1.563-3.4-3.482-3.24Z" fill={fill} strokeWidth="0"/>
	</g>
</svg>
	);
};

export default Cloud2;