import { describe, expect, it } from "vitest";

import { computeStatus } from "./status.ts";

const engine = { sizeLabel: "~31 MB" };

describe("computeStatus", () => {
	it("reports unavailable when workers are unsupported or failed", () => {
		expect(
			computeStatus({ shell: { _tag: "Unsupported" }, notSaved: false })._tag,
		).toBe("Unavailable");
		expect(
			computeStatus({
				shell: { _tag: "Failed", message: "x" },
				notSaved: false,
			})._tag,
		).toBe("Unavailable");
	});

	it("reports preparing while the worker installs", () => {
		for (const _tag of ["Registering", "Installing"] as const) {
			expect(computeStatus({ shell: { _tag }, notSaved: false })._tag).toBe(
				"Preparing",
			);
		}
	});

	it("is ready for a tool without an engine once the shell is active", () => {
		expect(
			computeStatus({ shell: { _tag: "Active" }, notSaved: false }),
		).toEqual({ _tag: "Ready" });
	});

	it("waits for the first engine check", () => {
		expect(
			computeStatus({ shell: { _tag: "Active" }, engine, notSaved: false })
				._tag,
		).toBe("Preparing");
	});

	it("is ready when the engine is saved", () => {
		expect(
			computeStatus({
				shell: { _tag: "Active" },
				engine,
				cached: true,
				notSaved: false,
			})._tag,
		).toBe("Ready");
	});

	it("asks for a download when the engine is missing", () => {
		expect(
			computeStatus({
				shell: { _tag: "Active" },
				engine,
				cached: false,
				notSaved: false,
			}),
		).toEqual({ _tag: "NeedsDownload", sizeLabel: "~31 MB" });
	});

	it("reports NotSaved when a finished download did not stick", () => {
		expect(
			computeStatus({
				shell: { _tag: "Active" },
				engine,
				cached: false,
				notSaved: true,
			})._tag,
		).toBe("NotSaved");
	});
});
