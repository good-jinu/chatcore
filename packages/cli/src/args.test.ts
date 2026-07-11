import { describe, expect, it } from "vitest";
import { parseCliArgs } from "./args";

describe("parseCliArgs", () => {
	it("parses schema generation options", () => {
		expect(
			parseCliArgs([
				"schema",
				"generate",
				"--dialect",
				"sqlite",
				"--out=./schema.sql",
				"--id-strategy",
				"string",
			]),
		).toEqual({
			ok: true,
			command: {
				type: "schema-generate",
				options: {
					dialect: "sqlite",
					idStrategy: "string",
					out: "./schema.sql",
				},
			},
		});
	});

	it("requires an explicit dialect", () => {
		expect(parseCliArgs(["schema", "generate"])).toEqual({
			ok: false,
			message: "Missing required option: --dialect <mysql|postgres|sqlite>",
		});
	});

	it("rejects unknown commands", () => {
		expect(parseCliArgs(["generate"])).toEqual({
			ok: false,
			message: "Unknown command: generate",
		});
	});
});
