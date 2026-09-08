import { Section, Prose } from "../_components";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main>
      <Section narrow>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">{title}</h1>
        <p className="mt-2 text-[14px] text-[var(--text-subtle)]">Last updated {updated}</p>
        <div className="mt-8">
          {/* There used to be a banner here saying "This is placeholder legal
              copy... not a real agreement and should not be relied on." On a
              live product that disclaims its own terms, and it is why Google's
              OAuth review failed the privacy policy for insufficient content —
              a reviewer reads that line first. */}
          <Prose>{children}</Prose>
        </div>
      </Section>
    </main>
  );
}
