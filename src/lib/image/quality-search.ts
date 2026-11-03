// Find the highest encode quality whose output fits under a byte budget.
// Runs inside the image worker so the source is decoded once and only
// re-encoded per pass. Kept free of Effect so the worker bundle stays small.

// Hard cap on encodes per image: 2 bracketing passes plus 6 halvings. Over the
// 0.10 to 0.95 range that lands within ~0.014 of the best quality.
export const COMPRESS_MAX_PASSES = 8;
export const COMPRESS_MIN_QUALITY = 0.1;

export type QualitySearchResult = {
	blob: Blob;
	quality: number;
	targetMet: boolean;
	passes: number;
};

export const searchQuality = async (
	encode: (quality: number) => Promise<Blob>,
	opts: {
		targetBytes: number;
		max: number;
		min?: number;
		maxPasses?: number;
	},
): Promise<QualitySearchResult> => {
	const { targetBytes, max } = opts;
	const min = opts.min ?? COMPRESS_MIN_QUALITY;
	const maxPasses = opts.maxPasses ?? COMPRESS_MAX_PASSES;

	const top = await encode(max);

	if (top.size <= targetBytes) {
		return { blob: top, quality: max, targetMet: true, passes: 1 };
	}

	if (max <= min || maxPasses < 2) {
		return { blob: top, quality: max, targetMet: false, passes: 1 };
	}

	const bottom = await encode(min);

	if (bottom.size > targetBytes) {
		return { blob: bottom, quality: min, targetMet: false, passes: 2 };
	}

	// Invariant: lo fits, hi does not.
	let best = { blob: bottom, quality: min };
	let lo = min;
	let hi = max;
	let passes = 2;

	while (passes < maxPasses) {
		const q = (lo + hi) / 2;
		const blob = await encode(q);
		passes++;

		if (blob.size <= targetBytes) {
			best = { blob, quality: q };
			lo = q;
		} else {
			hi = q;
		}
	}

	return { ...best, targetMet: true, passes };
};
