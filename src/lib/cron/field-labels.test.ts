import { describe, expect, it } from "vitest";

import { fieldAtCaret } from "./field-labels.ts";

describe("fieldAtCaret", () => {
	const text = "0 9 * * 1-5";

	it("counts the gaps before the caret", () => {
		expect(fieldAtCaret(text, 0)).toBe(0);
		expect(fieldAtCaret(text, 1)).toBe(0);
		expect(fieldAtCaret(text, 2)).toBe(1);
		expect(fieldAtCaret(text, 4)).toBe(2);
		expect(fieldAtCaret(text, text.length)).toBe(4);
	});

	it("puts the caret after a trailing space in the next field", () => {
		expect(fieldAtCaret("0 9 ", 4)).toBe(2);
	});

	it("stops at the fifth field", () => {
		expect(fieldAtCaret("0 9 * * 1 2 3", 13)).toBe(4);
	});

	it("does not count leading spaces as a field", () => {
		expect(fieldAtCaret("  0 9", 3)).toBe(0);
		expect(fieldAtCaret("  0 9", 5)).toBe(1);
		expect(fieldAtCaret("   ", 3)).toBe(0);
	});
});
