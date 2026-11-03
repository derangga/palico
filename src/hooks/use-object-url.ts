import { useEffect, useState } from "react";

// Create and revoke the URL in the same effect. A useMemo + cleanup pair breaks
// under StrictMode: the dev double-mount revokes the memoized URL, and when the
// panel opens from a click the effects flush before the <img> resolves it.
export function useObjectUrl(blob: Blob) {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		const next = URL.createObjectURL(blob);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [blob]);
	return url;
}
