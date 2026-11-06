import { describe, expect, it } from "vitest";

import { yourToolsScript } from "./prepaint.ts";
import { STORAGE_KEY } from "./shapes.ts";

const KNOWN = ["/a", "/b", "/c", "/d", "/e", "/f", "/g", "/h"];

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

describe("yourToolsScript", () => {
	it("does nothing for a first-time visitor", () => {
		expect(run(null).dataset).toEqual({});
	});

	it("does nothing for junk, a wrong version, or blocked storage", () => {
		expect(run("{{{").dataset).toEqual({});
		expect(run('{"version":2,"favourites":[],"recent":[]}').dataset).toEqual(
			{},
		);
		expect(run(value([], [])).dataset).toEqual({});
		expect(run(null, { throws: true }).dataset).toEqual({});
	});

	it("reserves rows for starred plus unstarred recent tools", () => {
		const { props, dataset } = run(value(["/a", "/b"], ["/b", "/c", "/d"]));

		// /a, /b, /c, /d
		expect(dataset.yourTools).toBe("1");
		expect(props.get("--yt-rows-2")).toBe("2");
		expect(props.get("--yt-rows-3")).toBe("2");
	});

	it("ignores paths that are not tools", () => {
		const { props } = run(value(["/gone"], ["/a"]));

		expect(props.get("--yt-rows-2")).toBe("1");
	});

	it("caps recent at six, like the row does", () => {
		const { props } = run(value([], KNOWN));

		// 8 recent in storage, 6 shown
		expect(props.get("--yt-rows-2")).toBe("3");
		expect(props.get("--yt-rows-3")).toBe("2");
	});

	it("counts the six recent tools that are not starred", () => {
		// /a is starred and recent. 7 recent tools are not starred, 6 are shown.
		const { props } = run(value(["/a"], KNOWN));

		// 1 starred + 6 recent
		expect(props.get("--yt-rows-2")).toBe("4");
		expect(props.get("--yt-rows-3")).toBe("3");
	});
});
