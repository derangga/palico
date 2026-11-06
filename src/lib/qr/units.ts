import { m } from "#/paraglide/messages.js";

// Kept apart from tables.ts, which the decode worker imports. A worker has no
// active locale, so it must not reach the messages.

/** The unit a mode counts in, worded in the active language. */
export const unitLabel = (unit: "digits" | "characters" | "bytes"): string => {
	switch (unit) {
		case "digits":
			return m.qr_unit_digits();
		case "characters":
			return m.qr_unit_characters();
		case "bytes":
			return m.qr_unit_bytes();
	}
};
