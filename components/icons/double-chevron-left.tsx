import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function DoubleChevronLeft({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M5.061,9l3.72-3.72c.293-.293,.293-.768,0-1.061s-.768-.293-1.061,0L3.47,8.47c-.293,.293-.293,.768,0,1.061l4.25,4.25c.146,.146,.338,.22,.53,.22s.384-.073,.53-.22c.293-.293,.293-.768,0-1.061l-3.72-3.72Z" fill={secondaryfill}/>
		<path d="M13.53,4.22c-.293-.293-.768-.293-1.061,0l-4.25,4.25c-.293,.293-.293,.768,0,1.061l4.25,4.25c.146,.146,.338,.22,.53,.22s.384-.073,.53-.22c.293-.293,.293-.768,0-1.061l-3.72-3.72,3.72-3.72c.293-.293,.293-.768,0-1.061Z" fill={fill}/>
	</g>
</svg>
	);
};

export default DoubleChevronLeft;