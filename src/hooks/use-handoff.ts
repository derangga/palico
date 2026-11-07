import { useNavigate, useSearch } from "@tanstack/react-router";
import { Exit } from "effect";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { receiveHandoff } from "#/lib/handoff/client.ts";
import { type Tool, TOOLS } from "#/lib/tool-categories.ts";

export type HandoffState =
	| { readonly kind: "none" }
	/** Files arrived from `from`. `tookFirst` is set when a one-file tool got several. */
	| {
			readonly kind: "received";
			readonly from: Tool;
			readonly count: number;
			readonly tookFirst: boolean;
	  }
	/** The address named a handoff that is not in memory, usually after a reload. */
	| { readonly kind: "missing" };

const NONE: HandoffState = { kind: "none" };

// The dropzone's `onFiles` takes a FileList, so the files go in as one, down the
// same path as a drop.
const toFileList = (files: ReadonlyArray<File>): FileList => {
	const transfer = new DataTransfer();

	for (const file of files) transfer.items.add(file);

	return transfer.files;
};

export interface HandoffOptions {
	/** True when the dropzone takes several files. Otherwise only the first is passed. */
	readonly multiple?: boolean;
	/** True while the page has a file loaded. */
	readonly hasFile: boolean;
}

/**
 * Takes a "Send to..." handoff on mount and passes its files to `onFiles`, the
 * same function the page's dropzone calls. Then it removes `?handoff=` from the
 * address with a replace, so Back and reload do not replay it. Call it in the
 * component that owns the dropzone.
 *
 * The state it returns is what HandoffNotice shows. "From X" lasts while the sent
 * file is loaded: once the page has no file (Choose another, Clear) it is gone
 * for good, so it never labels a file the person picked later. "Drop the file
 * again" lasts until a file is loaded.
 */
export function useHandoff(
	onFiles: (files: FileList) => void,
	options: HandoffOptions,
): HandoffState {
	const raw = useSearch({ strict: false, select: (search) => search.handoff });
	const navigate = useNavigate();
	const [state, setState] = useState<HandoffState>(NONE);
	const [hadFile, setHadFile] = useState(options.hasFile);
	// StrictMode runs the effect twice. The second run must not read the map
	// again: the first already took the entry.
	const handled = useRef<string | undefined>(undefined);
	const multiple = options.multiple ?? false;
	const { hasFile } = options;

	// The file came or went. Adjusting state during render, not in an effect,
	// so the stale chip never paints.
	if (hasFile !== hadFile) {
		setHadFile(hasFile);

		const ended =
			(state.kind === "received" && !hasFile) ||
			(state.kind === "missing" && hasFile);

		if (ended) setState(NONE);
	}

	const receive = useEffectEvent((param: string) => {
		const exit = receiveHandoff(param);

		void navigate({
			to: ".",
			search: (prev) => ({ ...prev, handoff: undefined }),
			replace: true,
		});

		if (Exit.isFailure(exit)) {
			setState({ kind: "missing" });

			return;
		}

		const { files, from } = exit.value;
		const source = TOOLS.find((tool) => tool.id === from);
		const passed = multiple ? files : files.slice(0, 1);

		if (source) {
			setState({
				kind: "received",
				from: source,
				count: files.length,
				tookFirst: passed.length < files.length,
			});
		}

		onFiles(toFileList(passed));
	});

	useEffect(() => {
		if (raw === undefined || handled.current === raw) return;

		handled.current = raw;
		receive(raw);
	}, [raw]);

	// A sent file the page turned down (wrong type, too large) gets no chip: the
	// page has already said why in a toast.
	if (state.kind === "received" && !hasFile) return NONE;

	if (state.kind === "missing" && hasFile) return NONE;

	return state;
}
