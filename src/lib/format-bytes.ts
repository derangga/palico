import { currentLocale } from "#/lib/i18n/state.ts";

const KB = 1024;
const MB = KB * KB;

/** A decimal number in the active language: "1.50" in English, "1,50" in Indonesian. */
export const formatDecimal = (value: number, digits: number): string =>
	new Intl.NumberFormat(currentLocale(), {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	}).format(value);

/** A file size as "512 B", "1.5 KB" or "1.50 MB", with the decimal mark of the active language. */
export function formatBytes(n: number): string {
	if (n < KB) return `${n} B`;

	if (n < MB) return `${formatDecimal(n / KB, 1)} KB`;

	return `${formatDecimal(n / MB, 2)} MB`;
}
