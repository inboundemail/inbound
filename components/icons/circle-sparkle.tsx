import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function CircleSparkle({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M1 9C1 4.589 4.589 1 9 1C13.411 1 17 4.589 17 9C17 13.411 13.411 17 9 17C4.589 17 1 13.411 1 9ZM9.72583 5.56115C9.63985 5.23067 9.34148 5 9 5C8.65852 5 8.36015 5.23067 8.27417 5.56115L7.71403 7.71402L5.56115 8.27417C5.23067 8.36015 5 8.65852 5 9C5 9.34148 5.23067 9.63985 5.56115 9.72583L7.71403 10.286L8.27417 12.4388C8.36015 12.7693 8.65852 13 9 13C9.34148 13 9.63985 12.7693 9.72583 12.4388L10.286 10.286L12.4388 9.72583C12.7693 9.63985 13 9.34148 13 9C13 8.65852 12.7693 8.36015 12.4388 8.27417L10.286 7.71402L9.72583 5.56115Z" fill={fill} fillRule="evenodd"/>
	</g>
</svg>
	);
};

export default CircleSparkle;