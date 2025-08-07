import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Clipboard2({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="12" width="12" {...props} viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="m8.25,12H3.75c-1.517,0-2.75-1.233-2.75-2.75V3.75c0-1.517,1.233-2.75,2.75-2.75h.5c.414,0,.75.336.75.75s-.336.75-.75.75h-.5c-.689,0-1.25.561-1.25,1.25v5.5c0,.689.561,1.25,1.25,1.25h4.5c.689,0,1.25-.561,1.25-1.25V3.75c0-.689-.561-1.25-1.25-1.25h-.5c-.414,0-.75-.336-.75-.75s.336-.75.75-.75h.5c1.517,0,2.75,1.233,2.75,2.75v5.5c0,1.517-1.233,2.75-2.75,2.75Z" fill={fill} strokeWidth="0"/>
		<rect height="3.5" width="5" fill={secondaryfill} rx="1.25" ry="1.25" strokeWidth="0" x="3.5"/>
	</g>
</svg>
	);
};

export default Clipboard2;