import { SearchIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "#/components/ui/button.tsx";

const subscribeNever = () => () => {};

// The server and the first client render say "Ctrl K", so prerendered HTML
// matches. Apple devices switch to the Command symbol right after hydration.
function useIsApple() {
	return useSyncExternalStore(
		subscribeNever,
		() => /Mac|iPhone|iPad/.test(navigator.userAgent),
		() => false,
	);
}

export function SearchButton({ onClick }: { onClick: () => void }) {
	const isApple = useIsApple();

	return (
		<Button
			variant="outline"
			aria-label="Search tools"
			aria-keyshortcuts="Control+K Meta+K"
			onClick={onClick}
			className="max-sm:size-9 max-sm:px-0 sm:w-40 sm:justify-start lg:w-52 sm:text-muted-foreground"
		>
			<SearchIcon aria-hidden />
			<span className="max-sm:hidden">Search tools</span>
			<kbd className="ml-auto text-xs font-medium max-sm:hidden pointer-coarse:hidden">
				{isApple ? "⌘K" : "Ctrl K"}
			</kbd>
		</Button>
	);
}
