#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseCliArgs } from "./args";
import { generateChatCoreSchema } from "./generate";
import { VERSION } from "./version";

const USAGE = `Usage:
  chatcore schema generate --dialect <sqlite|postgres|mysql> [--out <file>]

Options:
  --dialect       SQL dialect to generate: sqlite, postgres, or mysql.
  --out           Write SQL to a file instead of stdout.
  --id-strategy   id column strategy: string, uuid, serial, or number.
  -h, --help      Show this help message.
  -v, --version   Show the CLI version.
`;

async function main(argv: string[]): Promise<void> {
	const parsed = parseCliArgs(argv);
	if (!parsed.ok) {
		process.stderr.write(`${parsed.message}\n\n${USAGE}`);
		process.exitCode = 1;
		return;
	}

	if (parsed.command.type === "help") {
		process.stdout.write(USAGE);
		return;
	}

	if (parsed.command.type === "version") {
		process.stdout.write(`${VERSION}\n`);
		return;
	}

	const sql = await generateChatCoreSchema(parsed.command.options);
	if (parsed.command.options.out === undefined) {
		process.stdout.write(ensureTrailingNewline(sql));
		return;
	}

	const outPath = resolve(parsed.command.options.out);
	await mkdir(dirname(outPath), { recursive: true });
	await writeFile(outPath, ensureTrailingNewline(sql), "utf8");
	process.stdout.write(`Generated ChatCore schema: ${outPath}\n`);
}

function ensureTrailingNewline(value: string): string {
	return value.endsWith("\n") ? value : `${value}\n`;
}

main(process.argv.slice(2)).catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`${message}\n`);
	process.exitCode = 1;
});
