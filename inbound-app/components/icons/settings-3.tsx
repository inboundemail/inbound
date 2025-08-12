import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function Settings3({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="32" width="32" {...props} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M22.208,17.208l-5.724,6.276,6.273,6.273h0c1.656,1.657,4.342,1.657,5.999,0h0c1.657-1.657,1.657-4.343,0-6h0s-6.549-6.55-6.549-6.55Z" fill={secondaryfill}/>
		<path d="M10.085,14.085l3.138-2.862L4.293,2.293c-.391-.391-1.024-.391-1.414,0l-1.586,1.586c-.391,.391-.391,1.024,0,1.414L10.085,14.085Z" fill={secondaryfill}/>
		<path d="M30.634,5.366l-2.927,2.927c-.391,.391-1.024,.391-1.414,0l-2.586-2.586c-.391-.391-.391-1.024,0-1.414l2.927-2.927c-3.383-1.184-7.086,.598-8.27,3.981-.45,1.285-.484,2.678-.098,3.984L1.655,24.481c-.807,.736-.88,1.987-.155,2.804,.028,.032,.056,.062,.086,.091l3.024,3.024c.777,.777,2.041,.798,2.826,.03,.028-.027,.054-.054,.08-.083L22.669,13.734c3.434,1.019,7.044-.938,8.064-4.372,.389-1.309,.354-2.708-.099-3.996Z" fill={fill}/>
	</g>
</svg>
	);
};

export default Settings3;