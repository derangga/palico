import { describe, expect, it } from "vitest";

import { boundariesOf, readClaims, windowAt } from "./claims.ts";

const read = (payload: Parameters<typeof readClaims>[0]) => {
	const reading = readClaims(payload);

	if (!reading) throw new Error("expected claims");

	return reading;
};

describe("readClaims", () => {
	it("reads time claims in a fixed order and turns seconds into milliseconds", () => {
		const { times } = read({ iat: 100, exp: 300, nbf: 200 });

		expect(times).toEqual([
			{ kind: "date", claim: "exp", millis: 300_000 },
			{ kind: "date", claim: "nbf", millis: 200_000 },
			{ kind: "date", claim: "iat", millis: 100_000 },
		]);
	});

	it("keeps a fraction of a second", () => {
		expect(read({ exp: 1.5 }).times).toEqual([
			{ kind: "date", claim: "exp", millis: 1500 },
		]);
	});

	it("shows a time claim that is not a number as it was written", () => {
		const { times } = read({ exp: "1700000000", nbf: null, iat: true });

		expect(times).toEqual([
			{ kind: "invalid", claim: "exp", raw: "1700000000" },
			{ kind: "invalid", claim: "nbf", raw: "null" },
			{ kind: "invalid", claim: "iat", raw: "true" },
		]);
	});

	it("shows a time past the range of a Date as invalid", () => {
		expect(read({ exp: 1e300 }).times[0]).toMatchObject({ kind: "invalid" });
		expect(read({ exp: 9_000_000_000_000 }).times[0]).toMatchObject({
			kind: "invalid",
		});
	});

	it("shows a big integer time as invalid, not as a date", () => {
		expect(read({ exp: 12345678901234567890n }).times[0]).toMatchObject({
			kind: "invalid",
			raw: "12345678901234567890",
		});
	});

	it("reads text claims, with an aud list as several values", () => {
		const { texts } = read({
			iss: "me",
			sub: "you",
			aud: ["a", "b"],
			jti: "x1",
		});

		expect(texts).toEqual([
			{ claim: "iss", values: ["me"] },
			{ claim: "sub", values: ["you"] },
			{ claim: "aud", values: ["a", "b"] },
			{ claim: "jti", values: ["x1"] },
		]);
	});

	it("writes a text claim that is not a string as JSON", () => {
		expect(read({ iss: { a: 1 }, sub: 5 }).texts).toEqual([
			{ claim: "iss", values: ['{"a":1}'] },
			{ claim: "sub", values: ["5"] },
		]);
	});

	it("shows an invalid UTF-8 marker as \\xHH", () => {
		expect(read({ iss: "caf" }).texts[0]?.values).toEqual(["caf\\xE9"]);
	});

	it("returns nothing for a payload that is not an object", () => {
		expect(readClaims([1, 2])).toBeUndefined();
		expect(readClaims("x")).toBeUndefined();
		expect(readClaims(null)).toBeUndefined();
	});

	it("returns empty lists when there are no registered claims", () => {
		expect(read({ role: "admin" })).toEqual({ times: [], texts: [] });
	});
});

describe("windowAt", () => {
	const { times } = read({ nbf: 1000, exp: 2000 });
	const second = 1000;

	it("is not yet valid before nbf", () => {
		expect(windowAt(times, 1000 * second - 1)).toBe("not-yet");
	});

	it("is valid at nbf", () => {
		expect(windowAt(times, 1000 * second)).toBe("valid");
	});

	it("is valid one millisecond before exp", () => {
		expect(windowAt(times, 2000 * second - 1)).toBe("valid");
	});

	it("is expired at exp, since exp is the first moment it must not be accepted", () => {
		expect(windowAt(times, 2000 * second)).toBe("expired");
	});

	it("is expired long after exp", () => {
		expect(windowAt(times, 9000 * second)).toBe("expired");
	});

	it("has no window when there is no exp or nbf", () => {
		expect(windowAt(read({ iat: 5 }).times, 10 * second)).toBe("none");
		expect(windowAt([], 0)).toBe("none");
	});

	it("uses exp alone", () => {
		const only = read({ exp: 10 }).times;

		expect(windowAt(only, 9_999)).toBe("valid");
		expect(windowAt(only, 10_000)).toBe("expired");
	});

	it("uses nbf alone", () => {
		const only = read({ nbf: 10 }).times;

		expect(windowAt(only, 9_999)).toBe("not-yet");
		expect(windowAt(only, 10_000)).toBe("valid");
	});

	it('does not call a time limit it cannot read "no limit"', () => {
		expect(windowAt(read({ exp: "soon" }).times, 1e12)).toBe("unreadable");
		expect(windowAt(read({ nbf: null }).times, 1e12)).toBe("unreadable");
		expect(windowAt(read({ exp: 1e300 }).times, 0)).toBe("unreadable");
	});

	it("still reports expired when the other limit is the unreadable one", () => {
		const times = read({ exp: 10, nbf: "soon" }).times;

		expect(windowAt(times, 11_000)).toBe("expired");
		expect(windowAt(times, 9_000)).toBe("unreadable");
	});

	it("ignores an unreadable iat, which sets no limit", () => {
		expect(windowAt(read({ iat: "yesterday" }).times, 0)).toBe("none");
	});
});

describe("boundariesOf", () => {
	it("lists exp and nbf, not iat", () => {
		expect(boundariesOf(read({ iat: 1, nbf: 2, exp: 3 }).times)).toEqual([
			3000, 2000,
		]);
	});
});
