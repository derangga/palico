import {
	ArrowLeft,
	ArrowRight,
	RotateCcw,
	RotateCw,
	Trash2,
} from "lucide-react";
import {
	type Dispatch,
	type KeyboardEvent,
	useEffect,
	useRef,
	useState,
} from "react";

import type {
	OrganizeAction,
	OrganizePage,
} from "#/components/pdf-organize/state.ts";
import { pagesLabel } from "#/lib/i18n/counts.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

// The page grid is one tab stop (roving tabindex). On a focused card:
//   Arrow keys / Home / End  move focus
//   Alt + arrow keys         move the page
//   R / Shift + R            rotate right / left
//   Delete / Backspace       delete the page
// Tab enters the focused card's buttons, which do the same things, so touch
// and screen reader users never need the shortcuts. Every change is announced
// through one polite live region.
export function PageGrid({
	pages,
	disabled,
	dispatch,
}: {
	pages: ReadonlyArray<OrganizePage>;
	disabled: boolean;
	dispatch: Dispatch<OrganizeAction>;
}) {
	const gridRef = useRef<HTMLOListElement>(null);
	const cards = useRef(new Map<string, HTMLLIElement>());
	const dragFrom = useRef<number | null>(null);
	// Focus is restored after the reducer re-renders the grid.
	const pendingFocus = useRef<string | null>(null);
	const [activeKey, setActiveKey] = useState<string | null>(null);
	const [announcement, setAnnouncement] = useState("");

	const activeIndex = Math.max(
		0,
		pages.findIndex((p) => p.key === activeKey),
	);

	useEffect(() => {
		const key = pendingFocus.current;

		if (key === null) return;
		pendingFocus.current = null;
		cards.current.get(key)?.focus();
	});

	const focusAt = (index: number) => {
		const page = pages[Math.min(Math.max(index, 0), pages.length - 1)];

		if (!page) return;
		setActiveKey(page.key);
		cards.current.get(page.key)?.focus();
	};

	// Read the live column count so Up/Down follow the responsive layout.
	const columns = () => {
		const grid = gridRef.current;

		if (!grid) return 1;

		return getComputedStyle(grid).gridTemplateColumns.split(" ").length || 1;
	};

	const move = (index: number, to: number) => {
		const page = pages[index];
		const target = Math.min(Math.max(to, 0), pages.length - 1);

		if (!page || target === index) return;
		dispatch({ type: "move", from: index, to: target });
		pendingFocus.current = page.key;
		setActiveKey(page.key);
		setAnnouncement(
			m.pdforg_moved({
				page: page.sourceIndex + 1,
				position: target + 1,
				total: pages.length,
			}),
		);
	};

	const rotate = (page: OrganizePage, dir: 1 | -1) => {
		dispatch({ type: "rotate", key: page.key, dir });
		const next = (page.rotation + dir * 90 + 360) % 360;
		setAnnouncement(
			m.pdforg_rotated({ page: page.sourceIndex + 1, degrees: next }),
		);
	};

	const remove = (index: number) => {
		const page = pages[index];

		if (!page) return;
		const neighbour = pages[index + 1] ?? pages[index - 1];
		dispatch({ type: "remove", key: page.key });

		if (neighbour) {
			pendingFocus.current = neighbour.key;
			setActiveKey(neighbour.key);
		}

		const left = pages.length - 1;
		setAnnouncement(
			m.pdforg_deleted({ page: page.sourceIndex + 1, left: pagesLabel(left) }),
		);
	};

	const onKeyDown = (e: KeyboardEvent<HTMLLIElement>, index: number) => {
		// Leave keys on the card's own buttons to the buttons.
		if (e.target !== e.currentTarget || disabled) return;

		if (e.ctrlKey || e.metaKey) return;

		const step = new Map<string, number>([
			["ArrowLeft", -1],
			["ArrowRight", 1],
			["ArrowUp", -columns()],
			["ArrowDown", columns()],
		]).get(e.key);

		let handled = true;

		if (step !== undefined) {
			if (e.altKey) move(index, index + step);
			else focusAt(index + step);
		} else if (e.key === "Home") {
			focusAt(0);
		} else if (e.key === "End") {
			focusAt(pages.length - 1);
		} else if (e.key.toLowerCase() === "r" && !e.altKey) {
			rotate(pages[index], e.shiftKey ? -1 : 1);
		} else if (e.key === "Delete" || e.key === "Backspace") {
			remove(index);
		} else {
			handled = false;
		}

		if (handled) e.preventDefault();
	};

	return (
		<>
			<p className="mb-3 hidden text-xs text-muted-foreground sm:block">
				{m.pdforg_help()}
			</p>
			<ol
				ref={gridRef}
				aria-label={m.pdforg_grid_aria()}
				className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
			>
				{pages.map((page, index) => {
					const active = index === activeIndex;
					const tab = active && !disabled ? 0 : -1;

					return (
						// oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- focusable grid cell with roving tabindex and keyboard shortcuts.
						<li
							key={page.key}
							ref={(el) => {
								if (el) cards.current.set(page.key, el);
								else cards.current.delete(page.key);
							}}
							tabIndex={tab}
							aria-label={`${m.pdforg_card_aria({
								page: page.sourceIndex + 1,
								position: index + 1,
								total: pages.length,
							})}${page.rotation ? m.pdforg_card_rotated({ degrees: page.rotation }) : ""}`}
							aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight R Shift+R Delete"
							draggable={!disabled}
							onFocus={() => setActiveKey(page.key)}
							onKeyDown={(e) => onKeyDown(e, index)}
							onDragStart={() => {
								dragFrom.current = index;
							}}
							onDragOver={(e) => e.preventDefault()}
							onDrop={(e) => {
								e.preventDefault();
								const from = dragFrom.current;
								dragFrom.current = null;

								if (from !== null) move(from, index);
							}}
							className={cn(
								"flex flex-col gap-2 rounded-lg border bg-card p-2 outline-none transition-[border-color,box-shadow] duration-150 ease-out focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
								!disabled && "cursor-grab active:cursor-grabbing",
							)}
						>
							<div className="flex aspect-square items-center justify-center overflow-hidden">
								<PageCanvas page={page} />
							</div>
							<div className="flex items-center justify-between gap-1">
								<span className="text-xs font-medium text-muted-foreground">
									{index + 1}
								</span>
								<div className="flex items-center">
									<CardButton
										label={m.pdforg_move_earlier({
											page: page.sourceIndex + 1,
										})}
										tabIndex={tab}
										disabled={disabled || index === 0}
										onClick={() => move(index, index - 1)}
									>
										<ArrowLeft />
									</CardButton>
									<CardButton
										label={m.pdforg_move_later({ page: page.sourceIndex + 1 })}
										tabIndex={tab}
										disabled={disabled || index === pages.length - 1}
										onClick={() => move(index, index + 1)}
									>
										<ArrowRight />
									</CardButton>
									<CardButton
										label={m.pdforg_rotate_left({ page: page.sourceIndex + 1 })}
										tabIndex={tab}
										disabled={disabled}
										onClick={() => rotate(page, -1)}
									>
										<RotateCcw />
									</CardButton>
									<CardButton
										label={m.pdforg_rotate_right({
											page: page.sourceIndex + 1,
										})}
										tabIndex={tab}
										disabled={disabled}
										onClick={() => rotate(page, 1)}
									>
										<RotateCw />
									</CardButton>
									<CardButton
										label={m.pdforg_delete({ page: page.sourceIndex + 1 })}
										tabIndex={tab}
										disabled={disabled}
										onClick={() => remove(index)}
										destructive
									>
										<Trash2 />
									</CardButton>
								</div>
							</div>
						</li>
					);
				})}
			</ol>
			<p aria-live="polite" className="sr-only">
				{announcement}
			</p>
		</>
	);
}

// Paints the page bitmap once; rotation is a CSS transform so it never
// re-renders. The square box above means any rotation still fits.
function PageCanvas({ page }: { page: OrganizePage }) {
	const ref = useRef<HTMLCanvasElement>(null);
	const { bitmap, width, height } = page.thumbnail;

	useEffect(() => {
		ref.current?.getContext("2d")?.drawImage(bitmap, 0, 0);
	}, [bitmap]);

	return (
		<canvas
			ref={ref}
			width={width}
			height={height}
			style={{ rotate: `${page.rotation}deg` }}
			className="max-h-full max-w-full rounded-sm border border-border bg-white shadow-sm"
		/>
	);
}

function CardButton({
	label,
	tabIndex,
	disabled,
	onClick,
	destructive,
	children,
}: {
	label: string;
	tabIndex: number;
	disabled: boolean;
	onClick: () => void;
	destructive?: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			tabIndex={tabIndex}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5",
				destructive && "hover:bg-destructive/10 hover:text-destructive",
			)}
		>
			{children}
		</button>
	);
}
