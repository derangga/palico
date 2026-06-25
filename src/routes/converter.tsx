import { createFileRoute } from "@tanstack/react-router";
import { ImageIcon } from "lucide-react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty.tsx";

export const Route = createFileRoute("/converter")({
	component: ConverterPage,
});

function ConverterPage() {
	return (
		<div className="mx-auto w-full max-w-4xl px-6 py-10">
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<ImageIcon />
					</EmptyMedia>
					<EmptyTitle>Image Converter</EmptyTitle>
					<EmptyDescription>
						Convert images to JPG, PNG, or WebP — coming soon.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
