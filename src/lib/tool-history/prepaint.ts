import { MAX_RECENT, SHOWN_RECENT, STORAGE_KEY } from "./shapes.ts";

/**
 * An inline script for the home page <head>. The page is prerendered without the
 * "Your tools" row, because only the browser knows the history. Without this the
 * row would appear after hydration and push the groups below it down.
 *
 * Before first paint it works out what the row will show and writes it on <html>:
 *
 * - `data-your-tools="1"`: the row will show at least one tool, so the slot
 *   reserves its height.
 * - `data-returning="1"`: the same condition, read by home.css to pick the compact
 *   hero and hide "Start here" (see docs/home-page.md).
 * - `--yt-fav-2` and `--yt-fav-3`: rows in the Favourites section at two and three
 *   columns, 0 when there is no favourite (the section is not shown).
 * - `--yt-rec-2` and `--yt-rec-3`: rows in the Recently used section, 0 when it is
 *   not shown.
 * - `--yt-sections`: 1 or 2, the sections shown.
 *
 * The counts follow `parseHistory` and `yourToolsParts` in model.ts exactly: a
 * value that does not match the Schema reads as empty, favourites are deduped,
 * recent is deduped and cut to MAX_RECENT before unknown and starred paths are
 * left out, and only SHOWN_RECENT of what is left is shown. Storage can be
 * blocked or hold junk, in which case the script does nothing and the row simply
 * appears after hydration.
 */
export const yourToolsScript = (known: ReadonlyArray<string>): string =>
	`try{var k=${JSON.stringify(known)},d=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}));` +
	`if(d&&d.version===1&&Array.isArray(d.favourites)&&Array.isArray(d.recent)` +
	`&&d.favourites.every(function(p){return typeof p==="string"})` +
	`&&d.recent.every(function(u){return u&&typeof u.to==="string"&&typeof u.at==="number"})){` +
	`var f=[],s=[],r=[];` +
	`d.favourites.forEach(function(p){if(f.indexOf(p)<0&&k.indexOf(p)>=0)f.push(p)});` +
	`d.recent.forEach(function(u){if(s.indexOf(u.to)<0)s.push(u.to)});` +
	`s.slice(0,${MAX_RECENT}).forEach(function(p){if(k.indexOf(p)>=0&&f.indexOf(p)<0)r.push(p)});` +
	`r=r.slice(0,${SHOWN_RECENT});` +
	`if(f.length+r.length>0){var e=document.documentElement,c=function(n,w){return Math.ceil(n/w)};` +
	`e.style.setProperty("--yt-fav-2",c(f.length,2));e.style.setProperty("--yt-fav-3",c(f.length,3));` +
	`e.style.setProperty("--yt-rec-2",c(r.length,2));e.style.setProperty("--yt-rec-3",c(r.length,3));` +
	`e.style.setProperty("--yt-sections",(f.length?1:0)+(r.length?1:0));e.dataset.yourTools="1";e.dataset.returning="1"}}}catch(e){}`;
