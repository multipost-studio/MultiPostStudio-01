import { AppLoader } from "@/components/ui/app-loader";

export default function Loading() {
  return (
    <div className="flex min-h-[55vh] w-full flex-col items-center justify-center py-16">
      <AppLoader
        variant="page"
        size="lg"
        state="thinking"
        text="Loading Admin Portal…"
        subtext="Aggregating platform metrics, organizations, and security status"
      />
    </div>
  );
}
