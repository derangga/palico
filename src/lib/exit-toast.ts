// UI glue for handling `Effect.runPromiseExit` results in React event handlers.
//
// Collapses the block that was copy-pasted across the PDF/office routes:
//   const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
//   if (failure) console.error(failure);
//   toast.error(failure?.message ?? fallback);
// That version only inspected `Fail` causes, so a `Die`/defect was silently
// dropped (toasted the fallback but never logged). Building on
// `Cause.findErrorOption` surfaces the typed failure's `message`, and logging the
// pretty cause covers defects too.

import { Cause, Exit, Option } from "effect";
import { toast } from "sonner";

// Toast the typed failure message (or `fallback` for defects/interrupts) and log
// the full cause. Returns `Some(value)` on success, `None` on failure — call
// sites branch on it for any extra side effects (state reset, item removal, …).
export const toastOnExit = <A, E extends { readonly message: string }>(
	exit: Exit.Exit<A, E>,
	fallback: string,
): Option.Option<A> =>
	Exit.match(exit, {
		onSuccess: Option.some,
		onFailure: (cause) => {
			console.error(Cause.pretty(cause));
			const message = Option.match(Cause.findErrorOption(cause), {
				onNone: () => fallback,
				onSome: (error) => error.message,
			});
			toast.error(message);
			return Option.none();
		},
	});
