import { describe, expect, it } from "vitest";

import {
	adviseOn,
	contrastRatio,
	densityOf,
	minPrintWidthCm,
	planFor,
} from "./guidance.ts";

const black = "#000000";
const white = "#ffffff";

describe("planFor", () => {
	it("reports the version, size and density", () => {
		const plan = planFor("HELLO WORLD", "M");

		expect(plan.version).toBe(1);
		expect(plan.modules).toBe(21);
		expect(plan.mode).toBe("alphanumeric");
		expect(plan.density).toBe("light");
	});

	it("has no version when the text cannot fit", () => {
		const plan = planFor("a".repeat(3000), "L");

		expect(plan.version).toBeUndefined();
		expect(plan.limit).toBe(2953);
		expect(plan.unit).toBe("bytes");
	});

	it("labels density by version", () => {
		expect(densityOf(5)).toBe("light");
		expect(densityOf(6)).toBe("medium");
		expect(densityOf(13)).toBe("dense");
	});
});

describe("contrastRatio", () => {
	it("gives 21 for black on white and 1 for identical colors", () => {
		expect(contrastRatio(black, white)).toBeCloseTo(21, 0);
		expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
	});

	it("ignores anything that is not #rrggbb", () => {
		expect(contrastRatio("red", white)).toBeUndefined();
		expect(contrastRatio("#fff", white)).toBeUndefined();
	});
});

describe("adviseOn", () => {
	const base = {
		text: "https://example.com",
		ecc: "M",
		foreground: black,
		background: white,
	} as const;

	it("says nothing for a short link with strong contrast", () => {
		expect(adviseOn(base)).toEqual([]);
	});

	it("says nothing for empty text", () => {
		expect(adviseOn({ ...base, text: "" })).toEqual([]);
	});

	it("flags text that is too long as an error", () => {
		const advice = adviseOn({ ...base, text: "a".repeat(3000) });

		expect(advice.map((a) => a.kind)).toEqual(["too-long"]);
		expect(advice[0]?.severity).toBe("error");
	});

	it("warns when the colors are too close", () => {
		const advice = adviseOn({
			...base,
			foreground: "#cccccc",
			background: white,
		});

		expect(advice.map((a) => a.kind)).toContain("contrast");
	});

	it("warns about inverted codes", () => {
		const advice = adviseOn({ ...base, foreground: white, background: black });

		expect(advice.map((a) => a.kind)).toContain("inverted");
	});

	it("suggests https:// for a bare domain", () => {
		expect(
			adviseOn({ ...base, text: "palico.rangga.site/qr" }).map((a) => a.kind),
		).toContain("bare-link");
		expect(
			adviseOn({ ...base, text: "hello world" }).map((a) => a.kind),
		).not.toContain("bare-link");
	});

	it("does not mistake numbers or file names for links", () => {
		const kinds = (text: string) =>
			adviseOn({ ...base, text }).map((a) => a.kind);

		expect(kinds("3.14")).not.toContain("bare-link");
		expect(kinds("1.2.3")).not.toContain("bare-link");
		expect(kinds("notes.txt")).not.toContain("bare-link");
		expect(kinds("example.com")).toContain("bare-link");
		expect(kinds("www.example.com")).toContain("bare-link");
	});

	it("keeps the too-long message steady while the text grows", () => {
		const message = (n: number) =>
			adviseOn({ ...base, text: "a".repeat(n) })[0]?.message;

		expect(message(3000)).toBe(message(4000));
	});

	it("gives a print size for dense codes", () => {
		const advice = adviseOn({ ...base, text: "x".repeat(700) });
		const dense = advice.find((a) => a.kind === "dense");

		expect(dense?.severity).toBe("tip");
		expect(dense?.message).toContain("cm");
	});
});

describe("minPrintWidthCm", () => {
	it("grows with the code and never goes below 1.5 cm", () => {
		expect(minPrintWidthCm(21)).toBeGreaterThanOrEqual(1.5);
		expect(minPrintWidthCm(97)).toBeGreaterThan(minPrintWidthCm(21));
	});
});
