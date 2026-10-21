import {
	applyMigrations,
	assertMigratable,
	confirmHost,
	hostOf,
	migrationStatus,
	resolveTarget,
	run,
	withClient,
} from "@/scripts/db/lib";

run(async () => {
	const [target, ...rest] = process.argv.slice(2);
	const { name, url, prod } = resolveTarget(target, rest);
	console.log(`Target: ${name} (${hostOf(url)})`);

	const status = await withClient(url, (client) => migrationStatus(client));
	assertMigratable(status);
	if (status.pending.length === 0) {
		console.log("No pending migrations.");
		return;
	}
	console.log(`Pending migrations:\n${status.pending.map((m) => `  ${m.tag}`).join("\n")}`);
	if (prod) confirmHost(hostOf(url), rest);

	const applied = await applyMigrations(url);
	console.log(`Applied ${applied.length} migration(s).`);
});
