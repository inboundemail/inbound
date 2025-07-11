import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function ArrowBoldRight({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M16.586,8.004L10.005,3.011c-.38-.288-.883-.335-1.311-.124-.429,.213-.694,.642-.694,1.12v1.993H2.75c-.965,0-1.75,.785-1.75,1.75v2.5c0,.965,.785,1.75,1.75,1.75h5.25v1.993c0,.478,.266,.907,.694,1.12,.177,.088,.368,.131,.557,.131,.267,0,.531-.086,.754-.255l6.581-4.994c.314-.238,.494-.601,.494-.996s-.18-.757-.494-.996Z" fill={fill}/>
	</g>
</svg>
	);
};

export default ArrowBoldRight;