// Works out what a decoded code holds, so the reader can offer the right
// action: open a link, copy a Wi-Fi password, or just copy the text.

export type ContentKind = "link" | "wifi" | "email" | "phone" | "text";

export interface WifiDetails {
	readonly ssid: string;
	readonly password: string;
	readonly security: string;
	readonly hidden: boolean;
}

export interface Content {
	readonly kind: ContentKind;
	readonly label: string;
	/** Set only for http and https links, the one kind the reader offers to open. */
	readonly href?: string;
	readonly host?: string;
	/** Something the person should know before acting on the code. */
	readonly caution?: string;
	readonly wifi?: WifiDetails;
}

// Fields are separated by ";" and a backslash escapes ; , : " and itself.
function splitWifiFields(body: string): string[] {
	const fields: string[] = [];
	let current = "";

	for (let i = 0; i < body.length; i++) {
		const char = body[i]!;

		if (char === "\\" && i + 1 < body.length) {
			current += body[++i]!;
		} else if (char === ";") {
			fields.push(current);
			current = "";
		} else {
			current += char;
		}
	}

	if (current !== "") fields.push(current);

	return fields;
}

export function parseWifi(text: string): WifiDetails | undefined {
	if (!/^WIFI:/i.test(text)) return undefined;

	const values = new Map<string, string>();

	for (const field of splitWifiFields(text.slice(5))) {
		const colon = field.indexOf(":");

		if (colon > 0)
			values.set(field.slice(0, colon).toUpperCase(), field.slice(colon + 1));
	}

	const ssid = values.get("S");

	if (ssid === undefined) return undefined;

	const security = values.get("T") ?? "nopass";

	return {
		ssid,
		password: values.get("P") ?? "",
		security:
			security.toLowerCase() === "nopass" ? "None" : security.toUpperCase(),
		hidden: values.get("H")?.toLowerCase() === "true",
	};
}

export function describeContent(text: string): Content {
	const trimmed = text.trim();
	const wifi = parseWifi(trimmed);

	if (wifi) return { kind: "wifi", label: "Wi-Fi network", wifi };

	if (!/\s/.test(trimmed) && URL.canParse(trimmed)) {
		const url = new URL(trimmed);

		if (url.protocol === "http:" || url.protocol === "https:") {
			const lookalike = url.hostname
				.split(".")
				.some((part) => part.startsWith("xn--"));

			return {
				kind: "link",
				label: "Link",
				href: url.href,
				host: url.hostname,
				caution: lookalike
					? "This address uses unusual characters that can imitate a well-known site. Check it carefully before you open it."
					: url.protocol === "http:"
						? "This link isn't encrypted (http). Only open it if you trust where the code came from."
						: undefined,
			};
		}

		if (url.protocol === "mailto:")
			return { kind: "email", label: "Email address" };

		if (url.protocol === "tel:")
			return { kind: "phone", label: "Phone number" };
	}

	return { kind: "text", label: "Text" };
}
