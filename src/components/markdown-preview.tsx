import type { Properties } from "hast";
import Markdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";

import { MermaidDiagram } from "#/components/mermaid-diagram.tsx";

// Rendering markdown is a pure view concern, so it lives in the UI layer with
// react-markdown rather than behind an Effect. remark-gfm brings the
// GitHub-flavored syntax (tables, task lists, strikethrough, autolinks); the
// rehype chain lets a *sanitized* subset of raw HTML through and then syntax-
// highlights fenced code. Order matters: rehype-raw parses embedded HTML into
// the tree, rehype-sanitize strips scripts/dangerous attributes (GitHub's
// default schema, which preserves the `language-*` class on code), and
// rehype-highlight runs last so the token spans it injects survive sanitizing.
// It reads the language from the fence info string and falls back to
// auto-detection when none is given (hljs tokens are styled in styles.css).
// `ignoreMissing` keeps unknown languages — notably `mermaid` — as plain text
// instead of throwing, so the mermaid source reaches our code override intact.
const REMARK_PLUGINS: PluggableList = [remarkGfm];

const REHYPE_PLUGINS: PluggableList = [
	rehypeRaw,
	rehypeSanitize,
	[rehypeHighlight, { ignoreMissing: true }],
];

const MERMAID_CLASS = "language-mermaid";

function hasMermaidClass(className: Properties[string]): boolean {
	return Array.isArray(className) && className.includes(MERMAID_CLASS);
}

// Fenced ```mermaid blocks are rendered as diagrams rather than code. The code
// override swaps in the diagram component; the pre override drops the <pre>
// chrome around it so the diagram isn't wrapped in a code block's styling.
const COMPONENTS: Components = {
	code({ className, children, node: _node, ...props }) {
		if (className?.includes(MERMAID_CLASS)) {
			return <MermaidDiagram chart={String(children)} />;
		}

		return (
			<code className={className} {...props}>
				{children}
			</code>
		);
	},
	pre({ children, node, ...props }) {
		const firstChild = node?.children?.[0];

		if (
			firstChild?.type === "element" &&
			hasMermaidClass(firstChild.properties?.className)
		) {
			return <>{children}</>;
		}

		return <pre {...props}>{children}</pre>;
	},
};

export function MarkdownPreview({ source }: { readonly source: string }) {
	if (source.trim().length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Your rendered markdown will appear here.
			</p>
		);
	}

	return (
		<article className="prose max-w-none">
			<Markdown
				remarkPlugins={REMARK_PLUGINS}
				rehypePlugins={REHYPE_PLUGINS}
				components={COMPONENTS}
			>
				{source}
			</Markdown>
		</article>
	);
}
