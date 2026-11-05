import { createFileRoute } from "@tanstack/react-router";

import { CronGenerator } from "#/components/cron/cron-generator.tsx";
import { seoHead } from "#/lib/seo.ts";

export const Route = createFileRoute("/cron-generator")({
	head: () => seoHead("/cron-generator"),
	component: CronGenerator,
});
