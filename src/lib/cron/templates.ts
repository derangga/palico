// Starting points for the generator. Each one is a plain expression, so picking
// one loads it into the builder and the person can change it from there.
type TemplateGroup = "Often" | "Daily" | "Weekly" | "Monthly";

interface CronTemplate {
	readonly group: TemplateGroup;
	readonly label: string;
	readonly expression: string;
}

export const TEMPLATES: ReadonlyArray<CronTemplate> = [
	{ group: "Often", label: "Every minute", expression: "* * * * *" },
	{ group: "Often", label: "Every 5 minutes", expression: "*/5 * * * *" },
	{ group: "Often", label: "Every hour", expression: "0 * * * *" },
	{ group: "Daily", label: "Every day at midnight", expression: "0 0 * * *" },
	{ group: "Daily", label: "Weekdays at 9:00", expression: "0 9 * * 1-5" },
	{ group: "Weekly", label: "Every Monday at 9:00", expression: "0 9 * * 1" },
	{ group: "Weekly", label: "Every Sunday at 2:00", expression: "0 2 * * 0" },
	{ group: "Monthly", label: "First of the month", expression: "0 0 1 * *" },
];

const GROUPS: ReadonlyArray<TemplateGroup> = [
	"Often",
	"Daily",
	"Weekly",
	"Monthly",
];

/** The templates under their group headings, in the order the list shows them. */
export const TEMPLATES_BY_GROUP: ReadonlyArray<{
	readonly group: TemplateGroup;
	readonly templates: ReadonlyArray<CronTemplate>;
}> = GROUPS.map((group) => ({
	group,
	templates: TEMPLATES.filter((template) => template.group === group),
}));

export const DEFAULT_EXPRESSION = "0 9 * * 1-5";
