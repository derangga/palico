import { Effect, Exit, Option } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pickFromScreen } from "./eye-dropper.ts";

function stubEyeDropper(open: () => Promise<{ sRGBHex: string }>) {
	class FakeEyeDropper {
		open = open;
	}

	vi.stubGlobal("window", { EyeDropper: FakeEyeDropper });
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("pickFromScreen", () => {
	it("returns the color the person clicked", async () => {
		stubEyeDropper(async () => ({ sRGBHex: "#ff8800" }));

		const picked = await Effect.runPromise(
			pickFromScreen(new AbortController().signal),
		);

		expect(picked).toEqual(Option.some({ r: 255, g: 136, b: 0 }));
	});

	it("treats Esc as no color, not as an error", async () => {
		stubEyeDropper(async () => {
			throw new DOMException("cancelled", "AbortError");
		});

		const picked = await Effect.runPromise(
			pickFromScreen(new AbortController().signal),
		);

		expect(Option.isNone(picked)).toBe(true);
	});

	it("fails with a tagged error for any other failure", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		stubEyeDropper(async () => {
			throw new DOMException("denied", "NotAllowedError");
		});

		const exit = await Effect.runPromiseExit(
			pickFromScreen(new AbortController().signal),
		);

		expect(Exit.isFailure(exit)).toBe(true);
		expect(JSON.stringify(exit)).toContain("ScreenPickError");
	});

	it("fails when the browser returns something that is not a color", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		stubEyeDropper(async () => ({ sRGBHex: "not a color" }));

		const exit = await Effect.runPromiseExit(
			pickFromScreen(new AbortController().signal),
		);

		expect(Exit.isFailure(exit)).toBe(true);
	});
});
