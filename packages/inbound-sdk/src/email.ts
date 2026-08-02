export interface ReactEmailOptions {
	react?: unknown;
}

export async function render(node: unknown): Promise<string> {
	const renderer = await import("@react-email/render");
	return renderer.render(node as never);
}

export async function prepareEmailBody<Body extends ReactEmailOptions>(
	body: Body,
): Promise<Omit<Body, "react"> & { html?: string }> {
	const prepared = { ...body } as Body & { html?: string };
	if (prepared.react !== undefined) {
		prepared.html = await render(prepared.react);
	}
	delete prepared.react;
	return prepared;
}
