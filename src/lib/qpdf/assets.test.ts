import { readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CURRENT_ENGINE_BUCKETS } from "#/lib/offline/engines.ts";
import { staleEngineBuckets } from "#/lib/offline/storage.ts";

import { QPDF_CACHE_NAME, QPDF_WASM_BYTES } from "./assets.ts";

const pkg = JSON.parse(
	readFileSync("node_modules/@neslinesli93/qpdf-wasm/package.json", "utf8"),
);

describe("qpdf engine assets", () => {
	it("names the cache bucket after the installed package version", () => {
		// A package bump must change the bucket, so old wasm is not served for new glue.
		expect(QPDF_CACHE_NAME).toBe(`palico-qpdf-v${pkg.version}`);
	});

	it("pins the package version in package.json", () => {
		const own = JSON.parse(readFileSync("package.json", "utf8"));

		expect(own.dependencies["@neslinesli93/qpdf-wasm"]).toBe(pkg.version);
	});

	it("knows the real size of the wasm, for the download percentage", () => {
		const real = statSync(
			"node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm",
		).size;

		expect(QPDF_WASM_BYTES).toBe(real);
	});

	it("keeps the current bucket and drops an old version", () => {
		expect(CURRENT_ENGINE_BUCKETS).toContain(QPDF_CACHE_NAME);

		expect(
			staleEngineBuckets([
				QPDF_CACHE_NAME,
				"palico-qpdf-v0.0.1",
				"palico-model-v1",
			]),
		).toEqual(["palico-qpdf-v0.0.1"]);
	});
});
