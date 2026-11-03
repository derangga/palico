// Move one item to a new position. Out-of-range targets clamp to the ends.
// Used by Organize PDF for drag, button and keyboard moves.
export const moveItem = <T>(
	list: ReadonlyArray<T>,
	from: number,
	to: number,
): ReadonlyArray<T> => {
	const target = Math.min(Math.max(to, 0), list.length - 1);
	if (from === target || from < 0 || from >= list.length) return list;
	const next = [...list];
	const [moved] = next.splice(from, 1);
	next.splice(target, 0, moved);
	return next;
};
