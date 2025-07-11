import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function BulletList({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M15.75 10.5H8.75C8.336 10.5 8 10.836 8 11.25C8 11.664 8.336 12 8.75 12H15.75C16.164 12 16.5 11.664 16.5 11.25C16.5 10.836 16.164 10.5 15.75 10.5Z" fill={fill}/>
		<path d="M15.75 14H8.75C8.336 14 8 14.336 8 14.75C8 15.164 8.336 15.5 8.75 15.5H15.75C16.164 15.5 16.5 15.164 16.5 14.75C16.5 14.336 16.164 14 15.75 14Z" fill={fill}/>
		<path d="M15.75 3.5H8.75C8.336 3.5 8 3.836 8 4.25C8 4.664 8.336 5 8.75 5H15.75C16.164 5 16.5 4.664 16.5 4.25C16.5 3.836 16.164 3.5 15.75 3.5Z" fill={fill}/>
		<path d="M15.75 7H8.75C8.336 7 8 7.336 8 7.75C8 8.164 8.336 8.5 8.75 8.5H15.75C16.164 8.5 16.5 8.164 16.5 7.75C16.5 7.336 16.164 7 15.75 7Z" fill={fill}/>
		<path d="M3.75 6.5C4.9926 6.5 6 5.493 6 4.25C6 3.007 4.9926 2 3.75 2C2.5074 2 1.5 3.007 1.5 4.25C1.5 5.493 2.5074 6.5 3.75 6.5Z" fill={secondaryfill}/>
		<path d="M3.75 13.5C4.9926 13.5 6 12.493 6 11.25C6 10.007 4.9926 9 3.75 9C2.5074 9 1.5 10.007 1.5 11.25C1.5 12.493 2.5074 13.5 3.75 13.5Z" fill={secondaryfill}/>
	</g>
</svg>
	);
};

export default BulletList;