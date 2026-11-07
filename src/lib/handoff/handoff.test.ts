import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { TOOLS } from "#/lib/tool-categories.ts";

import { putEntry, takeEntry } from "./client.ts";
import { makeFakeHandoff } from "./fakes.ts";
import {
	acceptsAll,
	buildSendMenu,
	type MenuTool,
	matchesType,
} from "./menu.ts";
import type { HandoffEntry } from "./shapes.ts";

const pdf = () => new File(["%PDF"], "a.pdf", { type: "application/pdf" });

const entry = (): HandoffEntry => ({ files: [pdf()], from: "pdf_password" });

const run = <A, E>(
	program: Effect.Effect<A, E, never>,
): Promise<Exit.Exit<A, E>> => Effect.runPromiseExit(program);

describe("Handoff put and take", () => {
	it("returns the entry once, then fails with HandoffMissingError", async () => {
		const fake = makeFakeHandoff();
		const sent = entry();

		const result = await run(
			Effect.gen(function* () {
				const id = yield* putEntry(sent);
				const first = yield* takeEntry(id);
				const second = yield* Effect.flip(takeEntry(id));

				return { id, first, second };
			}).pipe(Effect.provide(fake.layer)),
		);

		expect(Exit.isSuccess(result)).toBe(true);

		if (!Exit.isSuccess(result)) return;

		expect(result.value.id).toMatch(/^[a-z0-9]{8}$/);
		expect(result.value.first).toBe(sent);
		expect(result.value.second._tag).toBe("HandoffMissingError");
		expect(fake.store.size).toBe(0);
	});

	it("keeps only the newest put, so an entry nobody took does not pile up", async () => {
		const fake = makeFakeHandoff();
		const newer = entry();

		const result = await run(
			Effect.gen(function* () {
				const older = yield* putEntry(entry());
				const latest = yield* putEntry(newer);
				const gone = yield* Effect.flip(takeEntry(older));
				const kept = yield* takeEntry(latest);

				return { older, latest, gone, kept };
			}).pipe(Effect.provide(fake.layer)),
		);

		expect(Exit.isSuccess(result)).toBe(true);

		if (!Exit.isSuccess(result)) return;

		expect(result.value.older).not.toBe(result.value.latest);
		expect(result.value.gone._tag).toBe("HandoffMissingError");
		expect(result.value.kept).toBe(newer);
		expect(fake.store.size).toBe(0);
	});

	it("fails with HandoffMissingError after a reload empties memory", async () => {
		// An id that was valid before the reload. The new page has a fresh Map.
		const fake = makeFakeHandoff();

		const result = await run(
			takeEntry("abcd1234").pipe(Effect.provide(fake.layer)),
		);

		expect(Exit.isFailure(result)).toBe(true);
		expect(Exit.isFailure(result) && JSON.stringify(result.cause)).toContain(
			"HandoffMissingError",
		);
	});

	it("treats a param that is not an id as missing, without touching the store", async () => {
		const fake = makeFakeHandoff([["abcd1234", entry()]]);

		for (const raw of ["", "ABCD1234", "abcd123", "abcd12345", "../abcd12"]) {
			const result = await run(takeEntry(raw).pipe(Effect.provide(fake.layer)));

			expect(Exit.isFailure(result)).toBe(true);
		}

		expect(fake.store.size).toBe(1);
	});
});

describe("matchesType", () => {
	it("matches exact types and wildcards, ignoring case", () => {
		expect(matchesType("application/pdf", "application/pdf")).toBe(true);
		expect(matchesType("image/*", "image/png")).toBe(true);
		expect(matchesType("image/*", "IMAGE/WEBP")).toBe(true);
		expect(matchesType("image/*", "video/mp4")).toBe(false);
		expect(matchesType("image/png", "image/jpeg")).toBe(false);
	});

	it("never matches a file with no type", () => {
		expect(matchesType("image/*", "")).toBe(false);
	});
});

describe("acceptsAll", () => {
	it("needs every type to match, and at least one type", () => {
		const tool = { accepts: ["image/jpeg", "application/pdf"] };

		expect(acceptsAll(tool, ["image/jpeg", "application/pdf"])).toBe(true);
		expect(acceptsAll(tool, ["image/jpeg", "image/gif"])).toBe(false);
		expect(acceptsAll(tool, [])).toBe(false);
		expect(acceptsAll({ accepts: [] }, ["image/png"])).toBe(false);
	});
});

const ids = (tools: ReadonlyArray<MenuTool>) => tools.map((tool) => tool.id);

describe("buildSendMenu", () => {
	it("lists next first, in its order, then the other matches in registry order", () => {
		const menu = buildSendMenu(TOOLS, "pdf_password", ["application/pdf"]);

		expect(ids(menu.suggested)).toEqual([
			"pdf_compress",
			"pdf_organize",
			"pdf_to_images",
		]);
		expect(ids(menu.others)).toEqual([
			"pdf_split",
			"pdf_merge",
			"strip_metadata",
		]);
	});

	it("never lists the source tool", () => {
		const menu = buildSendMenu(TOOLS, "pdf_compress", ["application/pdf"]);
		const all = [...ids(menu.suggested), ...ids(menu.others)];

		expect(all).not.toContain("pdf_compress");
		expect(all).toContain("pdf_password");
	});

	it("drops a next entry that does not take the output", () => {
		// Strip metadata suggests the PDF compressor, which does not take images.
		const menu = buildSendMenu(TOOLS, "strip_metadata", ["image/jpeg"]);

		expect(ids(menu.suggested)).toEqual(["compressor", "converter"]);
		expect(ids(menu.others)).not.toContain("pdf_compress");
	});

	it("lists only tools that take every output of a mixed batch", () => {
		const menu = buildSendMenu(TOOLS, "strip_metadata", [
			"image/jpeg",
			"application/pdf",
		]);

		expect(menu.suggested).toEqual([]);
		expect(menu.others).toEqual([]);
	});

	it("is empty when nothing takes the output", () => {
		const menu = buildSendMenu(TOOLS, "audio_cutter", ["audio/mpeg"]);

		expect(menu.suggested).toEqual([]);
		expect(menu.others).toEqual([]);
	});

	it("follows the registry, so a tool joins by filling in accepts", () => {
		const tools: ReadonlyArray<MenuTool> = [
			{ id: "video_cutter", accepts: ["video/*"], next: ["video_to_gif"] },
			{ id: "video_to_gif", accepts: ["video/*"], next: [] },
			{ id: "converter", accepts: ["image/*"], next: [] },
			{ id: "video_compressor", accepts: [], next: [] },
		];

		const before = buildSendMenu(tools, "video_cutter", ["video/mp4"]);

		expect(ids(before.others)).toEqual([]);

		const after = buildSendMenu(
			tools.map((tool) =>
				tool.id === "video_compressor"
					? { ...tool, accepts: ["video/*"] }
					: tool,
			),
			"video_cutter",
			["video/mp4"],
		);

		expect(ids(after.suggested)).toEqual(["video_to_gif"]);
		expect(ids(after.others)).toEqual(["video_compressor"]);
	});
});

describe("registry", () => {
	it("names only real tools in every next list", () => {
		const known = new Set(ids(TOOLS));

		for (const tool of TOOLS) {
			for (const id of tool.next) expect(known.has(id)).toBe(true);
		}
	});

	it("never suggests a tool as its own next step", () => {
		for (const tool of TOOLS) expect(tool.next).not.toContain(tool.id);
	});
});
