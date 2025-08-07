import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function TabClose({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M10.97 4.21997L9.75002 5.43994V1.75012C9.75002 1.34012 9.41402 1.00012 9.00002 1.00012C8.58602 1.00012 8.25002 1.34012 8.25002 1.75012V5.43994L7.03002 4.21997C6.73702 3.93007 6.26202 3.93007 5.96902 4.21997C5.67602 4.50997 5.67602 4.99005 5.96902 5.28015L8.46902 7.78015C8.61502 7.93015 8.80702 8.00012 8.99902 8.00012C9.19102 8.00012 9.38302 7.93025 9.52902 7.78015L12.029 5.28015C12.322 4.99015 12.322 4.51007 12.029 4.21997C11.736 3.93007 11.261 3.93007 10.968 4.21997H10.97Z" fill={secondaryfill}/>
		<path d="M4.25 11.5H13.75C14.007 11.5 14.256 11.53 14.5 11.58V11.25C14.5 10.01 13.491 9 12.25 9H5.75C4.509 9 3.5 10.01 3.5 11.25V11.58C3.744 11.5301 3.993 11.5 4.25 11.5Z" fill={fill}/>
		<path d="M13.75 13H4.25C2.733 13 1.5 14.23 1.5 15.75V16.25C1.5 16.66 1.836 17 2.25 17H15.75C16.164 17 16.5 16.66 16.5 16.25V15.75C16.5 14.23 15.267 13 13.75 13Z" fill={fill}/>
	</g>
</svg>
	);
};

export default TabClose;