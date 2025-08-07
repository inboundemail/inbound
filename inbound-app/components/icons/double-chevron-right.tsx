import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function DoubleChevronRight({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M10.28,4.22c-.293-.293-.768-.293-1.061,0s-.293,.768,0,1.061l3.72,3.72-3.72,3.72c-.293,.293-.293,.768,0,1.061,.146,.146,.338,.22,.53,.22s.384-.073,.53-.22l4.25-4.25c.293-.293,.293-.768,0-1.061l-4.25-4.25Z" fill={secondaryfill}/>
		<path d="M9.78,8.47L5.53,4.22c-.293-.293-.768-.293-1.061,0s-.293,.768,0,1.061l3.72,3.72-3.72,3.72c-.293,.293-.293,.768,0,1.061,.146,.146,.338,.22,.53,.22s.384-.073,.53-.22l4.25-4.25c.293-.293,.293-.768,0-1.061Z" fill={fill}/>
	</g>
</svg>
	);
};

export default DoubleChevronRight;