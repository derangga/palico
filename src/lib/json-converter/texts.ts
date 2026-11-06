import type { Locale } from "#/lib/i18n/shapes.ts";
import { m } from "#/paraglide/messages.js";

import type { Texts } from "./say.ts";

/**
 * Every core message as a template in one language. A parameter is passed as its
 * own `{name}` so it stays a hole for `say` to fill. Page side only: a worker
 * cannot import messages.
 */
export const messageTemplates = (locale: Locale): Texts => {
	const options = { locale };

	return {
		json_unexpected_char: m.jc_err_json_unexpected_char(
			{ char: "{char}" },
			options,
		),
		json_unexpected_end: m.jc_err_json_unexpected_end({}, options),
		json_single_quote: m.jc_err_json_single_quote({}, options),
		json_comment: m.jc_err_json_comment({}, options),
		json_trailing_comma: m.jc_err_json_trailing_comma({}, options),
		json_bad_escape: m.jc_err_json_bad_escape({}, options),
		json_control_char: m.jc_err_json_control_char({}, options),
		json_bad_number: m.jc_err_json_bad_number({}, options),
		json_trailing_data: m.jc_err_json_trailing_data({}, options),
		json_too_deep: m.jc_err_json_too_deep({}, options),
		yaml_syntax: m.jc_err_yaml_syntax({ detail: "{detail}" }, options),
		yaml_multiple_documents: m.jc_err_yaml_multiple_documents({}, options),
		yaml_anchor: m.jc_err_yaml_anchor({}, options),
		yaml_tag: m.jc_err_yaml_tag({ tag: "{tag}" }, options),
		csv_unterminated: m.jc_err_csv_unterminated({}, options),
		csv_after_quote: m.jc_err_csv_after_quote({}, options),
		csv_ragged: m.jc_err_csv_ragged(
			{ count: "{count}", expected: "{expected}" },
			options,
		),
		table_not_list: m.jc_err_shape_not_list({}, options),
		table_not_list_hint: m.jc_err_shape_not_list_hint(
			{ key: "{key}" },
			options,
		),
		table_item: m.jc_err_shape_item({ index: "{index}" }, options),
		table_collision: m.jc_err_shape_collision({ column: "{column}" }, options),
		too_large: m.jc_err_too_large(
			{ size: "{size}", limit: "{limit}" },
			options,
		),
	};
};
