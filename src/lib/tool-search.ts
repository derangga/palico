import { BASE_LOCALE } from "./i18n/shapes.ts";
import { currentLocale } from "./i18n/state.ts";
import { type Tool, TOOLS, type ToolText } from "./tool-categories.ts";

const NOT_WORD = /[^\p{L}\p{N}]+/u;

/** True when some word of the text starts with the token. */
function hasWordStartingWith(text: string, token: string): boolean {
	return text
		.toLowerCase()
		.split(NOT_WORD)
		.some((word) => word.startsWith(token));
}

/**
 * How well one token matches one language's text of a tool, or 0 when it does
 * not match at all. Label beats keywords, keywords beat the blurb. Only the label
 * may match in the middle of a word. Keywords and the blurb match at the start of
 * a word, so "ai" does not find "email" or "mermaid". See docs/search.md.
 */
function scoreText(text: ToolText, token: string): number {
	const label = text.label.toLowerCase();

	if (label.startsWith(token)) return 5;

	if (hasWordStartingWith(label, token)) return 4;

	if (label.includes(token)) return 3;

	if (text.keywords.some((keyword) => hasWordStartingWith(keyword, token)))
		return 2;

	if (hasWordStartingWith(text.blurb, token)) return 1;

	return 0;
}

/**
 * The best score across the texts searched: the active language, and English
 * too when that is not the active one, so "compress" finds a tool whose
 * Indonesian name is "Kompres".
 */
function scoreToken(texts: ReadonlyArray<ToolText>, token: string): number {
	return Math.max(...texts.map((text) => scoreText(text, token)));
}

/**
 * Tools matching every word of the query, best match first. Ties keep registry
 * order. An empty query returns every tool in registry order.
 */
export function searchTools(
	query: string,
	tools: ReadonlyArray<Tool> = TOOLS,
): ReadonlyArray<Tool> {
	// Split on anything that is not a letter or digit, so "pdf-merge" finds
	// Merge PDFs.
	const tokens = query.toLowerCase().split(NOT_WORD).filter(Boolean);

	if (tokens.length === 0) return tools;

	const locale = currentLocale();

	return tools
		.flatMap((tool) => {
			const texts =
				locale === BASE_LOCALE
					? [tool.textIn(locale)]
					: [tool.textIn(locale), tool.textIn(BASE_LOCALE)];

			const scores = tokens.map((token) => scoreToken(texts, token));

			return scores.every((score) => score > 0)
				? [{ tool, score: scores.reduce((a, b) => a + b, 0) }]
				: [];
		})
		.sort((a, b) => b.score - a.score)
		.map(({ tool }) => tool);
}
