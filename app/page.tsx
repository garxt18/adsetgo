import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLockup, PRODUCT_NAME } from "@/components/ui/brand";
import { ButtonLink } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme";
import { TopBar, TopBarLink } from "@/components/ui/top-bar";
import { HeroVisual } from "@/components/hero-visual";

export const metadata = {
  title: "AdSetGo — Google Ads reporting your clients actually open",
  description:
    "Give every client their own live Google Ads report, under your agency's own address.",
};

/**
 * The public page: a hero, one roadmap, and an about.
 *
 * The six things worth saying are not two lists. They are three stages, and at
 * each stage one person acts and another starts seeing something, so they are
 * told as a single path instead of a block of steps followed by a block of
 * roles. Every claim is something the product does today: no invented customer
 * counts, no logos we do not have, no roadmap features in the present tense.
 */

const STAGES = [
  {
    step: "01",
    who: "The agency",
    action: "Create the workspace",
    body: "Sign in with Google, name the agency and pick its address. It takes a minute, and nobody has to send a link first.",
    sees: "Their own workspace, ready to connect Google Ads.",
  },
  {
    step: "02",
    who: "The agency",
    action: "Connect Google Ads and add clients",
    body: "The owner signs in with the Google account that manages their MCC, then adds each client with an account number and email.",
    sees: "Their clients ranked by spend, with the trend and cost per result beside each one.",
  },
  {
    step: "03",
    who: "The client",
    action: "Open their own report",
    body: "One link, Continue with Google, and they are in. No passwords, no spreadsheets, no waiting for an email.",
    sees: "A plain sentence first, then the figures behind it, compared with the period before.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-canvas">
      <TopBar
        identity={<BrandLockup />}
        nav={
          <>
            <TopBarLink href="#how" label="How it works" />
            <TopBarLink href="#about" label="About" />
          </>
        }
        actions={
          <>
            <ThemeToggle />
            <ButtonLink href="/login" size="nav">
              Sign in
            </ButtonLink>
          </>
        }
      />

      <main>
        {/* Hero: fills the first screen, words on the left, motion on the right. */}
        <section className="mx-auto grid grid-cols-1 min-h-[calc(100vh-65px)] max-w-[1400px] items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="animate-rise inline-flex items-center gap-2 rounded-full bg-brand-tint px-3 py-1 text-xs font-medium text-brand">
              Built for Google Ads agencies
            </p>

            <h1 className="animate-rise delay-1 mt-6 text-4xl font-medium leading-[1.05] tracking-[-0.035em] text-ink sm:text-6xl xl:text-7xl">
              Google Ads reporting your{" "}
              <span className="text-brand">clients actually open</span>
            </h1>

            <p className="animate-rise delay-2 mt-6 max-w-xl text-base text-ink-soft sm:text-lg">
              Every client gets a live report at your agency&apos;s own address, showing
              what they spent, what it produced, and what each result cost.
            </p>

            <div className="animate-rise delay-3 mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/signup">Create your agency</ButtonLink>
              <ButtonLink href="/login" variant="secondary">
                Sign in
              </ButtonLink>
              <a
                href="#how"
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-soft ring-1 ring-line transition hover:bg-surface hover:text-ink"
              >
                See how it works
              </a>
            </div>

            <dl className="animate-rise delay-4 mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-6">
              <Fact label="Per client" value="Private" />
              <Fact label="Sign in" value="With Google" />
              <Fact label="Themes" value="Light & dark" />
            </dl>
          </div>

          <div className="animate-fade delay-2 h-[420px] sm:h-[520px] lg:h-[min(640px,calc(100vh-160px))]">
            <HeroVisual />
          </div>
        </section>

        {/* Roadmap: the six points, told as one path. */}
        <section id="how" className="scroll-mt-20 border-t border-line bg-surface py-20">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <SectionHeading eyebrow="How it works">
              Three stages, and your clients stop asking for updates
            </SectionHeading>

            <ol className="relative mt-14">
              {/* The spine the stages hang from. */}
              <span
                aria-hidden="true"
                className="absolute bottom-6 left-[19px] top-6 w-px bg-line-strong md:left-1/2"
              />

              {STAGES.map((stage, index) => (
                <li
                  key={stage.step}
                  className="relative grid grid-cols-1 gap-5 pb-14 pl-14 last:pb-0 md:grid-cols-2 md:gap-16 md:pl-0"
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white ring-4 ring-surface md:left-1/2 md:-translate-x-1/2"
                  >
                    {stage.step}
                  </span>

                  {/* What happens, on one side; what it unlocks, on the other.
                      The sides alternate so the eye follows the spine down. */}
                  <div className={index % 2 === 1 ? "md:order-2 md:pl-12" : "md:pr-12 md:text-right"}>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand">
                      {stage.who}
                    </p>
                    <h3 className="mt-1.5 text-xl font-medium tracking-[-0.02em] text-ink">
                      {stage.action}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-soft">{stage.body}</p>
                  </div>

                  <div className={index % 2 === 1 ? "md:order-1 md:pr-12" : "md:pl-12"}>
                    <div className="rounded-2xl bg-canvas p-5 ring-1 ring-line">
                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-faint">
                        {stage.who} now see{stage.who === "You" ? "" : "s"}
                      </p>
                      <p className="mt-1.5 text-sm text-ink">{stage.sees}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* About */}
        <section id="about" className="scroll-mt-20 py-20">
          <div className="mx-auto grid grid-cols-1 max-w-[1400px] gap-10 px-5 sm:px-8 lg:grid-cols-2">
            <div>
              <SectionHeading eyebrow="About">
                Built around one question a client asks
              </SectionHeading>
            </div>

            <div className="space-y-4 text-base leading-relaxed text-ink-soft">
              <p>
                Every client of a Google Ads agency eventually asks the same thing: is the
                money working? {PRODUCT_NAME} answers it on its own, without a monthly export
                or a screen-share.
              </p>
              <p>
                Each agency connects its own manager account once. Each client gets a private
                report of their own account and nothing else, with the change from the period
                before shown beside every figure.
              </p>
              <p>
                Agencies create their own workspace with Google. Clients join only when their
                agency adds them, and no agency can see another&apos;s clients.
              </p>

              <div className="flex flex-wrap gap-2 pt-4">
                <ButtonLink href="/signup">Create your agency</ButtonLink>
                <ButtonLink href="/login" variant="secondary">
                  Sign in
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-7">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-5 text-xs text-ink-faint sm:px-8">
          <span>{PRODUCT_NAME} — Google Ads reporting for agencies</span>
          <Link href="/login" className="transition hover:text-ink">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}

/** A heading with the short accent rule to its left. */
function SectionHeading({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <span aria-hidden="true" className="mt-1 w-1 shrink-0 rounded-full bg-brand" />
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand">{eyebrow}</p>
        <h2 className="mt-2 max-w-2xl text-3xl font-medium leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl">
          {children}
        </h2>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
