import { Cause, Effect, Option } from "effect";
import { useTheme } from "next-themes";
import { useEffect, useId, useState } from "react";

import { renderMermaid } from "#/lib/markdown/mermaid.ts";

// Each state carries the `chart` source it was computed for. When the prop
// changes, the stored state still describes the previous source, so we treat it
// as pending during render (see below) instead of resetting state in the effect
// — the latter would set state in response to a prop change (double render, and
// can drop the in-flight result).
type RenderState =
	| { readonly status: "pending"; readonly chart: string }
	| { readonly status: "ready"; readonly chart: string; readonly svg: string }
	| {
			readonly status: "error";
			readonly chart: string;
			readonly message: string;
	  };

// Renders a single ```mermaid block. A failed render (invalid syntax, which is
// common while the diagram is still being typed) is shown as a small inline
// error box in place of just this diagram — the rest of the preview keeps
// rendering. The effect is re-run whenever the source or the theme changes.
export function MermaidDiagram({ chart }: { readonly chart: string }) {
	// The theme is read from the DOM at render time (see lib/markdown/mermaid.ts),
	// so it is only a dependency here: a flavour switch re-renders the diagram.
	const { resolvedTheme } = useTheme();
	const [rendered, setRendered] = useState<RenderState>({
		status: "pending",
		chart,
	});
	// mermaid uses the id as a DOM selector, so strip the colons React's useId
	// produces (they're invalid in a query selector).
	const rawId = useId();
	const domId = `mermaid-${rawId.replace(/:/g, "")}`;

	// biome-ignore lint/correctness/useExhaustiveDependencies: resolvedTheme is read from the DOM by renderMermaid, it only triggers the re-render
	useEffect(() => {
		let cancelled = false;

		// Yield first: this effect runs before next-themes swaps the flavour class
		// on <html> (children's effects run first), and the render reads that class.
		Effect.runPromiseExit(
			Effect.yieldNow.pipe(Effect.andThen(renderMermaid(domId, chart))),
		).then((exit) => {
			if (cancelled) return;
			if (exit._tag === "Success") {
				setRendered({ status: "ready", chart, svg: exit.value });
				return;
			}
			const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));
			setRendered({
				status: "error",
				chart,
				message: failure?.message ?? "This diagram couldn't be rendered.",
			});
		});

		return () => {
			cancelled = true;
		};
	}, [chart, domId, resolvedTheme]);

	// Derive the displayed state during render: if the stored result was computed
	// for a different `chart`, the effect for the current source hasn't landed
	// yet, so show pending rather than the stale diagram.
	const state: RenderState =
		rendered.chart === chart ? rendered : { status: "pending", chart };

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
