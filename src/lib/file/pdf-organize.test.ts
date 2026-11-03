import { degrees, PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { applyRotations } from "./pdf-organize.ts";

describe("applyRotations", () => {
	it("adds the delta to the stored rotation and wraps at 360", async () => {
		const doc = await PDFDocument.create();
		const stored90 = doc.addPage([200, 300]);
		stored90.setRotation(degrees(90));
		const plain = doc.addPage([200, 300]);
		const untouched = doc.addPage([200, 300]);
		untouched.setRotation(degrees(180));

		applyRotations([stored90, plain, untouched], [270, 90, 0]);

		expect(stored90.getRotation().angle).toBe(0);
		expect(plain.getRotation().angle).toBe(90);
		expect(untouched.getRotation().angle).toBe(180);
	});

	it("rejects a rotation list that does not match the pages", async () => {
		const doc = await PDFDocument.create();
		const page = doc.addPage();
		expect(() => applyRotations([page], [90, 90])).toThrow();
	});
});
