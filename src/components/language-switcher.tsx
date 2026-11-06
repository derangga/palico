import { Globe } from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import { useLocale } from "#/hooks/use-locale.ts";
import { changeLocale } from "#/lib/i18n/locale.ts";
import { localeRuntime } from "#/lib/i18n/runtime.ts";
import { LOCALE_NAMES, LOCALES } from "#/lib/i18n/shapes.ts";
import { m } from "#/paraglide/messages.js";

export function LanguageSwitcher() {
	const locale = useLocale();
	const label = m.language_switcher_current({ language: LOCALE_NAMES[locale] });

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						aria-label={label}
						title={label}
						className="max-sm:size-9 max-sm:px-0"
					/>
				}
			>
				<Globe aria-hidden />
				<span
					aria-hidden
					className="text-xs font-semibold uppercase max-sm:hidden"
				>
					{locale}
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-44">
				<DropdownMenuRadioGroup
					value={locale}
					onValueChange={(next) => {
						void localeRuntime.runPromise(changeLocale(next));
					}}
				>
					{LOCALES.map((option) => (
						<DropdownMenuRadioItem
							key={option}
							value={option}
							lang={option}
							closeOnClick
						>
							{LOCALE_NAMES[option]}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
