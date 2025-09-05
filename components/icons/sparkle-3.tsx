import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Sparkle3({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="12" width="12" {...props} viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="m11.526,5.803l-3.102-1.227-1.227-3.102c-.113-.286-.39-.474-.697-.474s-.584.188-.697.474l-1.227,3.102-3.102,1.227c-.286.113-.474.39-.474.697s.188.584.474.697l3.102,1.227,1.227,3.102c.113.286.39.474.697.474s.584-.188.697-.474l1.227-3.102,3.102-1.227c.286-.113.474-.39.474-.697s-.188-.584-.474-.697Z" fill={fill} strokeWidth="0"/>
		<path d="m3.492,1.492l-.946-.315-.316-.947c-.102-.306-.609-.306-.711,0l-.316.947-.946.315c-.153.051-.257.194-.257.356s.104.305.257.356l.946.315.316.947c.051.153.194.256.355.256s.305-.104.355-.256l.316-.947.946-.315c.153-.051.257-.194.257-.356s-.104-.305-.257-.356h0Z" fill={secondaryfill} strokeWidth="0"/>
	</g>
</svg>
	);
};

export default Sparkle3;