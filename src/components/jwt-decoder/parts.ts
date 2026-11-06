import { m } from "#/paraglide/messages.js";

/** The three parts of a token, in the order they are written. */
export type ColoredPart = "header" | "payload" | "signature";

export const PARTS: ReadonlyArray<ColoredPart> = [
	"header",
	"payload",
	"signature",
];

// Header and payload take the Developer pair as quiet tints. The signature stays
// neutral, so the page carries at most two accents. Every part is also named in
// text, so colour is never the only cue.
export const PART_STYLE: Record<
	ColoredPart,
	{ readonly tint: string; readonly strong: string; readonly dot: string }
> = {
	header: {
		tint: "bg-cat-developer/20",
		strong: "bg-cat-developer/45",
		dot: "bg-cat-developer",
	},
	payload: {
		tint: "bg-cat-developer-2/20",
		strong: "bg-cat-developer-2/45",
		dot: "bg-cat-developer-2",
	},
	signature: {
		tint: "bg-foreground/10",
		strong: "bg-foreground/25",
		dot: "bg-foreground/40",
	},
};

export const cardTitle = (part: ColoredPart): string => {
	switch (part) {
		case "header":
			return m.jwt_card_header();
		case "payload":
			return m.jwt_card_payload();
		case "signature":
			return m.jwt_card_signature();
	}
};
