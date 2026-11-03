import { degrees, type PDFPage } from "pdf-lib";

import type { Rotation } from "./pdf-types.ts";

// Organize PDF. Each rotation is a delta ADDED to the page's stored /Rotate:
// the thumbnails come from pdf.js, which already shows the stored rotation, so
// what the user saw is the baseline. Imported lazily by pdf.worker.ts.
export const applyRotations = (
	pages: ReadonlyArray<PDFPage>,
	rotations: ReadonlyArray<Rotation>,
): void => {
	if (rotations.length !== pages.length) {
		throw new Error(
			`Got ${rotations.length} rotations for ${pages.length} pages.`,
		);
	}
	pages.forEach((page, i) => {
		const delta = rotations[i];
		if (delta === 0) return;
		page.setRotation(degrees((page.getRotation().angle + delta) % 360));
	});
};
