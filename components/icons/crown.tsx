import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Crown({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M9 3.25C9.55228 3.25 10 2.80228 10 2.25C10 1.69772 9.55228 1.25 9 1.25C8.44772 1.25 8 1.69772 8 2.25C8 2.80228 8.44772 3.25 9 3.25Z" fill={secondaryfill}/>
		<path d="M2 6C2.55228 6 3 5.55228 3 5C3 4.44772 2.55228 4 2 4C1.44772 4 1 4.44772 1 5C1 5.55228 1.44772 6 2 6Z" fill={secondaryfill}/>
		<path d="M16 6C16.5523 6 17 5.55228 17 5C17 4.44772 16.5523 4 16 4C15.4477 4 15 4.44772 15 5C15 5.55228 15.4477 6 16 6Z" fill={secondaryfill}/>
		<path d="M15.426 6.882C15.182 6.714 14.86 6.706 14.607 6.861L11.998 8.466L9.64101 4.608C9.36901 4.162 8.63301 4.162 8.36101 4.608L6.00401 8.466L3.39501 6.861C3.14201 6.706 2.82101 6.714 2.57601 6.882C2.33101 7.051 2.20901 7.348 2.26501 7.64L3.11001 12.077C3.26701 12.902 3.99001 13.5 4.82901 13.5H13.172C14.011 13.5 14.734 12.902 14.891 12.077L15.736 7.64C15.792 7.348 15.671 7.051 15.426 6.882Z" fill={fill}/>
		<path d="M14 15H4C3.586 15 3.25 15.336 3.25 15.75C3.25 16.164 3.586 16.5 4 16.5H14C14.414 16.5 14.75 16.164 14.75 15.75C14.75 15.336 14.414 15 14 15Z" fill={secondaryfill}/>
	</g>
</svg>
	);
};

export default Crown;