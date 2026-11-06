import { Match, Predicate } from "effect";
import { CircleAlert } from "lucide-react";

import type { TokenError } from "#/lib/jwt/errors.ts";
import { partName } from "#/lib/jwt/token.ts";
import { m } from "#/paraglide/messages.js";

/**
 * Replaces the decoded cards when the token cannot be read. It says what is wrong
 * and which part, and the token keeps its text so it can be fixed in place.
 */
export function ErrorPanel({
	error,
	id,
}: {
	readonly error: TokenError;
	readonly id: string;
}) {
	const title = Match.value(error).pipe(
		Match.tagsExhaustive({
			MalformedTokenError: () => m.jwt_error_title_malformed(),
			InvalidJsonError: () => m.jwt_error_title_json(),
			TokenTooLargeError: () => m.jwt_error_title_large(),
		}),
	);

	return (
		<div
			id={id}
			role="alert"
			className="flex flex-col gap-3 rounded-xl bg-destructive/10 p-4 text-sm sm:p-5"
		>
			<div className="flex items-start gap-2.5">
				<CircleAlert
					aria-hidden
					className="mt-0.5 size-5 shrink-0 text-destructive"
				/>
				<div className="flex min-w-0 flex-col gap-1">
					<p className="font-semibold">{title}</p>
					<p className="text-pretty break-words">{error.message}</p>
					{!Predicate.isTagged(error, "TokenTooLargeError") && (
						<p className="text-muted-foreground">
							{m.jwt_error_fault({ part: partName(error.part) })}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
