import type {
	ChatCoreSchemaDialect,
	ChatCoreSchemaIdStrategy,
} from "./generate";

export type CliCommand =
	| { type: "help" }
	| { type: "schema-generate"; options: SchemaGenerateCommandOptions }
	| { type: "version" };

export interface SchemaGenerateCommandOptions {
	dialect: ChatCoreSchemaDialect;
	idStrategy?: ChatCoreSchemaIdStrategy;
	out?: string;
}

export type ParseCliArgsResult =
	| { ok: true; command: CliCommand }
	| { ok: false; message: string };

const DIALECTS = ["mysql", "postgres", "sqlite"] as const;
const ID_STRATEGIES = ["number", "serial", "string", "uuid"] as const;

export function parseCliArgs(argv: string[]): ParseCliArgsResult {
	if (argv.length === 0 || hasHelpFlag(argv)) {
		return { ok: true, command: { type: "help" } };
	}

	const first = argv[0];
	if (first === "--version" || first === "-v") {
		return { ok: true, command: { type: "version" } };
	}

	if (first !== "schema" || argv[1] !== "generate") {
		return {
			ok: false,
			message: `Unknown command: ${argv.join(" ")}`,
		};
	}

	return parseSchemaGenerateOptions(argv.slice(2));
}

function parseSchemaGenerateOptions(args: string[]): ParseCliArgsResult {
	let dialect: ChatCoreSchemaDialect | undefined;
	let idStrategy: ChatCoreSchemaIdStrategy | undefined;
	let out: string | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const token = args[index];
		if (token === undefined) continue;

		const option = parseOptionToken(token, args[index + 1]);
		if (!option.ok) return option;

		if (option.consumedNext) index += 1;

		if (option.name === "--dialect") {
			if (!isDialect(option.value)) {
				return {
					ok: false,
					message: `Invalid --dialect value: ${option.value}`,
				};
			}
			dialect = option.value;
			continue;
		}

		if (option.name === "--id-strategy") {
			if (!isIdStrategy(option.value)) {
				return {
					ok: false,
					message: `Invalid --id-strategy value: ${option.value}`,
				};
			}
			idStrategy = option.value;
			continue;
		}

		if (option.name === "--out") {
			out = option.value;
			continue;
		}

		return { ok: false, message: `Unknown option: ${option.name}` };
	}

	if (dialect === undefined) {
		return {
			ok: false,
			message: "Missing required option: --dialect <mysql|postgres|sqlite>",
		};
	}

	return {
		ok: true,
		command: {
			type: "schema-generate",
			options: { dialect, idStrategy, out },
		},
	};
}

function hasHelpFlag(argv: string[]): boolean {
	return argv.some((arg) => arg === "--help" || arg === "-h");
}

function parseOptionToken(
	token: string,
	nextToken: string | undefined,
):
	| { ok: true; consumedNext: boolean; name: string; value: string }
	| { ok: false; message: string } {
	const equalsIndex = token.indexOf("=");
	if (equalsIndex !== -1) {
		const name = token.slice(0, equalsIndex);
		const value = token.slice(equalsIndex + 1);
		if (value.length === 0) {
			return { ok: false, message: `Missing value for option: ${name}` };
		}
		return { ok: true, consumedNext: false, name, value };
	}

	if (!token.startsWith("--")) {
		return { ok: false, message: `Unexpected argument: ${token}` };
	}

	if (nextToken === undefined || nextToken.startsWith("--")) {
		return { ok: false, message: `Missing value for option: ${token}` };
	}

	return { ok: true, consumedNext: true, name: token, value: nextToken };
}

function isDialect(value: string): value is ChatCoreSchemaDialect {
	return DIALECTS.some((dialect) => dialect === value);
}

function isIdStrategy(value: string): value is ChatCoreSchemaIdStrategy {
	return ID_STRATEGIES.some((strategy) => strategy === value);
}
