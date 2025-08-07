import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function BoltLightning({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M14.868,6.191c-.213-.426-.642-.691-1.118-.691h-2.653l1.088-2.798c.149-.385,.099-.818-.134-1.159-.233-.34-.619-.543-1.031-.543H6.85c-.522,0-.994,.329-1.174,.819l-2.385,6.501c-.14,.383-.083,.812,.15,1.146,.234,.334,.617,.533,1.024,.533h3.79l-1.727,6.044c-.1,.348,.063,.717,.387,.878,.107,.053,.221,.078,.334,.078,.229,0,.454-.106,.6-.3L14.751,7.5c.285-.381,.33-.882,.117-1.309Z" fill={fill}/>
	</g>
</svg>
	);
};

export default BoltLightning;