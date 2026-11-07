import { useNavigate } from "@tanstack/react-router";

import { sendHandoff } from "#/lib/handoff/client.ts";
import { typeFromName } from "#/lib/handoff/mime.ts";
import type { Tool, ToolId } from "#/lib/tool-categories.ts";

/** A result to send: a File, or a Blob with the name it downloads as. */
export type SendOutput = File | { readonly blob: Blob; readonly name: string };

export const toFile = (output: SendOutput): File => {
	const blob = output instanceof File ? output : output.blob;
	const name = output.name;

	if (output instanceof File && output.type !== "") return output;

	return new File([blob], name, { type: blob.type || typeFromName(name) });
};

/** Other search params the target reads. Only /pdf-password has one. */
export interface SendSearch {
	readonly mode?: "protect" | "unlock";
}

/**
 * Keeps the files in memory and opens the target tool with `?handoff=<id>`.
 * `search` adds other params the target reads, such as `mode` on /pdf-password.
 */
export function useSendFiles(from: ToolId) {
	const navigate = useNavigate();

	return (
		target: Pick<Tool, "to">,
		outputs: ReadonlyArray<SendOutput>,
		search: SendSearch = {},
	) => {
		const [first, ...rest] = outputs.map(toFile);

		if (first === undefined) return;

		const id = sendHandoff({ files: [first, ...rest], from });

		void navigate({ to: target.to, search: { ...search, handoff: id } });
	};
}
