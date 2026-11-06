import { Schema } from "effect";

export const STORAGE_KEY = "palico-tools";

/**
 * How many recently used tools are stored. Larger than what the row shows, so
 * starring a recent tool, which takes it out of the recent part of the row,
 * does not leave the row short while older uses are still on record.
 */
export const MAX_RECENT = 12;

/** How many recently used tools the row shows, after starred ones are left out. */
export const SHOWN_RECENT = 6;

// Paths only. A file name, size or setting never goes in here.
const RecentUse = Schema.Struct({
	to: Schema.String,
	at: Schema.Number,
});

export type RecentUse = typeof RecentUse.Type;

export const ToolHistoryData = Schema.Struct({
	version: Schema.Literal(1),
	favourites: Schema.Array(Schema.String),
	/** Most recent first. */
	recent: Schema.Array(RecentUse),
});

export type ToolHistoryData = typeof ToolHistoryData.Type;

/** The stored string is JSON. This decodes and encodes it in one step. */
export const ToolHistoryJson = Schema.fromJsonString(ToolHistoryData);

export const emptyHistory: ToolHistoryData = {
	version: 1,
	favourites: [],
	recent: [],
};
