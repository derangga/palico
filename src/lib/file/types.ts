import { Schema } from "effect";

// Languages offered for syntax highlighting. Values are Shiki language ids as
// understood by @pierre/diffs (plain text is "text"). The label is UI-only.
export const DiffLanguage = Schema.Literals([
	"text",
	"javascript",
	"typescript",
	"json",
	"html",
	"css",
	"markdown",
	"python",
	"java",
	"kotlin",
	"go",
	"rust",
	"c",
	"cpp",
	"nix",
	"sql",
	"yaml",
]);

export type DiffLanguage = typeof DiffLanguage.Type;

export const DIFF_LANGUAGES: ReadonlyArray<{
	readonly value: DiffLanguage;
	readonly label: string;
}> = [
	{ value: "text", label: "Plain Text" },
	{ value: "javascript", label: "JavaScript" },
	{ value: "typescript", label: "TypeScript" },
	{ value: "json", label: "JSON" },
	{ value: "html", label: "HTML" },
	{ value: "css", label: "CSS" },
	{ value: "markdown", label: "Markdown" },
	{ value: "python", label: "Python" },
	{ value: "java", label: "Java" },
	{ value: "kotlin", label: "Kotlin" },
	{ value: "go", label: "Go" },
	{ value: "rust", label: "Rust" },
	{ value: "c", label: "C" },
	{ value: "cpp", label: "C++" },
	{ value: "nix", label: "Nix" },
	{ value: "sql", label: "SQL" },
	{ value: "yaml", label: "YAML" },
];

// Per-side input cap. Diffing is in-memory; an unbounded paste can freeze the
// tab while jsdiff/Shiki work. Enforced in the diff pipeline (palico-e9n.3).
export const MAX_DIFF_INPUT_CHARS = 500_000;
