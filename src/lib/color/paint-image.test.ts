import { Effect, Exit } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_FILE_BYTES } from "#/lib/image/types.ts";

import { paintImage } from "./paint-image.ts";

interface FakeContext {
	clearRect(): void;
	drawImage(): void;
}

function fakeCanvas(context: FakeContext | null): HTMLCanvasElement {
	// SAFETY: paintImage reads a canvas only through width, height and getContext,
	// and node has no canvas to construct, so a stand-in with those three stands in.
	// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the stand-in has none of the canvas's other 300 members, so TypeScript needs the hop through unknown.
	return {
		width: 0,
		height: 0,
		getContext: () => context,
	} as unknown as HTMLCanvasElement;
}

// The size-limit and decode paths end before any drawing, so this is never used.
const canvas = fakeCanvas(null);

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("paintImage", () => {
	it("refuses a file over the size limit before decoding it", async () => {
		const decode = vi.fn();

		vi.stubGlobal("createImageBitmap", decode);

		const big = new File([new Uint8Array(MAX_FILE_BYTES + 1)], "big.png", {
			type: "image/png",
		});

		const exit = await Effect.runPromiseExit(paintImage(big, canvas));

		expect(Exit.isFailure(exit)).toBe(true);
		expect(JSON.stringify(exit)).toContain("FileTooLargeError");
		expect(decode).not.toHaveBeenCalled();
	});

	it("fails with a tagged error when the file cannot be decoded", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.stubGlobal("createImageBitmap", async () => {
			throw new Error("not an image");
		});

		const file = new File(["x"], "broken.png", { type: "image/png" });
		const exit = await Effect.runPromiseExit(paintImage(file, canvas));

		expect(Exit.isFailure(exit)).toBe(true);
		expect(JSON.stringify(exit)).toContain("ColorImageError");
	});

	it("closes the bitmap even when drawing fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});

		const close = vi.fn();

		vi.stubGlobal("createImageBitmap", async () => ({
			width: 10,
			height: 10,
			close,
		}));

		// No 2D context, so drawing fails after the decode succeeded.
		const file = new File(["x"], "pic.png", { type: "image/png" });

		const exit = await Effect.runPromiseExit(
			paintImage(file, fakeCanvas(null)),
		);

		expect(Exit.isFailure(exit)).toBe(true);
		expect(close).toHaveBeenCalledTimes(1);
	});

	it("shrinks a large image and closes the original", async () => {
		const closed: Array<string> = [];

		vi.stubGlobal(
			"createImageBitmap",
			async (
				_source: Blob,
				options?: { resizeWidth?: number; resizeHeight?: number },
			) =>
				options
					? {
							width: options.resizeWidth,
							height: options.resizeHeight,
							close: () => closed.push("resized"),
						}
					: { width: 8192, height: 4096, close: () => closed.push("original") },
		);

		const target = fakeCanvas({ clearRect() {}, drawImage() {} });

		const file = new File(["x"], "wide.png", { type: "image/png" });
		const painted = await Effect.runPromise(paintImage(file, target));

		expect(painted).toMatchObject({ width: 4096, height: 2048, shrunk: true });
		expect(target.width).toBe(4096);
		expect(closed.sort()).toEqual(["original", "resized"]);
	});

	it("fails when the browser ignores the resize and returns the full size", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});

		const closed = vi.fn();

		vi.stubGlobal("createImageBitmap", async () => ({
			width: 8192,
			height: 4096,
			close: closed,
		}));

		const file = new File(["x"], "wide.png", { type: "image/png" });
		const exit = await Effect.runPromiseExit(paintImage(file, canvas));

		expect(Exit.isFailure(exit)).toBe(true);
		// Both the original and the unshrunk copy are released.
		expect(closed).toHaveBeenCalledTimes(2);
	});
});
