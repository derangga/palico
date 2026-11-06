import { readFileSync } from "node:fs";

import { Effect, SubscriptionRef } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { localeRef, resetLocale } from "#/lib/i18n/state.ts";

import {
	fieldLabel,
	fieldValue,
	groupLabel,
	itemCount,
	keptLabel,
	KNOWN_LABELS,
} from "./display.ts";

afterEach(() => Effect.runSync(resetLocale));

const useIndonesian = () =>
	Effect.runSync(SubscriptionRef.set(localeRef, "id"));

const sourceOf = (path: string) => readFileSync(path, "utf8");

describe("metadata display", () => {
	it("words known labels, groups and values in the active language", () => {
		expect(fieldLabel("Camera maker")).toBe("Camera maker");
		expect(groupLabel("Dates")).toBe("Dates");

		useIndonesian();

		expect(fieldLabel("Camera maker")).toBe("Merek kamera");
		expect(groupLabel("Dates")).toBe("Tanggal");
		expect(fieldValue("Mirrored")).toBe("Dicerminkan");
		expect(keptLabel("colour profile")).toBe("profil warna");
	});

	it("rewords values built around a number or a size", () => {
		useIndonesian();

		expect(fieldValue("3 more tags")).toBe("3 tag lagi");
		expect(fieldValue("1 earlier version")).toBe("1 versi sebelumnya");
		expect(fieldValue("2 blocks, 4 KB")).toBe("2 blok, 4 KB");
		expect(fieldValue("12 KB (unreadable)")).toBe("12 KB (tidak terbaca)");
		expect(itemCount(2)).toBe("2 item");
	});

	it("leaves the file's own text alone", () => {
		useIndonesian();

		expect(fieldLabel("Dream Journal")).toBe("Dream Journal");
		expect(fieldValue("Apple iPhone 15")).toBe("Apple iPhone 15");
	});

	it("has a message for every label the readers produce", () => {
		const labels = new Set<string>();

		for (const path of [
			"src/lib/metadata/image-read.ts",
			"src/lib/file/pdf-metadata.ts",
		]) {
			const text = sourceOf(path);

			for (const match of text.matchAll(/label: "([^"]+)"/g)) {
				labels.add(match[1] ?? "");
			}

			for (const match of text.matchAll(
				/\["(?:Location|Device|Dates|People|Software|Other)", "([^"]+)"\]/g,
			)) {
				labels.add(match[1] ?? "");
			}
		}

		expect(labels.size).toBeGreaterThan(20);

		const missing = [...labels].filter(
			(label) => !KNOWN_LABELS.includes(label),
		);

		expect(missing).toEqual([]);
	});
});
