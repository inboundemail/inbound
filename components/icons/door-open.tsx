import React, {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	secondaryfill?: string;
	strokewidth?: number;
	title?: string;
}

function DoorOpen({fill = 'currentColor', secondaryfill, title = 'badge 13', ...props}: IconProps) {
	secondaryfill = secondaryfill || fill;

	return (
		<svg height="18" width="18" {...props} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
	<title>{title}</title>
	<g fill={fill}>
		<path d="M9.444 0.960004C9.095 0.728004 8.657 0.685004 8.269 0.846004L3.577 2.801C2.923 3.073 2.5 3.708 2.5 4.416V13.583C2.5 14.291 2.923 14.926 3.577 15.198L8.27 17.153C8.425 17.217 8.588 17.249 8.751 17.249C8.994 17.249 9.235 17.178 9.444 17.039C9.792 16.807 10 16.418 10 15.999V2C10 1.581 9.792 1.192 9.444 0.960004ZM7.5 9.5C7.5 9.914 7.164 10.25 6.75 10.25C6.336 10.25 6 9.914 6 9.5V8.5C6 8.086 6.336 7.75 6.75 7.75C7.164 7.75 7.5 8.086 7.5 8.5V9.5Z" fill={fill}/>
		<path d="M11.5 3.25C11.5 2.83579 11.8358 2.5 12.25 2.5H13.75C14.7162 2.5 15.5 3.28379 15.5 4.25V13.75C15.5 14.7162 14.7162 15.5 13.75 15.5H12.25C11.8358 15.5 11.5 15.1642 11.5 14.75C11.5 14.3358 11.8358 14 12.25 14H13.75C13.8878 14 14 13.8878 14 13.75V4.25C14 4.11221 13.8878 4 13.75 4H12.25C11.8358 4 11.5 3.66421 11.5 3.25Z" fill={secondaryfill} fillRule="evenodd"/>
	</g>
</svg>
	);
};

export default DoorOpen;