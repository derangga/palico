// Turns camera or screenshot pixels into a grid of dark and light modules.
// Photos have uneven light, so there are three strategies and the decoder
// tries each one until a code reads.

export interface Frame {
	readonly width: number;
	readonly height: number;
	/** RGBA bytes, row-major, like ImageData.data. */
	readonly data: Uint8ClampedArray;
}

export interface Gray {
	readonly width: number;
	readonly height: number;
	readonly data: Uint8Array;
}

export interface BitGrid {
	readonly width: number;
	readonly height: number;
	/** 1 is dark. */
	readonly bits: Uint8Array;
}

/** Luma, with transparent pixels treated as white paper. */
export function toGray(frame: Frame): Gray {
	const { width, height, data } = frame;
	const gray = new Uint8Array(width * height);

	for (let i = 0; i < gray.length; i++) {
		const o = i * 4;
		const luma =
			(data[o]! * 299 + data[o + 1]! * 587 + data[o + 2]! * 114) / 1000;
		const alpha = data[o + 3]! / 255;

		gray[i] = luma * alpha + 255 * (1 - alpha);
	}

	return { width, height, data: gray };
}

/** Box-average down by an integer factor. Keeps thin modules from aliasing away. */
export function shrink(gray: Gray, factor: number): Gray {
	if (factor <= 1) return gray;

	const width = Math.floor(gray.width / factor);
	const height = Math.floor(gray.height / factor);
	const data = new Uint8Array(width * height);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sum = 0;

			for (let dy = 0; dy < factor; dy++) {
				const row = (y * factor + dy) * gray.width + x * factor;

				for (let dx = 0; dx < factor; dx++) sum += gray.data[row + dx]!;
			}

			data[y * width + x] = sum / (factor * factor);
		}
	}

	return { width, height, data };
}

/**
 * A pixel is dark when it is clearly darker than the average of the window
 * around it. The window is a fraction of the image so a large flat dark block
 * (the middle of a finder pattern) still sits below its surroundings.
 */
export function adaptiveBits(gray: Gray, divisor: number): BitGrid {
	const { width, height, data } = gray;
	const stride = width + 1;
	const integral = new Uint32Array(stride * (height + 1));

	for (let y = 0; y < height; y++) {
		let rowSum = 0;

		for (let x = 0; x < width; x++) {
			rowSum += data[y * width + x]!;
			integral[(y + 1) * stride + x + 1] =
				integral[y * stride + x + 1]! + rowSum;
		}
	}

	const half = Math.max(8, Math.floor(Math.max(width, height) / divisor));
	const bits = new Uint8Array(width * height);

	for (let y = 0; y < height; y++) {
		const y0 = Math.max(0, y - half);
		const y1 = Math.min(height, y + half + 1);

		for (let x = 0; x < width; x++) {
			const x0 = Math.max(0, x - half);
			const x1 = Math.min(width, x + half + 1);
			const sum =
				integral[y1 * stride + x1]! -
				integral[y0 * stride + x1]! -
				integral[y1 * stride + x0]! +
				integral[y0 * stride + x0]!;
			const mean = sum / ((x1 - x0) * (y1 - y0));

			bits[y * width + x] = data[y * width + x]! * 100 < mean * 85 ? 1 : 0;
		}
	}

	return { width, height, bits };
}

/** One global threshold, picked to split the histogram into two tight groups. */
export function otsuBits(gray: Gray): BitGrid {
	const { width, height, data } = gray;
	const histogram = new Uint32Array(256);

	for (const value of data) histogram[value]!++;

	let weightedTotal = 0;

	for (let i = 0; i < 256; i++) weightedTotal += i * histogram[i]!;

	let backgroundWeight = 0;
	let backgroundSum = 0;
	let best = 0;
	let bestVariance = -1;

	for (let t = 0; t < 256; t++) {
		backgroundWeight += histogram[t]!;

		if (backgroundWeight === 0) continue;

		const foregroundWeight = data.length - backgroundWeight;

		if (foregroundWeight === 0) break;

		backgroundSum += t * histogram[t]!;

		const backgroundMean = backgroundSum / backgroundWeight;
		const foregroundMean = (weightedTotal - backgroundSum) / foregroundWeight;
		const variance =
			backgroundWeight *
			foregroundWeight *
			(backgroundMean - foregroundMean) ** 2;

		if (variance > bestVariance) {
			bestVariance = variance;
			best = t;
		}
	}

	const bits = new Uint8Array(data.length);

	for (let i = 0; i < data.length; i++) bits[i] = data[i]! <= best ? 1 : 0;

	return { width, height, bits };
}

/** Light-on-dark codes read as dark-on-light once flipped. */
export function invertBits(grid: BitGrid): BitGrid {
	const bits = new Uint8Array(grid.bits.length);

	for (let i = 0; i < bits.length; i++) bits[i] = grid.bits[i]! ^ 1;

	return { width: grid.width, height: grid.height, bits };
}
