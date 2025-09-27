import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Pilcrow({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M8.25 1.82454C8.00769 1.77566 7.75696 1.75 7.50024 1.75C5.41777 1.75 3.72958 3.43818 3.72958 5.52066C3.72958 7.60314 5.41777 9.29132 7.50024 9.29132C7.75696 9.29132 8.00769 9.26567 8.25 9.21678V1.82454Z" fill={secondaryfill} fillOpacity="0.3" fillRule="evenodd" stroke="none"/>
		<path d="M8.25 1.75V16.25" fill="none" stroke={fill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
		<path d="M12.25 1.75V16.25" fill="none" stroke={fill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
		<path d="M14.25 1.75H7.5C5.429 1.75 3.75 3.429 3.75 5.5C3.75 7.571 5.429 9.25 7.5 9.25H8.25" fill="none" stroke={fill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
	</g>
</svg>
	);
};

export default Pilcrow;