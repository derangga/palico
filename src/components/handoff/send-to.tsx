import { Cause, Effect, Exit, Option } from "effect";
import { Forward } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button.tsx";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "#/components/ui/drawer.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import { useIsMobile } from "#/hooks/use-mobile.ts";
import {
	type SendOutput,
	toFile,
	useSendFiles,
} from "#/hooks/use-send-files.ts";
import { buildSendMenu, isEmptyMenu } from "#/lib/handoff/menu.ts";
import { filesLabel } from "#/lib/i18n/counts.ts";
import {
	CATEGORY_STYLES,
	type Tool,
	type ToolId,
	TOOLS,
} from "#/lib/tool-categories.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

/**
 * Files made only when the person picks a target: the files inside a zip (PDF
 * split, PDF to images), or a PNG drawn on demand (QR generator). `type` is the
 * MIME type of every file `load` makes and `count` how many, for the menu.
 */
export interface LazyOutputs {
	readonly type: string;
	readonly count: number;
	readonly load: Effect.Effect<
		ReadonlyArray<File>,
		{ readonly message: string }
	>;
}

const isLazy = (
	outputs: ReadonlyArray<SendOutput> | LazyOutputs,
): outputs is LazyOutputs => "load" in outputs;

// The same button opens either menu. It spreads the props the trigger injects.
function SendButton({ className, ...props }: ComponentProps<typeof Button>) {
	return (
		<Button variant="outline" className={className} {...props}>
			<Forward aria-hidden />
			{m.handoff_send_to()}
		</Button>
	);
}

// Icon, name, then the category dot at the end, so the names line up.
function ToolRow({ tool }: { readonly tool: Tool }) {
	const Icon = tool.icon;

	return (
		<>
			<Icon aria-hidden className="text-muted-foreground" />
			<span className="flex-1 truncate">{tool.label}</span>
			<span
				aria-hidden
				className={cn(
					"size-2 shrink-0 rounded-full",
					CATEGORY_STYLES[tool.category].fill,
				)}
			/>
		</>
	);
}

/**
 * "Send to..." beside a result's Download button. It lists the source tool's
 * `next` steps first, then every other tool that takes the output, and hands the
 * files over in memory (see docs/chain-tools.md). Renders nothing when no tool
 * takes the output. A phone gets a bottom sheet; larger screens a menu.
 */
export function SendTo({
	from,
	outputs,
	size,
	className,
}: {
	readonly from: ToolId;
	readonly outputs: ReadonlyArray<SendOutput> | LazyOutputs;
	readonly size?: ComponentProps<typeof Button>["size"];
	readonly className?: string;
}) {
	const isMobile = useIsMobile();
	const [open, setOpen] = useState(false);
	const send = useSendFiles(from);

	const files = isLazy(outputs) ? [] : outputs.map(toFile);
	const count = isLazy(outputs) ? outputs.count : files.length;

	const types = isLazy(outputs)
		? [outputs.type]
		: files.map((file) => file.type);

	const menu = buildSendMenu(TOOLS, from, types);

	if (count === 0 || isEmptyMenu(menu)) return null;

	const groups = [
		{ key: "suggested", label: m.handoff_suggested(), tools: menu.suggested },
		{ key: "others", label: m.handoff_other_tools(), tools: menu.others },
	].filter((group) => group.tools.length > 0);

	const batchNote =
		count > 1 ? m.handoff_sends_all({ files: filesLabel(count) }) : undefined;

	const pick = async (tool: Tool) => {
		setOpen(false);

		if (!isLazy(outputs)) {
			send(tool, files);

			return;
		}

		const exit = await Effect.runPromiseExit(outputs.load);

		if (Exit.isSuccess(exit)) {
			send(tool, exit.value);

			return;
		}

		console.error(Cause.pretty(exit.cause));
		toast.error(
			Option.match(Cause.findErrorOption(exit.cause), {
				onNone: () => m.handoff_unzip_failed(),
				onSome: (error) => error.message,
			}),
		);
	};

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={setOpen}>
				<DrawerTrigger
					render={<SendButton size={size} className={className} />}
				/>
				<DrawerContent>
					<DrawerHeader className="flex-col items-start gap-0.5">
						<DrawerTitle>{m.handoff_sheet_title()}</DrawerTitle>
						{batchNote && (
							<p className="text-xs text-muted-foreground">{batchNote}</p>
						)}
					</DrawerHeader>
					<div className="flex flex-col gap-3 overflow-y-auto overscroll-contain px-2 pb-3">
						{groups.map((group) => (
							<section key={group.key} aria-label={group.label}>
								<h3 className="px-3 pb-1 text-xs font-semibold text-muted-foreground">
									{group.label}
								</h3>
								<ul className="flex flex-col gap-1">
									{group.tools.map((tool) => (
										<li key={tool.id}>
											<button
												type="button"
												onClick={() => void pick(tool)}
												className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-[0.9375rem] font-semibold transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-5 [&_svg]:shrink-0"
											>
												<ToolRow tool={tool} />
											</button>
										</li>
									))}
								</ul>
							</section>
						))}
					</div>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<SendButton size={size} className={className} />}
			/>
			<DropdownMenuContent align="end" className="w-auto min-w-56">
				{batchNote && (
					<p className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">
						{batchNote}
					</p>
				)}
				{groups.map((group, index) => (
					<DropdownMenuGroup key={group.key}>
						{index > 0 && <DropdownMenuSeparator />}
						<DropdownMenuLabel>{group.label}</DropdownMenuLabel>
						{group.tools.map((tool) => (
							<DropdownMenuItem key={tool.id} onClick={() => void pick(tool)}>
								<ToolRow tool={tool} />
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
