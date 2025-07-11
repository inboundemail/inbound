import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function ChevronUp({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M9.53,4.72c-.293-.293-.768-.293-1.061,0L2.22,10.97c-.293,.293-.293,.768,0,1.061s.768,.293,1.061,0l5.72-5.72,5.72,5.72c.146,.146,.338,.22,.53,.22s.384-.073,.53-.22c.293-.293,.293-.768,0-1.061l-6.25-6.25Z" fill={fill}/>
	</g>
</svg>
	);
};

export default ChevronUp;