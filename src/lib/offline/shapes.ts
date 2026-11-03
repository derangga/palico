import { Schema } from "effect";

export const EngineId = Schema.Literal("ffmpeg", "office", "bg-model");
export type EngineId = Schema.Schema.Type<typeof EngineId>;

// What a tool can promise about working offline right now.
export const OfflineStatus = Schema.Union(
	Schema.TaggedStruct("Ready", {}),
	// The worker is still installing (first visit).
	Schema.TaggedStruct("Preparing", {}),
	Schema.TaggedStruct("NeedsDownload", { sizeLabel: Schema.String }),
	// The engine was downloaded but the browser did not keep it.
	Schema.TaggedStruct("NotSaved", {}),
	Schema.TaggedStruct("Unavailable", { reason: Schema.String }),
);
export type OfflineStatus = Schema.Schema.Type<typeof OfflineStatus>;

// An active worker means the atomic precache install finished.
export const ShellState = Schema.Union(
	Schema.TaggedStruct("Unsupported", {}),
	Schema.TaggedStruct("Registering", {}),
	Schema.TaggedStruct("Installing", {}),
	Schema.TaggedStruct("Active", {}),
	Schema.TaggedStruct("Failed", { message: Schema.String }),
);
export type ShellState = Schema.Schema.Type<typeof ShellState>;

export const UpdateState = Schema.Literal("idle", "waiting", "applying");
export type UpdateState = Schema.Schema.Type<typeof UpdateState>;

// navigator.storage.estimate(): both fields are optional in some browsers.
export const StorageReport = Schema.Struct({
	quota: Schema.optional(Schema.Number),
	usage: Schema.optional(Schema.Number),
});
export type StorageReport = Schema.Schema.Type<typeof StorageReport>;
