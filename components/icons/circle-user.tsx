import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function CircleUser({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M8.99997 10.0029C10.2444 10.0029 11.2524 8.99446 11.2524 7.75046C11.2524 6.50645 10.2444 5.49805 8.99997 5.49805C7.75551 5.49805 6.74756 6.50645 6.74756 7.75046C6.74756 8.99446 7.75551 10.0029 8.99997 10.0029Z" fill={secondaryfill}/>
		<path d="M4.45222 14.9423C5.02052 12.9651 6.82706 11.5005 9.00004 11.5005C11.1733 11.5005 12.9784 12.9654 13.5477 14.9419C13.6404 15.2638 13.5085 15.6081 13.2244 15.7856C11.9999 16.5504 10.5541 17.0005 9.00004 17.0005C7.44579 17.0005 6.00111 16.5504 4.77595 15.7857C4.49182 15.6084 4.3597 15.2642 4.45222 14.9423Z" fill={secondaryfill} fillRule="evenodd"/>
		<path d="M1 9.00049C1 4.58228 4.58168 1.00049 9 1.00049C13.4183 1.00049 17 4.58228 17 9.00049C17 13.4187 13.4183 17.0005 9 17.0005C4.58168 17.0005 1 13.4187 1 9.00049ZM9 2.50049C5.41012 2.50049 2.5 5.4107 2.5 9.00049C2.5 12.5903 5.41012 15.5005 9 15.5005C12.5899 15.5005 15.5 12.5903 15.5 9.00049C15.5 5.4107 12.5899 2.50049 9 2.50049Z" fill={fill} fillRule="evenodd"/>
	</g>
</svg>
	);
};

export default CircleUser;