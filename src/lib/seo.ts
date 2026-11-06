import { TOOLS } from "#/lib/tool-categories.ts";

/** The production origin. Canonical URLs, og:url, og:image and sitemap.xml use it. */
export const SITE_URL = "https://palico.rangga.site";

const SITE_NAME = "Palico";

const HOME_TITLE = "Palico: Free, private, offline file tools. No sign-up.";

const HOME_DESCRIPTION =
	"Free, offline toolkit for images, video, audio and PDFs. Convert, resize, compress and more in your browser. No uploads, no tracking, no account.";

const OG_IMAGE = `${SITE_URL}/og-image.png`;

const OG_IMAGE_ALT =
	"Palico, a chibi cat adventurer with a hammer, and the line Your Daily Offline Toolkit";

// Home only: tells search engines this is a free app, not a converter site that
// uploads files.
const STRUCTURED_DATA = JSON.stringify({
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "WebSite",
			name: SITE_NAME,
			url: `${SITE_URL}/`,
		},
		{
			"@type": "WebApplication",
			name: SITE_NAME,
			url: `${SITE_URL}/`,
			description: HOME_DESCRIPTION,
			applicationCategory: "MultimediaApplication",
			operatingSystem: "Any",
			browserRequirements: "Requires JavaScript and a modern browser",
			offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
		},
	],
});

/**
 * The head contents of a page: its title, description, canonical URL and social
 * tags. Each route calls this from its own `head()` with its own path, so the
 * tags follow the URL on a deep link and on client-side navigation.
 */
export function seoHead(pathname: string) {
	const tool = TOOLS.find((t) => t.to === pathname);
	const title = tool ? `${tool.seoTitle} | ${SITE_NAME}` : HOME_TITLE;
	const description = tool ? tool.seoDescription : HOME_DESCRIPTION;
	const url = new URL(pathname, SITE_URL).href;

	return {
		meta: [
			{ title },
			{ name: "description", content: description },
			{ property: "og:site_name", content: SITE_NAME },
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: url },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:image", content: OG_IMAGE },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{ property: "og:image:alt", content: OG_IMAGE_ALT },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
			{ name: "twitter:image", content: OG_IMAGE },
			{ name: "twitter:image:alt", content: OG_IMAGE_ALT },
		],
		links: [{ rel: "canonical", href: url }],
		scripts:
			pathname === "/"
				? [{ type: "application/ld+json", children: STRUCTURED_DATA }]
				: [],
	};
}
