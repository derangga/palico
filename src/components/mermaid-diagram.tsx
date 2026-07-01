import { Effect } from "effect";
import { useEffect, useId, useState } from "react";

import { renderMermaid } from "#/lib/markdown/mermaid.ts";

type RenderState =
	| { readonly status: "pending" }
	| { readonly status: "ready"; readonly svg: string }
	| { readonly status: "error"; readonly message: string };

// Renders a single ```mermaid block. A failed render (invalid syntax, which is
// common while the diagram is still being typed) is shown as a small inline
// error box in place of just this diagram — the rest of the preview keeps
// rendering. The effect is re-run whenever the source changes.
export function MermaidDiagram({ chart }: { readonly chart: string }) {
	const [state, setState] = useState<RenderState>({ status: "pending" });
	// mermaid uses the id as a DOM selector, so strip the colons React's useId
	// produces (they're invalid in a query selector).
	const rawId = useId();
	const domId = `mermaid-${rawId.replace(/:/g, "")}`;

	useEffect(() => {
		let cancelled = false;
		setState({ status: "pending" });

		Effect.runPromiseExit(renderMermaid(domId, chart)).then((exit) => {
			if (cancelled) return;
			if (exit._tag === "Success") {
				setState({ status: "ready", svg: exit.value });
				return;
			}
			const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
			setState({
				status: "error",
				message: failure?.message ?? "This diagram couldn't be rendered.",
			});
		});

		return () => {
			cancelled = true;
		};
	}, [chart, domId]);

	if (state.status === "error") {
		return (
			<div className="not-prose my-4 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
				<p className="font-medium">Couldn't render this diagram</p>
				<p className="mt-1 whitespace-pre-wrap font-mono text-xs opacity-80">
					{state.message}
				</p>
			</div>
		);
	}

	if (state.status === "ready") {
		return (
			<div
				className="not-prose my-4 flex justify-center overflow-x-auto"
				// mermaid sanitizes its own output (securityLevel: "strict").
				// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized SVG from mermaid
				dangerouslySetInnerHTML={{ __html: state.svg }}
			/>
		);
	}

	return (
		<div className="not-prose my-4 text-sm text-muted-foreground">
			Rendering diagram…
		</div>
	);
}
