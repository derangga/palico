import { Effect } from "effect";
import { type Unzipped, unzip } from "fflate";

import { m } from "#/paraglide/messages.js";

import { HandoffUnzipError } from "./errors.ts";
import { typeFromName } from "./mime.ts";

const fail = () => new HandoffUnzipError({ message: m.handoff_unzip_failed() });

/**
 * The files inside a zip a tool made, in zip order, each typed from its name.
 * Folders are skipped and paths dropped. Runs only when the person picks a
 * target, so a result that is never sent is never unpacked.
 */
export const filesFromZip = Effect.fn("Handoff.filesFromZip")(function* (
	zip: Blob,
) {
	const buffer = yield* Effect.tryPromise({
		try: () => zip.arrayBuffer(),
		catch: fail,
	});

	const entries = yield* Effect.callback<Unzipped, HandoffUnzipError>(
		(resume) => {
			unzip(new Uint8Array(buffer), (err, data) => {
				resume(err ? Effect.fail(fail()) : Effect.succeed(data));
			});
		},
	);

	return Object.entries(entries).flatMap(([path, bytes]) => {
		if (path.endsWith("/")) return [];

		const name = path.split("/").pop() ?? path;

		// SAFETY: fflate allocates its output with new Uint8Array, so it is backed
		// by a plain ArrayBuffer, never a SharedArrayBuffer.
		const data = bytes as Uint8Array<ArrayBuffer>;

		return [new File([data], name, { type: typeFromName(name) })];
	});
});

/** A zip for "Send to...": `count` files of `type`, unpacked when a target is picked. */
export const zippedOutputs = (zip: Blob, type: string, count: number) => ({
	type,
	count,
	load: filesFromZip(zip),
});
