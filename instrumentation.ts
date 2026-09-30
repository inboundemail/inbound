export async function register() {
	if (
		process.env.NEXT_RUNTIME === "nodejs" &&
		process.env.NODE_ENV === "development" &&
		process.env.INBOUND_LOCAL_DEV === "true"
	) {
		const { installAutumnMock } = await import("@/lib/local-dev/autumn-mock");
		installAutumnMock();
	}
}
