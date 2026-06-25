import { createFileRoute } from "@tanstack/react-router";
import { Lock, ShieldCheck, Zap } from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

const pills = [
  { icon: ShieldCheck, label: "Offline First" },
  { icon: Lock, label: "Private & Secure" },
  { icon: Zap, label: "Fast & Lightweight" },
] as const;

function Home() {
  return (
    <section className="flex min-h-[calc(100svh-3.5rem)] w-full items-center px-6 py-16 sm:px-12 lg:px-16">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
        {/* Left: text stack */}
        <div className="flex flex-col items-start">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs">
            <ShieldCheck className="size-3.5 text-primary" />
            Privacy Guaranteed
          </span>

          <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Your Daily <span className="text-primary">Offline</span>
            <br />
            Toolkit
          </h1>

          <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
            100% on-device. No uploads, no tracking, pure privacy. Transform
            your files without them ever leaving your browser.
          </p>

          <ul className="mt-8 flex flex-wrap gap-3">
            {pills.map((pill) => (
              <li
                key={pill.label}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-xs"
              >
                <pill.icon className="size-4 text-primary" />
                {pill.label}
              </li>
            ))}
          </ul>
        </div>

        {/* Right: illustration card */}
        <div className="aspect-4/5 w-full overflow-hidden rounded-2xl border border-border bg-secondary shadow-lg lg:aspect-square">
          <img
            src="/palico.png"
            alt="Palico, your offline toolkit companion"
            className="h-full w-full scale-125 object-cover object-top-right"
          />
        </div>
      </div>
    </section>
  );
}
