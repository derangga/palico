import type { JsonValue } from "./types.ts";

export type JsonRecord = { readonly [key: string]: JsonValue };

/** A JSON object: not null and not a list. */
export const isRecord = (value: JsonValue): value is JsonRecord =>
	typeof value === "object" && value !== null && !Array.isArray(value);
