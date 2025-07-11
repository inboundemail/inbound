import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Trash2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M3.40771 5L3.90253 14.3892C3.97873 15.8531 5.18472 17 6.64862 17H11.3527C12.8166 17 14.0226 15.853 14.0988 14.3896L14.5936 5H3.40771ZM7.41711 14H7.37512C6.97912 14 6.64913 13.6899 6.62613 13.29L6.37613 8.79004C6.35313 8.37984 6.67014 8.02 7.08414 8C7.49804 7.98 7.85112 8.28996 7.87512 8.70996L8.12512 13.21C8.14812 13.6202 7.83111 13.98 7.41711 14ZM11.3751 13.29C11.3531 13.6899 11.0221 14 10.6261 14H10.5841C10.1701 13.98 9.85413 13.6201 9.87613 13.21L10.1261 8.70996C10.149 8.29976 10.4831 7.9903 10.9171 8C11.3311 8.02 11.6471 8.37994 11.6251 8.79004L11.3751 13.29Z" fill={fill}/>
		<path d="M15.25 4H12V2.75C12 1.7852 11.2148 1 10.25 1H7.75C6.7852 1 6 1.7852 6 2.75V4H2.75C2.3359 4 2 4.3359 2 4.75C2 5.1641 2.3359 5.5 2.75 5.5H15.25C15.6641 5.5 16 5.1641 16 4.75C16 4.3359 15.6641 4 15.25 4ZM7.5 2.75C7.5 2.6143 7.6143 2.5 7.75 2.5H10.25C10.3857 2.5 10.5 2.6143 10.5 2.75V4H7.5V2.75Z" fill={secondaryfill}/>
	</g>
</svg>
	);
};

export default Trash2;