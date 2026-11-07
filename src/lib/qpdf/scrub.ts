// Keeps credentials out of text that is about to leave the worker. Pure.

// Replaces every secret in a line with `***`. Empty secrets are skipped, because
// replacing the empty string would wedge `***` between every character.
export const scrub = (
	detail: string | undefined,
	secrets: ReadonlyArray<string>,
): string | undefined =>
	secrets
		.filter((secret) => secret !== "")
		.reduce((line, secret) => line?.replaceAll(secret, "***"), detail);

// The password values on qpdf command lines: `--password=x`, `--user-password=x`,
// `--owner-password=x`. For a tool that sends command lines and has no other list of
// what is secret.
export const passwordsInArgs = (
	steps: ReadonlyArray<{ readonly args: ReadonlyArray<string> }>,
): ReadonlyArray<string> =>
	steps.flatMap((step) =>
		step.args.flatMap((arg) => {
			const match = /^--(?:[a-z]+-)?password=(.*)$/.exec(arg);

			return match?.[1] === undefined ? [] : [match[1]];
		}),
	);
