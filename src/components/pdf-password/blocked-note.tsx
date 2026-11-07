import { CircleAlert } from "lucide-react";

// A condition that retrying will not fix, said beside the form.
export function BlockedNote({ message }: { readonly message: string }) {
	return (
		<p
			role="alert"
			className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm"
		>
			<CircleAlert
				aria-hidden
				className="mt-0.5 size-4 shrink-0 text-destructive"
			/>
			{message}
		</p>
	);
}
