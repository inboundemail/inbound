interface SesMailConfiguration {
	configurationSetName?: unknown;
	tags?: Record<string, unknown> | null;
}

export function getSesConfigurationSetName(
	mail: SesMailConfiguration,
): string | undefined {
	if (
		typeof mail.configurationSetName === "string" &&
		mail.configurationSetName.trim()
	) {
		return mail.configurationSetName.trim();
	}

	const taggedValues = mail.tags?.["ses:configuration-set"];
	if (!Array.isArray(taggedValues)) {
		return undefined;
	}

	const taggedName = taggedValues.find(
		(value): value is string =>
			typeof value === "string" && value.trim().length > 0,
	);

	return taggedName?.trim();
}
