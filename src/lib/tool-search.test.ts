import { Star } from "lucide-react";
import { describe, expect, it } from "vitest";

import { type Tool, TOOLS } from "./tool-categories.ts";
import { searchTools } from "./tool-search.ts";

const fake = (label: string, over: Partial<Tool> = {}): Tool => ({
	to: "/fake",
	label,
	blurb: "",
	keywords: [],
	seoTitle: "",
	seoDescription: "",
	icon: Star,
	category: "file",
	...over,
});

const labels = (tools: ReadonlyArray<Tool>) => tools.map((t) => t.label);

describe("searchTools", () => {
	it("returns every tool in registry order for an empty or blank query", () => {
		expect(searchTools("")).toEqual(TOOLS);
		expect(searchTools("   ")).toEqual(TOOLS);
	});

	it("ranks label prefix over label word, label contains, keyword and blurb", () => {
		const tools = [
			fake("Other", { blurb: "make a zip" }),
			fake("Unzipper"),
			fake("Quick zip"),
			fake("Other 2", { keywords: ["zip"] }),
			fake("Zip tool"),
		];

		expect(labels(searchTools("zip", tools))).toEqual([
			"Zip tool",
			"Quick zip",
			"Unzipper",
			"Other 2",
			"Other",
		]);
	});

	it("keeps registry order for equal scores", () => {
		const tools = [fake("B zip"), fake("A zip")];

		expect(labels(searchTools("zip", tools))).toEqual(["B zip", "A zip"]);
	});

	it("needs every word to match", () => {
		const hits = labels(searchTools("video gif"));

		expect(hits).toContain("Video to GIF");
		expect(hits).not.toContain("Video Cutter");
	});

	it("finds a tool by a keyword that is not in its label or blurb", () => {
		expect(searchTools("mp3")[0]?.label).toBe("Extract Audio");
	});

	it("ignores case and extra spaces", () => {
		expect(searchTools("  VIDEO   gif ")).toEqual(searchTools("video gif"));
	});

	it("returns nothing when no tool matches", () => {
		expect(searchTools("zzzzqqq")).toEqual([]);
	});

	it("puts the image converter first for the formats it converts", () => {
		for (const format of ["jpg", "png", "webp"]) {
			expect(searchTools(format)[0]?.label).toBe("Image Converter");
		}
	});

	it("matches keywords and blurbs only at the start of a word", () => {
		// "ai" is a keyword of Remove Background, and sits inside "email" and
		// "mermaid", which must not count.
		expect(searchTools("ai").map((t) => t.label)).toEqual([
			"Remove Background",
		]);
		expect(searchTools("mail")).toEqual([]);
	});

	it("treats punctuation as a word break", () => {
		expect(searchTools("pdf-merge")[0]?.label).toBe("Merge PDFs");
		expect(searchTools("pdf, merge")[0]?.label).toBe("Merge PDFs");
	});

	it("puts each tool first when searching for its own label", () => {
		for (const tool of TOOLS) {
			expect(searchTools(tool.label)[0]).toBe(tool);
		}
	});
});
