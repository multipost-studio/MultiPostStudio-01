import { AppLoader } from "@/components/ui/app-loader";

export default function RootLoading() {
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center bg-[var(--bg)] px-4">
      <AppLoader
        variant="page"
        size="lg"
        state="thinking"
        text="Loading MultiPost Studio…"
        subtext="Preparing your workspace and connected channels"
      />
    </div>
  );
}
