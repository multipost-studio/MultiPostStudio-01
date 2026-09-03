"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ButtonProps } from "@/components/ui/button";

/**
 * Client button that reloads the current route. Used on system pages
 * (500 / 503 / offline) that are otherwise static server components.
 */
export function ReloadButton({
  children = "Try again",
  ...props
}: Omit<ButtonProps, "onClick">) {
  return (
    <Button
      size="md"
      className="w-full sm:w-auto"
      onClick={() => window.location.reload()}
      {...props}
    >
      <RotateCw size={15} aria-hidden />
      {children}
    </Button>
  );
}
