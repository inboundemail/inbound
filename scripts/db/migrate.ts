import {
	applyMigrations,
	confirmHost,
	hostOf,
	migrationStatus,
	resolveTarget,
	run,
	UNBASELINED,
	withClient,
} from "@/scripts/db/lib";

run(async () => {
	const [target, ...rest] = process.argv.slice(2);
	const { name, url, prod } = resolveTarget(target, rest);
	console.log(`Target: ${name} (${hostOf(url)})`);

	const { pending, unbaselined } = await withClient(url, (client) => migrationStatus(client));
	if (unbaselined) throw new Error(UNBASELINED);
	if (pending.length === 0) {
		console.log("No pending migrations.");
		return;
	}
	console.log(`Pending migrations:\n${pending.map((m) => `  ${m.tag}`).join("\n")}`);
	if (prod) confirmHost(hostOf(url), rest);

	const applied = await applyMigrations(url);
	console.log(`Applied ${applied.length} migration(s).`);
});
