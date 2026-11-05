// Reads a standard five-field cron expression (minute, hour, day of month,
// month, day of week) into the sets of values it allows. Pure and offline.
// Supports `*`, lists (`1,15`), ranges (`1-5`), steps (`*/10`, `0-30/5`),
// month and weekday names, `7` as Sunday, and the `@hourly` family of macros.

import { Effect } from "effect";

import { CronSyntaxError } from "./errors.ts";

export type CronFieldName =
	| "minute"
	| "hour"
	| "dayOfMonth"
	| "month"
	| "dayOfWeek";

export const FIELD_NAMES: ReadonlyArray<CronFieldName> = [
	"minute",
	"hour",
	"dayOfMonth",
	"month",
	"dayOfWeek",
];

interface FieldSpec {
	readonly min: number;
	readonly max: number;
	readonly label: string;
	readonly names?: ReadonlyArray<string>;
	/** The value of the first name. Month names start at 1, weekday names at 0. */
	readonly namesFrom?: number;
}

export const FIELD_SPECS: Record<CronFieldName, FieldSpec> = {
	minute: { min: 0, max: 59, label: "minute" },
	hour: { min: 0, max: 23, label: "hour" },
	dayOfMonth: { min: 1, max: 31, label: "day of month" },
	month: {
		min: 1,
		max: 12,
		label: "month",
		names: [
			"jan",
			"feb",
			"mar",
			"apr",
			"may",
			"jun",
			"jul",
			"aug",
			"sep",
			"oct",
			"nov",
			"dec",
		],
		namesFrom: 1,
	},
	// 7 is accepted as Sunday and folded into 0 once the field is read.
	dayOfWeek: {
		min: 0,
		max: 7,
		label: "day of week",
		names: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
		namesFrom: 0,
	},
};

/** One comma-separated piece of a field: a value, a range or a stepped range. */
export interface CronPart {
	readonly from: number;
	readonly to: number;
	readonly step: number;
	/** The piece started with `*`. */
	readonly wild: boolean;
}

export interface CronField {
	readonly source: string;
	readonly parts: ReadonlyArray<CronPart>;
	/** Every allowed value, sorted, with weekday 7 folded into 0. */
	readonly values: ReadonlyArray<number>;
	/** The field is unrestricted, so every value is allowed. */
	readonly isAll: boolean;
	/** The source starts with `*`. Day matching treats such a field as "any". */
	readonly startsWithStar: boolean;
}

export interface CronSchedule {
	readonly minute: CronField;
	readonly hour: CronField;
	readonly dayOfMonth: CronField;
	readonly month: CronField;
	readonly dayOfWeek: CronField;
	/** The sets used by the next-run search. */
	readonly sets: Record<CronFieldName, ReadonlySet<number>>;
}

export const MACROS: Readonly<Record<string, string>> = {
	"@yearly": "0 0 1 1 *",
	"@annually": "0 0 1 1 *",
	"@monthly": "0 0 1 * *",
	"@weekly": "0 0 * * 0",
	"@daily": "0 0 * * *",
	"@midnight": "0 0 * * *",
	"@hourly": "0 * * * *",
};

const fail = (message: string, field?: CronFieldName) =>
	Effect.fail(new CronSyntaxError({ message, field }));

const readValue = (
	text: string,
	name: CronFieldName,
	spec: FieldSpec,
): Effect.Effect<number, CronSyntaxError> =>
	Effect.gen(function* () {
		if (/^\d+$/.test(text)) {
			const value = Number(text);

			if (value < spec.min || value > spec.max) {
				return yield* fail(
					`${text} is outside ${spec.min} to ${spec.max} for the ${spec.label} field.`,
					name,
				);
			}

			return value;
		}

		const index = spec.names?.indexOf(text.toLowerCase()) ?? -1;

		if (index >= 0) return index + (spec.namesFrom ?? 0);

		return yield* fail(
			spec.names
				? `"${text}" is not a number or a ${spec.label} name.`
				: `"${text}" is not a number. The ${spec.label} field takes ${spec.min} to ${spec.max}.`,
			name,
		);
	});

const readPart = (
	text: string,
	name: CronFieldName,
	spec: FieldSpec,
): Effect.Effect<CronPart, CronSyntaxError> =>
	Effect.gen(function* () {
		if (text === "") {
			return yield* fail("There is an empty entry in a list.", name);
		}

		const slash = text.split("/");

		if (slash.length > 2) {
			return yield* fail(`"${text}" has more than one step.`, name);
		}

		const [base = "", stepText] = slash;
		let step = 1;

		if (stepText !== undefined) {
			if (!/^\d+$/.test(stepText) || Number(stepText) < 1) {
				return yield* fail(
					`The step in "${text}" must be a whole number of 1 or more.`,
					name,
				);
			}

			step = Number(stepText);
		}

		if (base === "*") {
			return { from: spec.min, to: spec.max, step, wild: true };
		}

		const dash = base.split("-");

		if (dash.length > 2) {
			return yield* fail(`"${base}" has more than one dash.`, name);
		}

		const [startText = "", endText] = dash;
		const start = yield* readValue(startText, name, spec);

		if (endText === undefined) {
			// "5/15" runs from 5 to the top of the field, like Vixie cron.
			return {
				from: start,
				to: stepText === undefined ? start : spec.max,
				step,
				wild: false,
			};
		}

		const end = yield* readValue(endText, name, spec);

		if (start > end) {
			return yield* fail(
				`The range "${base}" runs backwards. Put the smaller value first.`,
				name,
			);
		}

		return { from: start, to: end, step, wild: false };
	});

const readField = (
	text: string,
	name: CronFieldName,
): Effect.Effect<CronField, CronSyntaxError> =>
	Effect.gen(function* () {
		const spec = FIELD_SPECS[name];
		const parts = yield* Effect.forEach(text.split(","), (piece) =>
			readPart(piece, name, spec),
		);
		const values = new Set<number>();

		for (const { from, to, step } of parts) {
			for (let value = from; value <= to; value += step) {
				values.add(name === "dayOfWeek" && value === 7 ? 0 : value);
			}
		}

		const sorted = [...values].sort((a, b) => a - b);
		const size = name === "dayOfWeek" ? 7 : spec.max - spec.min + 1;

		return {
			source: text,
			parts,
			values: sorted,
			isAll: sorted.length === size,
			startsWithStar: text.startsWith("*"),
		};
	});

/** Expands `@daily` and friends. Anything else comes back as it was. */
export function expandMacro(expression: string): string {
	return MACROS[expression.trim().toLowerCase()] ?? expression;
}

export const parseCron = (
	expression: string,
): Effect.Effect<CronSchedule, CronSyntaxError> =>
	Effect.gen(function* () {
		const trimmed = expression.trim();

		if (trimmed === "") {
			return yield* fail("Type a cron expression, like 0 9 * * 1-5.");
		}

		if (trimmed.toLowerCase() === "@reboot") {
			return yield* fail(
				"@reboot runs at startup, so it has no schedule to show.",
			);
		}

		const tokens = expandMacro(trimmed).split(/\s+/);

		if (tokens.length !== 5) {
			return yield* fail(
				tokens.length === 6 || tokens.length === 7
					? `This tool reads five fields. Drop the seconds${tokens.length === 7 ? " and year" : ""} field and try again.`
					: `A cron expression has five fields, and this one has ${tokens.length}.`,
			);
		}

		const [
			minuteText = "",
			hourText = "",
			dayText = "",
			monthText = "",
			weekdayText = "",
		] = tokens;
		const minute = yield* readField(minuteText, "minute");
		const hour = yield* readField(hourText, "hour");
		const dayOfMonth = yield* readField(dayText, "dayOfMonth");
		const month = yield* readField(monthText, "month");
		const dayOfWeek = yield* readField(weekdayText, "dayOfWeek");

		return {
			minute,
			hour,
			dayOfMonth,
			month,
			dayOfWeek,
			sets: {
				minute: new Set(minute.values),
				hour: new Set(hour.values),
				dayOfMonth: new Set(dayOfMonth.values),
				month: new Set(month.values),
				dayOfWeek: new Set(dayOfWeek.values),
			},
		};
	});
