// Starting points for the generator. Each one is a plain expression, so picking
// it fills the five fields and the person can edit from there.
export const PRESETS: ReadonlyArray<{
	readonly label: string;
	readonly expression: string;
}> = [
	{ label: "Every minute", expression: "* * * * *" },
	{ label: "Every 5 minutes", expression: "*/5 * * * *" },
	{ label: "Every hour", expression: "0 * * * *" },
	{ label: "Every day at midnight", expression: "0 0 * * *" },
	{ label: "Weekdays at 9:00", expression: "0 9 * * 1-5" },
	{ label: "Every Monday at 9:00", expression: "0 9 * * 1" },
	{ label: "First of the month", expression: "0 0 1 * *" },
	{ label: "Every Sunday at 2:00", expression: "0 2 * * 0" },
];
