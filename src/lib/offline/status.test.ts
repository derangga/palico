import { describe, expect, it } from "vitest";

import { OfflineStatus, ShellState } from "./shapes.ts";
import { computeStatus } from "./status.ts";

const engine = { sizeLabel: "~31 MB" };

describe("computeStatus", () => {
	it("reports unavailable when workers are unsupported or failed", () => {
		expect(
			computeStatus({
				shell: ShellState.cases.Unsupported.make({}),
				notSaved: false,
			})._tag,
		).toBe("Unavailable");
		expect(
			computeStatus({
				shell: ShellState.cases.Failed.make({ message: "x" }),
				notSaved: false,
			})._tag,
		).toBe("Unavailable");
	});

	it("reports preparing while the worker installs", () => {
		for (const shell of [
			ShellState.cases.Registering.make({}),
			ShellState.cases.Installing.make({}),
		]) {
			expect(computeStatus({ shell, notSaved: false })._tag).toBe("Preparing");
		}
	});

	it("is ready for a tool without an engine once the shell is active", () => {
		expect(
			computeStatus({
				shell: ShellState.cases.Active.make({}),
				notSaved: false,
			}),
		).toEqual(OfflineStatus.cases.Ready.make({}));
	});

	it("waits for the first engine check", () => {
		expect(
			computeStatus({
				shell: ShellState.cases.Active.make({}),
				engine,
				notSaved: false,
			})._tag,
		).toBe("Preparing");
	});

	it("is ready when the engine is saved", () => {
		expect(
			computeStatus({
				shell: ShellState.cases.Active.make({}),
				engine,
				cached: true,
				notSaved: false,
			})._tag,
		).toBe("Ready");
	});

	it("asks for a download when the engine is missing", () => {
		expect(
			computeStatus({
				shell: ShellState.cases.Active.make({}),
				engine,
				cached: false,
				notSaved: false,
			}),
		).toEqual(OfflineStatus.cases.NeedsDownload.make({ sizeLabel: "~31 MB" }));
	});

	it("reports NotSaved when a finished download did not stick", () => {
		expect(
			computeStatus({
				shell: ShellState.cases.Active.make({}),
				engine,
				cached: false,
				notSaved: true,
			})._tag,
		).toBe("NotSaved");
	});

	describe("shell Off", () => {
		const shell = ShellState.cases.Off.make({});

		it("is Off for a tool without an engine", () => {
			expect(computeStatus({ shell, notSaved: false })).toEqual(
				OfflineStatus.cases.Off.make({}),
			);
		});

		it("is Preparing until the engine check finishes", () => {
			expect(computeStatus({ shell, engine, notSaved: false })._tag).toBe(
				"Preparing",
			);
		});

		it("asks for a download when the engine is missing", () => {
			expect(
				computeStatus({ shell, engine, cached: false, notSaved: false }),
			).toEqual(
				OfflineStatus.cases.NeedsDownload.make({ sizeLabel: "~31 MB" }),
			);
		});

		it("reports NotSaved when a finished download did not stick", () => {
			expect(
				computeStatus({ shell, engine, cached: false, notSaved: true })._tag,
			).toBe("NotSaved");
		});

		it("is Off when the engine is saved but the shell is not", () => {
			expect(
				computeStatus({ shell, engine, cached: true, notSaved: false })._tag,
			).toBe("Off");
		});
	});
});
