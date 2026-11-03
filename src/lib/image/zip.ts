import { Effect } from "effect";
import { zip } from "fflate";

import { ZipError } from "./errors.ts";

// Bundle already-encoded image bytes into a single zip. Images are already
// compressed, so we store (level 0) rather than re-deflate — fast and lossless.
export const createZip = (
	files: Record<string, Uint8Array>,
): Effect.Effect<Blob, ZipError> =>
	Effect.callback<Blob, ZipError>((resume) => {
		zip(files, { level: 0 }, (err, data) => {
			if (err) {
				resume(Effect.fail(new ZipError({ message: err.message })));
			} else {
				resume(
					Effect.succeed(
						new Blob([data as BlobPart], { type: "application/zip" }),
					),
				);
			}
		});
	});
