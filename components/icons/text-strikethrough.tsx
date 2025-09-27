import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function TextStrikethrough({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M13.1383 11.9999C13.146 12.0808 13.151 12.1641 13.153 12.25C13.204 14.33 11.336 15.75 9.07898 15.75C6.92198 15.75 5.42397 14.91 4.84497 13.01" fill="none" stroke={fill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
		<path d="M12.774 4.63C11.955 2.6899 10.318 2.25 9.07898 2.25C7.92698 2.25 4.90497 2.86001 5.18497 5.76001C5.38097 7.80001 7.30198 8.55999 8.97898 8.85999C9.19998 8.89999 9.43298 8.94 9.67298 9" fill="none" stroke={fill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
		<path d="M2 9H16" fill="none" stroke={secondaryfill} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
	</g>
</svg>
	);
};

export default TextStrikethrough;