/** The 1-based line and column of a character offset in `text`. */
export function positionAt(
	text: string,
	offset: number,
): { readonly line: number; readonly column: number } {
	let line = 1;
	let lastBreak = -1;

	for (let at = 0; at < offset && at < text.length; at++) {
		if (text.charCodeAt(at) === 10) {
			line++;
			lastBreak = at;
		}
	}

	return { line, column: offset - lastBreak };
}

/** The character offset of a 1-based line and column, clamped to the text. */
export function offsetAt(text: string, line: number, column: number): number {
	let offset = 0;

	for (let current = 1; current < line; current++) {
		const next = text.indexOf("\n", offset);

		if (next < 0) return text.length;

		offset = next + 1;
	}

	return Math.min(offset + column - 1, text.length);
}
