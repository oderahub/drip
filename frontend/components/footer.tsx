import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { GithubIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ADDRESSES } from "@/lib/contracts";
import { shortAddress } from "@/lib/utils";

const FOOTER_NAV = [
  {
    title: "Product",
    items: [
      { label: "Streams", href: "/dashboard" },
      { label: "Create stream", href: "/streams/new" },
      { label: "How it works", href: "/#how" },
    ],
  },
  {
    title: "Verified",
    items: [
      {
        label: "Drip contract",
        href: `https://shannon-explorer.somnia.network/address/${ADDRESSES.testnet.drip}`,
        external: true,
        addr: ADDRESSES.testnet.drip,
      },
      {
        label: "DripPolicies contract",
        href: `https://shannon-explorer.somnia.network/address/${ADDRESSES.testnet.dripPolicies}`,
        external: true,
        addr: ADDRESSES.testnet.dripPolicies,
      },
      {
        label: "Classifier receipt",
        href: "https://agents.testnet.somnia.network/receipts/919585",
        external: true,
      },
    ],
  },
  {
    title: "Source",
    items: [
      { label: "GitHub", href: "https://github.com/oderahub/drip", external: true },
      { label: "PROJECT.md", href: "https://github.com/oderahub/drip/blob/main/PROJECT.md", external: true },
      { label: "Skill files", href: "https://github.com/oderahub/drip/tree/main/skills", external: true },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-muted/40">
      <div className="container py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-1">
            <Logo size="md" />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Autonomous payment streaming. AI decides, streams adjust themselves.
              Built for the Somnia Agentathon.
            </p>
          </div>
          {FOOTER_NAV.map((col) => (
            <div key={col.title} className="md:col-span-1">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {col.title}
              </h4>
              <ul className="space-y-2">
                {col.items.map((it) => (
                  <li key={it.label}>
                    <FooterLink {...it} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>© 2026 Drip. Open source under MIT.</p>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/oderahub/drip"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              <GithubIcon className="h-3.5 w-3.5" />
              oderahub/drip
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  label,
  href,
  external,
  addr,
}: {
  label: string;
  href: string;
  external?: boolean;
  addr?: string;
}) {
  const content = (
    <>
      <span>{label}</span>
      {addr && (
        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground/70">
          {shortAddress(addr)}
        </span>
      )}
      {external && <ExternalLink className="ml-1 inline h-3 w-3 opacity-60" />}
    </>
  );
  return external ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center text-sm text-foreground/80 transition-colors hover:text-foreground"
    >
      {content}
    </a>
  ) : (
    <Link
      href={href}
      className="inline-flex items-center text-sm text-foreground/80 transition-colors hover:text-foreground"
    >
      {content}
    </Link>
  );
}
