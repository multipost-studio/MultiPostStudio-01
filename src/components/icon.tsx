import * as Lucide from "lucide-react";
import type { LucideProps } from "lucide-react";

/** Render a lucide icon by name (used with string-configured nav). */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = (Lucide as unknown as Record<string, React.ComponentType<LucideProps>>)[name];
  if (!Cmp) return <Lucide.Circle {...props} />;
  return <Cmp {...props} />;
}
