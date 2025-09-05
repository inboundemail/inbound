import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Shield2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M8.25,8V1.203L3.216,2.813c-.728,.233-1.216,.903-1.216,1.667v3.52h6.25Z" fill={fill}/>
		<path d="M9.75,8h6.25v-3.52c0-.764-.489-1.434-1.217-1.667l-5.033-1.61v6.797Z" fill={secondaryfill}/>
		<path d="M8.25,9.5H2v1.5c0,3.365,4.542,5.22,6.25,5.798v-7.298Z" fill={secondaryfill}/>
		<path d="M9.75,9.5v7.298c1.711-.579,6.25-2.434,6.25-5.798v-1.5h-6.25Z" fill={fill}/>
	</g>
</svg>
	);
};

export default Shield2;