import { AppLoader } from "@/components/ui/app-loader";

export default function AuthLoading() {
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center py-12">
      <AppLoader
        variant="page"
        size="lg"
        state="thinking"
        text="Authenticating…"
        subtext="Verifying credentials and establishing your secure session"
      />
    </div>
  );
}
