import { exitCodeFor, runCli } from "./cli";

try {
	await runCli(process.argv.slice(2));
} catch (error) {
	const message = error instanceof Error ? error.message : "Unknown error";
	console.error(`Error: ${message}`);
	process.exitCode = exitCodeFor(error);
}
