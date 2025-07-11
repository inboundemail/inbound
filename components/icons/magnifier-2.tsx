import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Magnifier2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M12.3732 12.3732C12.6661 12.0803 13.1409 12.0803 13.4338 12.3732L16.2803 15.2197C16.5732 15.5126 16.5732 15.9874 16.2803 16.2803C15.9874 16.5732 15.5126 16.5732 15.2197 16.2803L12.3732 13.4338C12.0803 13.1409 12.0803 12.6661 12.3732 12.3732Z" fill={secondaryfill} fillRule="evenodd"/>
		<path d="M1.5 7.25C1.5 4.07439 4.07439 1.5 7.25 1.5C10.4256 1.5 13 4.07439 13 7.25C13 10.4256 10.4256 13 7.25 13C4.07439 13 1.5 10.4256 1.5 7.25ZM7.25 3C4.90281 3 3 4.90281 3 7.25C3 9.59719 4.90281 11.5 7.25 11.5C9.59719 11.5 11.5 9.59719 11.5 7.25C11.5 4.90281 9.59719 3 7.25 3Z" fill={fill} fillRule="evenodd"/>
	</g>
</svg>
	);
};

export default Magnifier2;