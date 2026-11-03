// True for iPhone, iPad (including iPadOS, which reports as a Mac with touch) in
// a normal browser tab. Home Screen web apps are exempt from Safari's 7-day
// storage cleanup, and iOS has no install prompt, so we point the user there.
export const needsHomeScreenHint = (input: {
	readonly userAgent: string;
	readonly maxTouchPoints: number;
	readonly standalone: boolean;
}): boolean => {
	if (input.standalone) return false;
	const iosPhone = /iPhone|iPad|iPod/.test(input.userAgent);
	const ipadOs = /Macintosh/.test(input.userAgent) && input.maxTouchPoints > 1;

	return iosPhone || ipadOs;
};
