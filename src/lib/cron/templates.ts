// Starting points for the generator. Each one is a plain expression, so picking
// one loads it into the builder and the person can change it from there.
import { m } from "#/paraglide/messages.js";

type TemplateGroup = "often" | "daily" | "weekly" | "monthly";

interface CronTemplate {
	readonly group: TemplateGroup;
	readonly label: string;
	readonly expression: string;
}

// Functions, because the labels depend on the active language and cannot be
// read when the module loads.
export const templates = (): ReadonlyArray<CronTemplate> => [
	{ group: "often", label: m.cron_tpl_every_minute(), expression: "* * * * *" },
	{
		group: "often",
		label: m.cron_tpl_every_5_minutes(),
		expression: "*/5 * * * *",
	},
	{ group: "often", label: m.cron_tpl_every_hour(), expression: "0 * * * *" },
	{ group: "daily", label: m.cron_tpl_midnight(), expression: "0 0 * * *" },
	{ group: "daily", label: m.cron_tpl_weekdays(), expression: "0 9 * * 1-5" },
	{ group: "weekly", label: m.cron_tpl_monday(), expression: "0 9 * * 1" },
	{ group: "weekly", label: m.cron_tpl_sunday(), expression: "0 2 * * 0" },
	{ group: "monthly", label: m.cron_tpl_first(), expression: "0 0 1 * *" },
];

const groupLabel = (group: TemplateGroup): string => {
	switch (group) {
		case "often":
			return m.cron_group_often();
		case "daily":
			return m.cron_group_daily();
		case "weekly":
			return m.cron_group_weekly();
		case "monthly":
			return m.cron_group_monthly();
	}
};

const GROUPS: ReadonlyArray<TemplateGroup> = [
	"often",
	"daily",
	"weekly",
	"monthly",
];

/** The templates under their group headings, in the order the list shows them. */
export const templatesByGroup = (): ReadonlyArray<{
	readonly group: TemplateGroup;
	readonly title: string;
	readonly templates: ReadonlyArray<CronTemplate>;
}> => {
	const all = templates();

	return GROUPS.map((group) => ({
		group,
		title: groupLabel(group),
		templates: all.filter((template) => template.group === group),
	}));
};

export const DEFAULT_EXPRESSION = "0 9 * * 1-5";
