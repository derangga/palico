import { Schema } from "effect";

// Failures of the offline layer. The service worker is optional: every one of
// these is handled by falling back to today's online-only behavior.

export class SwUnsupportedError extends Schema.TaggedError<SwUnsupportedError>()(
	"SwUnsupportedError",
	{
		message: Schema.String,
	},
) {}

export class SwRegistrationError extends Schema.TaggedError<SwRegistrationError>()(
	"SwRegistrationError",
	{
		stage: Schema.Literals(["load", "register"]),
		message: Schema.String,
	},
) {}

export class SwUpdateError extends Schema.TaggedError<SwUpdateError>()(
	"SwUpdateError",
	{
		message: Schema.String,
	},
) {}

// A job is running, so the new version must wait.
export class UpdateBlockedError extends Schema.TaggedError<UpdateBlockedError>()(
	"UpdateBlockedError",
	{
		busy: Schema.Number,
		message: Schema.String,
	},
) {}

// Not enough free storage for an engine download.
export class StorageQuotaError extends Schema.TaggedError<StorageQuotaError>()(
	"StorageQuotaError",
	{
		needed: Schema.Number,
		available: Schema.Number,
		message: Schema.String,
	},
) {}

export class StorageUnavailableError extends Schema.TaggedError<StorageUnavailableError>()(
	"StorageUnavailableError",
	{
		message: Schema.String,
	},
) {}

export class OfflineCacheError extends Schema.TaggedError<OfflineCacheError>()(
	"OfflineCacheError",
	{
		op: Schema.Literals(["keys", "delete"]),
		message: Schema.String,
	},
) {}
