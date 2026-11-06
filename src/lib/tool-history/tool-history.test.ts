import { Effect, Exit, Option } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";

import { makeFakeToolHistoryHost } from "./fakes.ts";
import {
	clearRecent,
	parseHistory,
	recordUse,
	serializeHistory,
	toggleFavourite,
	yourTools,
	yourToolsParts,
} from "./model.ts";
import { ToolHistory } from "./service.ts";
import { emptyHistory, MAX_RECENT, STORAGE_KEY } from "./shapes.ts";

// Runs one program against a fake host. The host's state is returned alongside
// so a test can read what was written.
const run = <A, E>(
	program: (history: typeof ToolHistory.Service) => Effect.Effect<A, E>,
	opts: Parameters<typeof makeFakeToolHistoryHost>[0] = {},
) => {
	const host = makeFakeToolHistoryHost(opts);

	const result = Effect.runPromiseExit(
		Effect.gen(function* () {
			const history = yield* ToolHistory;

			return yield* program(history);
		}).pipe(Effect.provide(ToolHistory.layerWith(host.layer))),
	);

	return { host, result };
};

describe("storage key", () => {
	it("is the one key the spec names", () => {
		expect(STORAGE_KEY).toBe("palico-tools");
	});
});

describe("parseHistory", () => {
	it("reads a missing value as empty", () => {
		expect(parseHistory(Option.none())).toEqual(emptyHistory);
	});

	it("reads garbage as empty", () => {
		for (const raw of ["", "not json", "null", "[]", '"x"', "{"]) {
			expect(parseHistory(Option.some(raw))).toEqual(emptyHistory);
		}
	});

	it("reads a wrong shape as empty", () => {
		const bad = [
			{ version: 2, favourites: [], recent: [] },
			{ version: 1, favourites: "/converter", recent: [] },
			{ version: 1, favourites: [], recent: [{ to: "/converter" }] },
			{ version: 1, favourites: [1], recent: [] },
			{ favourites: [], recent: [] },
		];

		for (const value of bad) {
			expect(parseHistory(Option.some(JSON.stringify(value)))).toEqual(
				emptyHistory,
			);
		}
	});

	it("reads a good value back as it was stored", () => {
		const value = {
			version: 1,
			favourites: ["/resizer"],
			recent: [{ to: "/converter", at: 5 }],
		};

		expect(parseHistory(Option.some(JSON.stringify(value)))).toEqual(value);
	});

	it("drops duplicates and caps recent, so edited storage cannot grow it", () => {
		const recent = Array.from({ length: 40 }, (_, i) => ({
			to: `/tool-${i % 20}`,
			at: i,
		}));

		const parsed = parseHistory(
			Option.some(
				JSON.stringify({ version: 1, favourites: ["/a", "/a"], recent }),
			),
		);

		expect(parsed.favourites).toEqual(["/a"]);
		expect(parsed.recent).toHaveLength(MAX_RECENT);
		expect(new Set(parsed.recent.map((use) => use.to)).size).toBe(MAX_RECENT);
	});

	it("round-trips through serializeHistory", () => {
		const value = recordUse(toggleFavourite(emptyHistory, "/a"), "/b", 9);

		expect(parseHistory(Option.some(serializeHistory(value)))).toEqual(value);
	});
});

describe("recordUse", () => {
	it("puts the newest first", () => {
		const data = recordUse(recordUse(emptyHistory, "/a", 1), "/b", 2);

		expect(data.recent).toEqual([
			{ to: "/b", at: 2 },
			{ to: "/a", at: 1 },
		]);
	});

	it("moves a repeat to the front without duplicating it", () => {
		const data = [
			["/a", 1],
			["/b", 2],
			["/a", 3],
		].reduce(
			(acc, [to, at]) => recordUse(acc, String(to), Number(at)),
			emptyHistory,
		);

		expect(data.recent).toEqual([
			{ to: "/a", at: 3 },
			{ to: "/b", at: 2 },
		]);
	});

	it("keeps the twelve most recent, newest first", () => {
		const data = Array.from({ length: 15 }, (_, i) => i).reduce(
			(acc, i) => recordUse(acc, `/tool-${i}`, i),
			emptyHistory,
		);

		expect(data.recent).toHaveLength(MAX_RECENT);
		expect(data.recent.map((use) => use.to).slice(0, 3)).toEqual([
			"/tool-14",
			"/tool-13",
			"/tool-12",
		]);
		expect(data.recent.at(-1)?.to).toBe("/tool-3");
	});

	it("does not touch favourites", () => {
		const data = recordUse(toggleFavourite(emptyHistory, "/a"), "/b", 1);

		expect(data.favourites).toEqual(["/a"]);
	});
});

describe("toggleFavourite", () => {
	it("adds at the end, then removes", () => {
		const two = toggleFavourite(toggleFavourite(emptyHistory, "/a"), "/b");

		expect(two.favourites).toEqual(["/a", "/b"]);
		expect(toggleFavourite(two, "/a").favourites).toEqual(["/b"]);
	});
});

describe("clearRecent", () => {
	it("empties recent and keeps favourites", () => {
		const data = clearRecent(
			recordUse(toggleFavourite(emptyHistory, "/a"), "/b", 1),
		);

		expect(data.recent).toEqual([]);
		expect(data.favourites).toEqual(["/a"]);
	});
});

describe("yourTools", () => {
	const known = new Set(["/a", "/b", "/c", "/d"]);

	it("lists favourites first, then recent without the starred ones", () => {
		const data = {
			version: 1 as const,
			favourites: ["/c", "/a"],
			recent: [
				{ to: "/a", at: 3 },
				{ to: "/d", at: 2 },
				{ to: "/b", at: 1 },
			],
		};

		expect(yourTools(data, known)).toEqual(["/c", "/a", "/d", "/b"]);
	});

	it("drops paths that are no longer a tool", () => {
		const data = {
			version: 1 as const,
			favourites: ["/gone", "/a"],
			recent: [{ to: "/also-gone", at: 1 }],
		};

		expect(yourTools(data, known)).toEqual(["/a"]);
	});

	it("is empty for a first-time visitor", () => {
		expect(yourTools(emptyHistory, known)).toEqual([]);
	});

	it("shows six recent tools after the starred ones are left out", () => {
		const paths = Array.from({ length: 12 }, (_, i) => `/tool-${i}`);
		const everything = new Set(paths);

		// Starring three recent tools must not leave the row short of six.
		const data = {
			version: 1 as const,
			favourites: ["/tool-0", "/tool-1", "/tool-2"],
			recent: paths.map((to, at) => ({ to, at })),
		};

		const parts = yourToolsParts(data, everything);

		expect(parts.favourites).toEqual(["/tool-0", "/tool-1", "/tool-2"]);
		expect(parts.recent).toEqual([
			"/tool-3",
			"/tool-4",
			"/tool-5",
			"/tool-6",
			"/tool-7",
			"/tool-8",
		]);
		expect(yourTools(data, everything)).toHaveLength(9);
	});

	it("has no recent part when every recent tool is starred", () => {
		const data = {
			version: 1 as const,
			favourites: ["/a", "/b"],
			recent: [
				{ to: "/b", at: 2 },
				{ to: "/a", at: 1 },
			],
		};

		expect(yourToolsParts(data, known).recent).toEqual([]);
	});
});

describe("ToolHistory service", () => {
	it("loads an empty history when nothing is stored", async () => {
		const { result } = run((history) => history.load);

		expect(await result).toEqual(Exit.succeed(emptyHistory));
	});

	it("treats a corrupt stored value as empty and overwrites it on the next write", async () => {
		const { result, host } = run((history) => history.toggleFavourite("/a"), {
			stored: "{{{",
		});

		const exit = await result;

		expect(Exit.isSuccess(exit)).toBe(true);
		expect(host.state.stored).toBe(
			JSON.stringify({ version: 1, favourites: ["/a"], recent: [] }),
		);
	});

	it("records a use with the clock time", async () => {
		const { result, host } = run((history) =>
			Effect.gen(function* () {
				yield* TestClock.setTime(1234);

				return yield* history.recordUse("/converter");
			}).pipe(Effect.provide(TestClock.layer())),
		);

		await result;

		expect(JSON.parse(host.state.stored ?? "null")).toEqual({
			version: 1,
			favourites: [],
			recent: [{ to: "/converter", at: 1234 }],
		});
	});

	it("builds on what is already stored, so tabs do not overwrite each other", async () => {
		const { result, host } = run(
			(history) =>
				Effect.gen(function* () {
					yield* history.recordUse("/b");

					return yield* history.toggleFavourite("/c");
				}),
			{
				stored: JSON.stringify({
					version: 1,
					favourites: ["/a"],
					recent: [{ to: "/z", at: 1 }],
				}),
			},
		);

		await result;

		const data = JSON.parse(host.state.stored ?? "null");

		expect(data.favourites).toEqual(["/a", "/c"]);
		expect(data.recent.map((use: { to: string }) => use.to)).toEqual([
			"/b",
			"/z",
		]);
	});

	it("clears recent and keeps favourites", async () => {
		const { result, host } = run((history) => history.clearRecent(), {
			stored: JSON.stringify({
				version: 1,
				favourites: ["/a"],
				recent: [{ to: "/b", at: 1 }],
			}),
		});

		await result;

		expect(host.state.stored).toBe(
			JSON.stringify({ version: 1, favourites: ["/a"], recent: [] }),
		);
	});

	it("stores paths only", async () => {
		const { result, host } = run((history) => history.recordUse("/converter"));

		await result;

		expect(Object.keys(JSON.parse(host.state.stored ?? "{}")).sort()).toEqual([
			"favourites",
			"recent",
			"version",
		]);
	});

	it("fails a read with ToolHistoryStorageError", async () => {
		const { result } = run((history) => history.load, { failRead: true });

		const exit = await result;

		expect(Exit.isFailure(exit)).toBe(true);
		expect(JSON.stringify(exit)).toContain("ToolHistoryStorageError");
	});

	it("fails a write with ToolHistoryStorageError and keeps what was stored", async () => {
		const before = JSON.stringify({
			version: 1,
			favourites: ["/a"],
			recent: [],
		});

		const { result, host } = run((history) => history.toggleFavourite("/b"), {
			stored: before,
			failWrite: true,
		});

		const exit = await result;

		expect(Exit.isFailure(exit)).toBe(true);
		expect(JSON.stringify(exit)).toContain("ToolHistoryStorageError");
		expect(host.state.writeAttempts).toBe(1);
		expect(host.state.stored).toBe(before);
	});
});
