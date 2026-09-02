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
          <Prose>
            <p className="rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-3 text-[14px]">
              This is placeholder legal copy for an original demo product. It is not a real agreement and
              should not be relied on. Replace with counsel-reviewed text before production use.
            </p>
            {children}
          </Prose>
        </div>
      </Section>
    </main>
  );
}
