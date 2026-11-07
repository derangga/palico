import { Option } from "effect";
import { describe, expect, it } from "vitest";

import { parseHistory, yourToolsParts } from "./model.ts";
import { yourToolsScript } from "./prepaint.ts";
import { STORAGE_KEY } from "./shapes.ts";

const KNOWN = ["/a", "/b", "/c", "/d", "/e", "/f", "/g", "/h", "/i", "/j"];

// Runs the script against stand-ins for localStorage and <html>.
const run = (stored: string | null, opts: { throws?: boolean } = {}) => {
	const props = new Map<string, string>();
	const dataset: Record<string, string> = {};

	const localStorage = {
		getItem: (key: string) => {
			if (opts.throws) throw new Error("blocked");

			return key === STORAGE_KEY ? stored : null;
		},
	};

	const document = {
		documentElement: {
			dataset,
			style: { setProperty: (k: string, v: number) => props.set(k, String(v)) },
		},
	};

	new Function("localStorage", "document", yourToolsScript(KNOWN))(
		localStorage,
		document,
	);

	return { props, dataset };
};

const value = (favourites: string[], recent: string[]) =>
	JSON.stringify({
		version: 1,
		favourites,
		recent: recent.map((to, at) => ({ to, at })),
	});

// What the script wrote, as numbers: favourites rows, recent rows at 2 and 3
// columns, and the sections shown.
const rows = (stored: string | null) => {
	const { props } = run(stored);

	return {
		fav: [props.get("--yt-fav-2"), props.get("--yt-fav-3")],
		rec: [props.get("--yt-rec-2"), props.get("--yt-rec-3")],
		sections: props.get("--yt-sections"),
	};
};

const none = { fav: [undefined, undefined], rec: [undefined, undefined] };

describe("yourToolsScript", () => {
	it("does nothing for neither favourites nor recent", () => {
		expect(run(null).dataset).toEqual({});
		expect(run(value([], [])).dataset).toEqual({});
		expect(run(value([], [])).props.size).toBe(0);
	});

	it("does nothing for junk, a wrong version, or blocked storage", () => {
		expect(run("{{{").dataset).toEqual({});
		expect(run('{"version":2,"favourites":[],"recent":[]}').dataset).toEqual(
			{},
		);
		expect(run(null, { throws: true }).dataset).toEqual({});
		expect(run(null, { throws: true }).props.size).toBe(0);
	});

	it("reads a value that does not match the Schema as empty", () => {
		// A bad entry makes the whole value read as empty, like parseHistory.
		expect(run('{"version":1,"favourites":[1],"recent":[]}').dataset).toEqual(
			{},
		);
		expect(
			run('{"version":1,"favourites":["/a"],"recent":[{"to":"/b"}]}').dataset,
		).toEqual({});
		expect(
			run('{"version":1,"favourites":["/a"],"recent":[null]}').dataset,
		).toEqual({});
	});

	it("marks a visitor with only favourites as returning, one section", () => {
		const { dataset } = run(value(["/a", "/b", "/c", "/d"], []));

		expect(dataset).toEqual({ yourTools: "1", returning: "1" });
		expect(rows(value(["/a", "/b", "/c", "/d"], []))).toEqual({
			fav: ["2", "2"],
			rec: ["0", "0"],
			sections: "1",
		});
	});

	it("reserves two sections for favourites plus recent", () => {
		// /b is starred, so it is not in the recent part: /c, /d, /e are.
		expect(rows(value(["/a", "/b"], ["/b", "/c", "/d", "/e"]))).toEqual({
			fav: ["1", "1"],
			rec: ["2", "1"],
			sections: "2",
		});
	});

	it("shows one section when every recent tool is also starred", () => {
		// Recent is stored but every entry is a favourite, so none is left to show.
		const stored = value(["/a", "/b"], ["/a", "/b"]);

		expect(run(stored).dataset).toEqual({ yourTools: "1", returning: "1" });
		expect(rows(stored)).toEqual({
			fav: ["1", "1"],
			rec: ["0", "0"],
			sections: "1",
		});
	});

	it("counts the hint tile as one full-width favourites row", () => {
		// No favourites but recent tools: the Favourites section holds the hint.
		const stored = value([], ["/a", "/b", "/c", "/d", "/e"]);

		expect(run(stored).dataset).toEqual({ yourTools: "1", returning: "1" });
		expect(rows(stored)).toEqual({
			fav: ["1", "1"],
			rec: ["3", "2"],
			sections: "2",
		});
	});

	it("ignores paths that are not tools", () => {
		// The unknown favourite is dropped, so only /a (recent) shows, with the hint.
		expect(rows(value(["/gone"], ["/a"]))).toEqual({
			fav: ["1", "1"],
			rec: ["1", "1"],
			sections: "2",
		});

		// Nothing known at all: nothing is reserved.
		expect(run(value(["/gone"], ["/also-gone"])).dataset).toEqual({});
	});

	it("caps recent at six, like the row does", () => {
		const { fav, rec, sections } = rows(
			value([], ["/a", "/b", "/c", "/d", "/e", "/f", "/g", "/h"]),
		);

		// 8 recent in storage, 6 shown, plus the hint
		expect(fav).toEqual(["1", "1"]);
		expect(rec).toEqual(["3", "2"]);
		expect(sections).toBe("2");
	});

	it("counts the six recent tools that are not starred", () => {
		// /a is starred and recent. 7 other recent tools, 6 are shown.
		expect(rows(value(["/a"], KNOWN.slice(0, 8)))).toEqual({
			fav: ["1", "1"],
			rec: ["3", "2"],
			sections: "2",
		});
	});

	it("cuts recent to twelve before leaving unknown tools out", () => {
		// Nine unknown paths come first, so only /a, /b and /c are inside the first
		// twelve. /d and /e are stored but past the cap.
		const recent = [
			..."123456789".split("").map((n) => "/gone" + n),
			"/a",
			"/b",
			"/c",
			"/d",
			"/e",
		];

		expect(rows(value([], recent))).toEqual({
			fav: ["1", "1"],
			rec: ["2", "1"],
			sections: "2",
		});
	});

	it("drops repeats in both lists", () => {
		expect(rows(value(["/a", "/a"], ["/b", "/b", "/c"]))).toEqual({
			fav: ["1", "1"],
			rec: ["1", "1"],
			sections: "2",
		});
	});

	it("shows nothing for a first-time visitor", () => {
		expect(rows(null)).toMatchObject(none);
	});

	it("agrees with yourToolsParts on a spread of histories", () => {
		const known = new Set(KNOWN);

		const cases: Array<[string[], string[]]> = [
			[[], []],
			[["/a"], []],
			[[], ["/a"]],
			[
				["/a", "/b", "/c"],
				["/c", "/d"],
			],
			[["/z"], ["/z", "/a", "/b", "/c", "/d", "/e", "/f", "/g", "/h", "/i"]],
			[
				["/a", "/b", "/c", "/d", "/e", "/f", "/g"],
				["/h", "/i", "/j", "/a"],
			],
			[
				["/a"],
				[
					"/q1",
					"/q2",
					"/q3",
					"/q4",
					"/q5",
					"/q6",
					"/q7",
					"/q8",
					"/q9",
					"/q10",
					"/q11",
					"/a",
					"/b",
					"/c",
				],
			],
		];

		for (const [favourites, recent] of cases) {
			const stored = value(favourites, recent);
			const parts = yourToolsParts(parseHistory(Option.some(stored)), known);
			const { props, dataset } = run(stored);
			const shown = parts.favourites.length + parts.recent.length > 0;

			expect(dataset.returning === "1").toBe(shown);

			if (!shown) continue;

			for (const columns of [2, 3]) {
				expect(Number(props.get(`--yt-fav-${columns}`))).toBe(
					Math.max(1, Math.ceil(parts.favourites.length / columns)),
				);
				expect(Number(props.get(`--yt-rec-${columns}`))).toBe(
					Math.ceil(parts.recent.length / columns),
				);
			}

			expect(props.get("--yt-sections")).toBe(
				parts.recent.length > 0 ? "2" : "1",
			);
		}
	});
});
