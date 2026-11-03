import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { type ReactNode, useEffect } from "react";

// Catppuccin flavour classes: the package keys its colour variables on
// `.latte` / `.mocha`. next-themes can only set one class per theme, so the
// flavour class is the source of truth for first paint (no flash) and `.dark`
// is mirrored after hydration for code that still checks it.
const FLAVOUR_CLASSES = { light: "latte", dark: "mocha" } as const;

function DarkClassSync() {
	const { resolvedTheme } = useTheme();
	useEffect(() => {
		document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
	}, [resolvedTheme]);

	return null;
}

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
	return (
		<NextThemesProvider
			attribute="class"
			value={FLAVOUR_CLASSES}
			defaultTheme="system"
			enableSystem
		>
			<DarkClassSync />
			{children}
		</NextThemesProvider>
	);
}
