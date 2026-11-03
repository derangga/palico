import { Schema } from "effect";

export const EngineId = Schema.Literals(["ffmpeg", "office", "bg-model"]);

export type EngineId = Schema.Schema.Type<typeof EngineId>;

// What a tool can promise about working offline right now.
export const OfflineStatus = Schema.TaggedUnion({
	Ready: {},
	// The worker is still installing (first visit).
	Preparing: {},
	NeedsDownload: { sizeLabel: Schema.String },
	// The engine was downloaded but the browser did not keep it.
	NotSaved: {},
	Unavailable: { reason: Schema.String },
});

export type OfflineStatus = Schema.Schema.Type<typeof OfflineStatus>;

// An active worker means the atomic precache install finished.
export const ShellState = Schema.TaggedUnion({
	Unsupported: {},
	Registering: {},
	Installing: {},
	Active: {},
	Failed: { message: Schema.String },
});

export type ShellState = Schema.Schema.Type<typeof ShellState>;

export const UpdateState = Schema.Literals(["idle", "waiting", "applying"]);

export type UpdateState = Schema.Schema.Type<typeof UpdateState>;

// navigator.storage.estimate(): both fields are optional in some browsers.
export const StorageReport = Schema.Struct({
	quota: Schema.optional(Schema.Number),
	usage: Schema.optional(Schema.Number),
});

export type StorageReport = Schema.Schema.Type<typeof StorageReport>;
