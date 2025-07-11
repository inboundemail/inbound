import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function CirclePlay({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M9,1C4.589,1,1,4.589,1,9s3.589,8,8,8,8-3.589,8-8S13.411,1,9,1Zm2.778,8.648l-3.65,2.129c-.118,.069-.248,.104-.378,.104-.128,0-.256-.034-.374-.101-.236-.135-.376-.378-.376-.65V6.871c0-.272,.141-.515,.376-.65,.236-.136,.517-.134,.751,.002l3.65,2.129c.233,.136,.373,.378,.373,.648s-.139,.512-.373,.648Z" fill={fill}/>
	</g>
</svg>
	);
};

export default CirclePlay;