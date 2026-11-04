import { describe, expect, it } from "vitest";

import { describeContent, parseWifi } from "./content.ts";

describe("describeContent", () => {
	it("offers to open only http and https links", () => {
		const link = describeContent("https://palico.rangga.site/qr-reader");

		expect(link.kind).toBe("link");
		expect(link.href).toBe("https://palico.rangga.site/qr-reader");
		expect(link.host).toBe("palico.rangga.site");
		expect(link.caution).toBeUndefined();

		expect(describeContent("javascript:alert(1)").href).toBeUndefined();
		expect(describeContent("javascript:alert(1)").kind).toBe("text");
		expect(describeContent("data:text/html,<b>x</b>").kind).toBe("text");
		expect(describeContent("file:///etc/passwd").href).toBeUndefined();
	});

	it("warns about plain http and look-alike hosts", () => {
		expect(describeContent("http://example.com").caution).toContain(
			"isn't encrypted",
		);
		expect(describeContent("https://xn--pple-43d.com").caution).toContain(
			"unusual characters",
		);
	});

	it("does not treat text with spaces as a link", () => {
		expect(describeContent("see https://example.com now").kind).toBe("text");
	});

	it("recognises email and phone links without offering to open them", () => {
		expect(describeContent("mailto:hi@example.com").kind).toBe("email");
		expect(describeContent("tel:+15551234567").kind).toBe("phone");
		expect(describeContent("mailto:hi@example.com").href).toBeUndefined();
	});

	it("falls back to text", () => {
		expect(describeContent("just some words").kind).toBe("text");
		expect(describeContent("12345").kind).toBe("text");
	});
});

describe("parseWifi", () => {
	it("reads the standard fields", () => {
		expect(parseWifi("WIFI:T:WPA;S:Cafe Net;P:secret;;")).toEqual({
			ssid: "Cafe Net",
			password: "secret",
			security: "WPA",
			hidden: false,
		});
	});

	it("honours escaped separators in names and passwords", () => {
		const wifi = parseWifi(String.raw`WIFI:T:WPA;S:a\;b;P:p\:w\\d;H:true;;`);

		expect(wifi?.ssid).toBe("a;b");
		expect(wifi?.password).toBe("p:w\\d");
		expect(wifi?.hidden).toBe(true);
	});

	it("treats a network with no password as open", () => {
		expect(parseWifi("WIFI:T:nopass;S:Guest;;")?.security).toBe("None");
	});

	it("rejects text that is not a Wi-Fi code", () => {
		expect(parseWifi("hello")).toBeUndefined();
		expect(parseWifi("WIFI:T:WPA;P:nossid;;")).toBeUndefined();
	});
});
