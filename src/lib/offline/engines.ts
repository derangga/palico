// The opt-in engines and how to ask each one "is it saved on this device?". The
// three isCached Effects already exist (ffmpeg, ZetaOffice) or sit beside the
// model cache; this file only gives them one shape.

import type { Effect } from "effect";

import {
	isEngineCached as isOfficeCached,
	OFFICE_CACHE_NAME,
	OFFICE_ENGINE_SIZE_LABEL,
} from "#/lib/file/office-types.ts";
import { isModelCached } from "#/lib/image/model-cache.ts";
import { ORT_ASSET_URLS } from "#/lib/image/ort-assets.ts";
import {
	isQpdfCached,
	QPDF_CACHE_NAME,
	QPDF_SIZE_LABEL,
	QPDF_WASM_BYTES,
} from "#/lib/qpdf/assets.ts";
import {
	CACHE_NAME as FFMPEG_CACHE_NAME,
	ENGINE_SIZE_LABEL as FFMPEG_SIZE_LABEL,
	isEngineCached as isFfmpegCached,
} from "#/lib/video/cache.ts";

import type { EngineId } from "./shapes.ts";

const MB = 1024 * 1024;

export interface EngineSpec {
	readonly id: EngineId;
	readonly sizeBytes: number;
	readonly sizeLabel: string;
	readonly isCached: Effect.Effect<boolean>;
}

export const ENGINES: Readonly<Record<EngineId, EngineSpec>> = {
	ffmpeg: {
		id: "ffmpeg",
		sizeBytes: 31 * MB,
		sizeLabel: FFMPEG_SIZE_LABEL,
		isCached: isFfmpegCached,
	},
	office: {
		id: "office",
		sizeBytes: 53 * MB,
		sizeLabel: OFFICE_ENGINE_SIZE_LABEL,
		isCached: isOfficeCached,
	},
	"bg-model": {
		id: "bg-model",
		// ~180 MB weights + ~21 MB ONNX Runtime.
		sizeBytes: 200 * MB,
		sizeLabel: "~200 MB",
		isCached: isModelCached(Object.values(ORT_ASSET_URLS)),
	},
	qpdf: {
		id: "qpdf",
		sizeBytes: QPDF_WASM_BYTES,
		sizeLabel: QPDF_SIZE_LABEL,
		isCached: isQpdfCached,
	},
};

// Current engine bucket names; anything else with the same prefix is stale.
export const CURRENT_ENGINE_BUCKETS = [
	FFMPEG_CACHE_NAME,
	OFFICE_CACHE_NAME,
	QPDF_CACHE_NAME,
];
