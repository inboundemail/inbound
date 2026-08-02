import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	poweredByHeader: false,
	reactStrictMode: true,
	serverExternalPackages: ["@react-email/editor"],
	turbopack: {
		root: process.cwd(),
	},
};

export default nextConfig;
