// Re-mounts on every navigation inside the app shell, replaying the entrance.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="mps-page-in">{children}</div>;
}
