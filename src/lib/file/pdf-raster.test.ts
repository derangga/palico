import { describe, expect, it } from "vitest";

import {
	MAX_RASTER_PAGE_PIXELS,
	memberName,
	rasterSize,
} from "./pdf-raster.ts";

const A4 = [595.28, 841.89] as const;
const A0 = [2383.94, 3370.39] as const;

describe("rasterSize", () => {
	it("maps 150 DPI on A4 to 1240 x 1754", () => {
		expect(rasterSize(A4[0], A4[1], 150)).toMatchObject({
			width: 1240,
			height: 1754,
		});
	});

	it("leaves A4 at 300 DPI unclamped", () => {
		const { width, height, scale } = rasterSize(A4[0], A4[1], 300);
		expect(scale).toBeCloseTo(300 / 72);
		expect(width * height).toBeLessThan(MAX_RASTER_PAGE_PIXELS);
	});

	it("clamps a large page to the per-page canvas limit, keeping its shape", () => {
		const { width, height } = rasterSize(A0[0], A0[1], 300);
		expect(width * height).toBeLessThanOrEqual(MAX_RASTER_PAGE_PIXELS);
		expect(width / height).toBeCloseTo(A0[0] / A0[1], 2);
	});
});

describe("memberName", () => {
	it("pads to the page count's width", () => {
		expect(memberName("report", 6, 100, "png")).toBe("report_page_007.png");
		expect(memberName("report", 0, 9, "jpg")).toBe("report_page_1.jpg");
	});
});
