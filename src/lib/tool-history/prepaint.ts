import { SHOWN_RECENT, STORAGE_KEY } from "./shapes.ts";

/**
 * An inline script for the home page <head>. The page is prerendered without the
 * "Your tools" row, because only the browser knows the history. Without this the
 * row would appear after hydration and push the category groups down.
 *
 * Before first paint it counts the tools the row will show and sets
 * `data-your-tools` on <html> plus `--yt-rows-2` and `--yt-rows-3` (the row
 * count at two and three columns). home.css turns those into a reserved height.
 * The count follows the same rules as `yourTools` in model.ts: starred tools,
 * then recent tools that are not starred, only for paths in `known`. Storage
 * can be blocked or hold junk, in which case the script does nothing and the row
 * simply appears after hydration.
 */
export const yourToolsScript = (known: ReadonlyArray<string>): string =>
	`try{var k=${JSON.stringify(known)},d=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}));` +
	`if(d&&d.version===1&&Array.isArray(d.favourites)&&Array.isArray(d.recent)){` +
	`var f=[],r=[];` +
	`d.favourites.forEach(function(p){if(k.indexOf(p)>=0&&f.indexOf(p)<0)f.push(p)});` +
	`d.recent.forEach(function(u){var p=u&&u.to;if(k.indexOf(p)>=0&&f.indexOf(p)<0&&r.indexOf(p)<0)r.push(p)});` +
	`var n=f.length+Math.min(r.length,${SHOWN_RECENT});` +
	`if(n>0){var e=document.documentElement;e.style.setProperty("--yt-rows-2",Math.ceil(n/2));` +
	`e.style.setProperty("--yt-rows-3",Math.ceil(n/3));e.dataset.yourTools="1"}}}catch(e){}`;
