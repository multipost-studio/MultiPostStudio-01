// Re-mounts on every navigation in the admin panel, replaying the page entrance (see .mps-page-in).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="mps-page-in">{children}</div>;
}
