import { Effect, Option } from "effect";
import { Check, Copy } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "#/components/ui/button.tsx";
import { useFlash } from "#/hooks/use-flash.ts";
import { copyText } from "#/lib/clipboard.ts";
import { toastOnExit } from "#/lib/exit-toast.ts";
import { m } from "#/paraglide/messages.js";

const FLASH_MS = 1800;

/**
 * A button that copies text and says "Copied" for a moment. The text is read on
 * click, so a long value is not built on every render.
 */
export function CopyTextButton({
	label,
	getText,
	copiedMessage,
	failureMessage,
	onCopied,
	className,
	variant,
}: {
	readonly label: string;
	readonly getText: () => string;
	/** Spoken to screen readers once the text is copied. */
	readonly copiedMessage: string;
	readonly failureMessage: string;
	/** Runs once the text is on the clipboard, not when the copy fails. */
	readonly onCopied?: () => void;
	readonly className?: string;
	readonly variant?: ComponentProps<typeof Button>["variant"];
}) {
	const [copied, flash] = useFlash(FLASH_MS);

	async function copy() {
		const exit = await Effect.runPromiseExit(copyText(getText()));

		if (Option.isSome(toastOnExit(exit, failureMessage))) {
			flash();
			onCopied?.();
		}
	}

	return (
		<>
			<Button onClick={copy} className={className} variant={variant}>
				{copied ? <Check /> : <Copy />}
				{copied ? m.copy_copied() : label}
			</Button>
			<output className="sr-only">{copied ? copiedMessage : ""}</output>
		</>
	);
}
