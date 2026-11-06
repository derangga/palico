// Error text for the core, which runs in a worker that cannot import Paraglide
// (Vite's worker build has no Paraglide plugin). The page builds one template per
// message in the active language (see texts.ts) and hands the set in with the
// request. The core only fills in the `{name}` holes.

export type TextKey =
	| "json_unexpected_char"
	| "json_unexpected_end"
	| "json_single_quote"
	| "json_comment"
	| "json_trailing_comma"
	| "json_bad_escape"
	| "json_control_char"
	| "json_bad_number"
	| "json_trailing_data"
	| "json_too_deep"
	| "yaml_syntax"
	| "yaml_multiple_documents"
	| "yaml_anchor"
	| "yaml_tag"
	| "csv_unterminated"
	| "csv_after_quote"
	| "csv_ragged"
	| "table_not_list"
	| "table_not_list_hint"
	| "table_item"
	| "table_collision"
	| "too_large";

export type Texts = { readonly [Key in TextKey]: string };

export type TextParams = { readonly [name: string]: string | number };

/** The template for `key` with each `{name}` replaced by its value. */
export const say = (
	texts: Texts,
	key: TextKey,
	params: TextParams = {},
): string =>
	texts[key].replace(/\{(\w+)\}/g, (hole, name: string) =>
		String(params[name] ?? hole),
	);
