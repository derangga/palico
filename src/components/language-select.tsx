import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { DIFF_LANGUAGES, type DiffLanguage } from "#/lib/file/types.ts";

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
	const label =
		DIFF_LANGUAGES.find((l) => l.value === value)?.label ?? "Plain Text";
	return (
		<Select
			value={value}
			onValueChange={(next) => onChange((next as DiffLanguage) ?? "text")}
		>
			<SelectTrigger className={className ?? "w-44"} size="sm">
				<SelectValue>{() => label}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{DIFF_LANGUAGES.map((l) => (
					<SelectItem key={l.value} value={l.value}>
						{l.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
