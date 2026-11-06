import { m } from "#/paraglide/messages.js";

// "1 page", "3 pages". English has one and other; Indonesian words both alike,
// but each language owns its own pair of messages.

export const pagesLabel = (count: number): string =>
	count === 1 ? m.count_pages_one({ count }) : m.count_pages_other({ count });

export const filesLabel = (count: number): string =>
	count === 1 ? m.count_files_one({ count }) : m.count_files_other({ count });
