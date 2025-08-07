import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Check2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M6.5,14c-.192,0-.384-.073-.53-.22l-3.75-3.75c-.293-.293-.293-.768,0-1.061s.768-.293,1.061,0l3.22,3.22L14.72,3.97c.293-.293,.768-.293,1.061,0s.293,.768,0,1.061L7.03,13.78c-.146,.146-.338,.22-.53,.22Z" fill={fill}/>
	</g>
</svg>
	);
};

export default Check2;