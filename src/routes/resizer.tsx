import { createFileRoute } from "@tanstack/react-router";
import { Scaling } from "lucide-react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty.tsx";

export const Route = createFileRoute("/resizer")({ component: ResizerPage });

function ResizerPage() {
	return (
		<div className="mx-auto w-full max-w-4xl px-6 py-10">
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Scaling />
					</EmptyMedia>
					<EmptyTitle>Image Resizer</EmptyTitle>
					<EmptyDescription>
						Resize by pixels or percentage — coming soon.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
