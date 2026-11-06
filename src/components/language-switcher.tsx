import { Globe } from "lucide-react";
import { type ComponentProps, useState } from "react";

import { OptionList } from "#/components/option-list.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "#/components/ui/drawer.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import { useLocale } from "#/hooks/use-locale.ts";
import { useIsMobile } from "#/hooks/use-mobile.ts";
import { changeLocale } from "#/lib/i18n/locale.ts";
import { localeRuntime } from "#/lib/i18n/runtime.ts";
import { LOCALE_NAMES, LOCALES, type Locale } from "#/lib/i18n/shapes.ts";
import { m } from "#/paraglide/messages.js";

const switchTo = (next: Locale) => {
	void localeRuntime.runPromise(changeLocale(next));
};

// The same button opens either menu, so it is built once.
// It spreads the rest of its props, which the trigger injects (ref, handlers, aria).
function SwitcherButton({
	locale,
	label,
	...props
}: ComponentProps<typeof Button> & { locale: Locale; label: string }) {
	return (
		<Button
			variant="ghost"
			aria-label={label}
			title={label}
			className="max-sm:size-9 max-sm:px-0"
			{...props}
		>
			<Globe aria-hidden />
			<span
				aria-hidden
				className="text-xs font-semibold uppercase max-sm:hidden"
			>
				{locale}
			</span>
		</Button>
	);
}

/**
 * Switches the app language. A phone gets a bottom sheet with a tappable list.
 * Larger screens keep the dropdown.
 */
export function LanguageSwitcher() {
	const locale = useLocale();
	const isMobile = useIsMobile();
	const [open, setOpen] = useState(false);
	const label = m.language_switcher_current({ language: LOCALE_NAMES[locale] });

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={setOpen}>
				<DrawerTrigger
					render={<SwitcherButton locale={locale} label={label} />}
				/>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>{m.language_switcher_title()}</DrawerTitle>
					</DrawerHeader>
					<OptionList
						options={LOCALES.map((option) => ({
							value: option,
							label: LOCALE_NAMES[option],
							lang: option,
						}))}
						value={locale}
						onPick={(next) => {
							switchTo(next);
							setOpen(false);
						}}
					/>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<SwitcherButton locale={locale} label={label} />}
			/>
			<DropdownMenuContent align="end" className="min-w-44">
				<DropdownMenuRadioGroup
					value={locale}
					onValueChange={(next) => switchTo(next)}
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
