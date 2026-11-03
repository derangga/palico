import "react";

// Lets inline styles set CSS custom properties (`--split`, `--i`, ...) without
// casting the style object.
declare module "react" {
	interface CSSProperties {
		[property: `--${string}`]: string | number | undefined;
	}
}
