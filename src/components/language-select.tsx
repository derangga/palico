import { Schema } from "effect";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { DIFF_LANGUAGES, DiffLanguage } from "#/lib/file/types.ts";
import { m } from "#/paraglide/messages.js";

interface LanguageSelectProps {
	readonly value: DiffLanguage;
	readonly onChange: (value: DiffLanguage) => void;
	readonly className?: string;
}

export function LanguageSelect({
	value,
	onChange,
	className,
}: LanguageSelectProps) {
	// Language names stay as written, except plain text, which is not a name.
	const nameOf = (entry: { value: DiffLanguage; label: string }) =>
		entry.value === "text" ? m.diff_plain_text() : entry.label;

	const found = DIFF_LANGUAGES.find((l) => l.value === value);
	const label = found ? nameOf(found) : m.diff_plain_text();

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
