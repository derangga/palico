import { Schema } from "effect";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { OptionList } from "#/components/option-list.tsx";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "#/components/ui/drawer.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { useIsMobile } from "#/hooks/use-mobile.ts";
import { DIFF_LANGUAGES, DiffLanguage } from "#/lib/file/types.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

interface LanguageSelectProps {
	readonly value: DiffLanguage;
	readonly onChange: (value: DiffLanguage) => void;
	readonly className?: string;
}

// Language names stay as written, except plain text, which is not a name.
const nameOf = (entry: { value: DiffLanguage; label: string }) =>
	entry.value === "text" ? m.diff_plain_text() : entry.label;

/**
 * Picks the highlight language. A phone gets a bottom sheet with a tappable
 * list, since a small dropdown is hard to hit. Larger screens keep the select.
 */
export function LanguageSelect({
	value,
	onChange,
	className,
}: LanguageSelectProps) {
	const isMobile = useIsMobile();
	const [open, setOpen] = useState(false);

	const found = DIFF_LANGUAGES.find((l) => l.value === value);
	const label = found ? nameOf(found) : m.diff_plain_text();

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={setOpen}>
				<DrawerTrigger
					aria-label={m.diff_language_label()}
					className={cn(
						"flex h-11 w-40 items-center justify-between gap-1.5 rounded-md border border-input bg-background pr-2 pl-2.5 text-sm whitespace-nowrap shadow-xs transition-[color,border-color,box-shadow,scale] duration-150 ease-out outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] motion-reduce:active:scale-100",
						className,
					)}
				>
					<span className="line-clamp-1 text-left">{label}</span>
					<ChevronDown
						aria-hidden
						className="size-4 shrink-0 text-muted-foreground"
					/>
				</DrawerTrigger>
				{/* The list is long, so the sheet stops at half the screen and scrolls. */}
				<DrawerContent className="max-h-[50dvh]">
					<DrawerHeader>
						<DrawerTitle>{m.diff_language_label()}</DrawerTitle>
					</DrawerHeader>
					<OptionList
						options={DIFF_LANGUAGES.map((l) => ({
							value: l.value,
							label: nameOf(l),
						}))}
						value={value}
						onPick={(next) => {
							onChange(next);
							setOpen(false);
						}}
					/>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Select
			value={value}
			onValueChange={(next) =>
				onChange(Schema.is(DiffLanguage)(next) ? next : "text")
			}
		>
			<SelectTrigger className={className ?? "w-44"} size="sm">
				<SelectValue>{() => label}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{DIFF_LANGUAGES.map((l) => (
					<SelectItem key={l.value} value={l.value}>
						{nameOf(l)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
