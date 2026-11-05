import { type Tool, TOOLS } from "./tool-categories.ts";

const NOT_WORD = /[^\p{L}\p{N}]+/u;

/** True when some word of the text starts with the token. */
function hasWordStartingWith(text: string, token: string): boolean {
	return text
		.toLowerCase()
		.split(NOT_WORD)
		.some((word) => word.startsWith(token));
}

/**
 * How well one token matches one tool, or 0 when it does not match at all.
 * Label beats keywords, keywords beat the blurb. Only the label may match in the
 * middle of a word. Keywords and the blurb match at the start of a word, so "ai"
 * does not find "email" or "mermaid". See docs/search.md.
 */
function scoreToken(tool: Tool, token: string): number {
	const label = tool.label.toLowerCase();

	if (label.startsWith(token)) return 5;

	if (hasWordStartingWith(label, token)) return 4;

	if (label.includes(token)) return 3;

	if (tool.keywords.some((keyword) => hasWordStartingWith(keyword, token)))
		return 2;

	if (hasWordStartingWith(tool.blurb, token)) return 1;

	return 0;
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

	return tools
		.flatMap((tool) => {
			const scores = tokens.map((token) => scoreToken(tool, token));

			return scores.every((score) => score > 0)
				? [{ tool, score: scores.reduce((a, b) => a + b, 0) }]
				: [];
		})
		.sort((a, b) => b.score - a.score)
		.map(({ tool }) => tool);
}
