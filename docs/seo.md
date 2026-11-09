# SEO: prerendered pages, sitemap and 404

Search engines read the HTML a URL returns. palico is a client-rendered app, so
without prerendering every URL would return the same HTML, and a crawler would see
Home's title and canonical URL until it ran the JavaScript. The build therefore
writes one HTML file per page.

## What the build produces

`bun run build` runs `vite build`, then `scripts/finish-prerender.ts`, then
`scripts/build-sw.ts`. `vite build` prerenders through the TanStack Start plugin
(`vite.config.ts`):

| File | What it is |
| --- | --- |
| `index.html` | Home |
| `<route>.html` (`pdf-merge.html`, ...) | One file per tool page, with its own title, description, canonical URL, social tags and `<h1>` |
| `_shell.html` | The SPA shell. Not a page. The service worker serves it offline and `404.html` is a copy of it |
| `404.html` | Written by `finish-prerender.ts` |

Every page's `<head>` comes from the route's `head: () => seoHead(path)` in
`src/lib/seo.ts`. The page body is rendered by the same React components the client
runs, in the Worker the plugin starts during the build. Production still ships
static files only (`wrangler.deploy.jsonc` has no `main`), so the Worker size limit
does not apply.

A new tool needs no entry in the build config: the router finds every static route,
and `crawlLinks` follows links from Home. It does need an entry in
`public/sitemap.xml`, `seoTitle` and `seoDescription` in `src/lib/tool-categories.ts`,
and `head: () => seoHead("/path")` on its route. `src/lib/seo.test.ts` fails if
the sitemap and the tool list differ.

## `finish-prerender.ts`

It reads the paths from `public/sitemap.xml` and fails the build if a page:

- was not written,
- has no `<title>`, meta description or `<h1>`,
- has a canonical URL other than its own,
- shares its `<title>` with another page,
- carries the `WebSite` / `WebApplication` structured data when it is not Home
  (or lacks it when it is Home).

It also fails if `dist/client` holds a `.html` file that is not in the sitemap, so a
new route cannot ship without a sitemap entry. Then it copies `_shell.html` to
`404.html`. `scripts/build-sw.ts` fails the build if any page other than
`_shell.html` ends up in the precache.

## Decisions and why

- **Flat `<route>.html`, not `<route>/index.html`.** Cloudflare's default
  `html_handling` serves `/pdf-merge` from `pdf-merge.html`. With a folder it would
  redirect `/pdf-merge` to `/pdf-merge/`, which disagrees with the canonical URL and
  the sitemap. `autoSubfolderIndex: false` in `vite.config.ts` does this.
- **Home is requested as `/?home`.** The SPA shell is also rendered at `/`, and the
  plugin's queue skips a path it has already seen, so Home would never be written.
  The router ignores the query, and `outputPath` writes `index.html`.
- **The shell is `_shell.html`, not `index.html`.** `index.html` is Home now. In this
  setup the shell is a full render of Home plus the data the client needs to take
  over on any URL: the plugin's shell flag is read from `process.env` inside the
  build Worker, where it is not set. The client notices that the URL it matches is
  not the page it was sent and renders the right route. This is how the old
  `index.html` already worked. Do not use it as a page.
- **The service worker does not precache the pages.** A precached page would be
  served before the network-first navigation route, and a reload after a deploy
  would show the old build. Only `_shell.html` is precached (see
  [offline-pwa.md](offline-pwa.md)). `public/_headers` sends `X-Robots-Tag: noindex`
  for the shell, which is a copy of Home.
- **`not_found_handling: "404-page"`.** Every route is a file, so an unknown URL
  returns `404.html` with status 404. With the old single-page-application setting
  it returned the app with status 200, which search engines treat as a soft 404.
  Add a dynamic route (for example `/posts/$id`) and this setting breaks it: that
  URL has no file. Prerender it or go back to the single-page-application fallback.

## Not covered here

The pages hold a one-line description and the tool itself. They have no FAQ or
how-to text and no per-tool structured data. Those are copy work and need strings in
both `messages/en.json` and `messages/id.json` (see [i18n.md](i18n.md)).

## Check it after a deploy

- `site:palico.rangga.site` in Google, and URL Inspection in Search Console for one
  tool page ("View tested page" shows the HTML Google got).
- `curl -s https://palico.rangga.site/pdf-merge | grep -o '<title>[^<]*'` returns the
  tool's title, not Home's.
- `curl -I https://palico.rangga.site/not-a-page` returns 404.
