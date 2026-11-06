"use client";

import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import type * as React from "react";

import { cn } from "#/lib/utils.ts";

const Drawer = DrawerPrimitive.Root;
const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerClose = DrawerPrimitive.Close;

/**
 * A bottom sheet that closes when it is swiped down. Pass `backdrop={false}`
 * together with `modal={false}` on the root for a sheet that leaves the page
 * behind it usable. The viewport then lets pointer events through, and only the
 * popup catches them.
 */
function DrawerContent({
	className,
	children,
	backdrop = true,
	...props
}: DrawerPrimitive.Popup.Props & { readonly backdrop?: boolean }) {
	return (
		<DrawerPrimitive.Portal>
			{backdrop && (
				<DrawerPrimitive.Backdrop
					data-slot="drawer-overlay"
					className="fixed inset-0 z-50 bg-foreground/25 transition-opacity duration-200 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-ctp-crust/60"
				/>
			)}
			<DrawerPrimitive.Viewport
				className={cn(
					"fixed inset-0 z-50 flex items-end justify-center",
					!backdrop && "pointer-events-none",
				)}
			>
				<DrawerPrimitive.Popup
					data-slot="drawer-content"
					className={cn(
						"pointer-events-auto flex max-h-[85dvh] outline-none w-full flex-col rounded-t-2xl border-t bg-popover pb-[env(safe-area-inset-bottom)] text-popover-foreground shadow-xl transition-[transform,translate,border-radius] duration-200 ease-drawer [transform:translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))] data-ending-style:translate-y-full data-starting-style:translate-y-full data-swiping:transition-none motion-reduce:transition-none",
						className,
					)}
					{...props}
				>
					<div
						aria-hidden
						className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
					/>
					<DrawerPrimitive.Content className="flex min-h-0 flex-1 flex-col">
						{children}
					</DrawerPrimitive.Content>
				</DrawerPrimitive.Popup>
			</DrawerPrimitive.Viewport>
		</DrawerPrimitive.Portal>
	);
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="drawer-header"
			className={cn("flex items-center justify-between gap-3 px-4 py-2", className)}
			{...props}
		/>
	);
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
	return (
		<DrawerPrimitive.Title
			data-slot="drawer-title"
			className={cn("text-base font-extrabold text-foreground", className)}
			{...props}
		/>
	);
}

export {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
};
