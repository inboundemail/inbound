import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Code2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M5.25,13.25c-.192,0-.384-.073-.53-.22l-3.5-3.5c-.293-.293-.293-.768,0-1.061l3.5-3.5c.293-.293,.768-.293,1.061,0s.293,.768,0,1.061l-2.97,2.97,2.97,2.97c.293,.293,.293,.768,0,1.061-.146,.146-.338,.22-.53,.22Z" fill={fill}/>
		<path d="M12.75,13.25c-.192,0-.384-.073-.53-.22-.293-.293-.293-.768,0-1.061l2.97-2.97-2.97-2.97c-.293-.293-.293-.768,0-1.061s.768-.293,1.061,0l3.5,3.5c.293,.293,.293,.768,0,1.061l-3.5,3.5c-.146,.146-.338,.22-.53,.22Z" fill={fill}/>
		<path d="M7.501,16c-.059,0-.117-.006-.176-.021-.403-.097-.651-.502-.555-.904L9.771,2.575c.098-.404,.508-.648,.904-.555,.403,.097,.651,.502,.555,.904l-3,12.5c-.083,.344-.39,.575-.729,.575Z" fill={secondaryfill}/>
	</g>
</svg>
	);
};

export default Code2;