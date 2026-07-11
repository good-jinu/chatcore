import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	entry: ["./src/index.ts", "./src/cli.ts"],
	format: ["esm"],
	platform: "node",
});
