import { createFileRoute } from "@tanstack/react-router";

import { ColorPicker } from "#/components/color/color-picker.tsx";
import { seoHead } from "#/lib/seo.ts";

export const Route = createFileRoute("/color-picker")({
	head: () => seoHead("/color-picker"),
	component: ColorPicker,
});
