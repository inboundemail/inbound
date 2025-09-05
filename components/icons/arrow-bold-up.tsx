import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function ArrowBoldUp({fill = 'currentColor', secondaryfill, title = 'arrow bold up', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style={{transform: 'rotate(180deg)'}}>
	<title>{title}</title>
	<g fill={fill}>
		<path d="M13.993,8h-1.993V2.75c0-.965-.785-1.75-1.75-1.75h-2.5c-.965,0-1.75,.785-1.75,1.75v5.25h-1.993c-.479,0-.907,.266-1.12,.695-.212,.428-.165,.931,.124,1.311l4.993,6.581c.239,.314,.602,.494,.996,.494s.757-.18,.996-.495l4.993-6.581c.289-.38,.336-.883,.124-1.311-.213-.429-.642-.695-1.12-.695Z" fill={fill}/>
	</g>
</svg>
	);
};

export default ArrowBoldUp;