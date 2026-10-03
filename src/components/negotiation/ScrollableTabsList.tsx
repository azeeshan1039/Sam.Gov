"use client";

import type { FocusEvent, ReactNode } from "react";
import { TabsList } from "@/components/ui/tabs";

interface ScrollableTabsListProps {
  children: ReactNode;
  label?: string;
}

/** Keeps any number of vendor tabs on one keyboard-accessible, scrollable row. */
export function ScrollableTabsList({
  children,
  label = "Vendor negotiations",
}: ScrollableTabsListProps) {
  const revealFocusedTab = (event: FocusEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.getAttribute("role") === "tab") {
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  return (
    <div
      aria-label={label}
      className="mb-6 w-full overflow-x-auto overflow-y-hidden pb-2"
      data-testid="vendor-tabs-scroll"
      onFocusCapture={revealFocusedTab}
      role="region"
      tabIndex={0}
    >
      <TabsList className="flex h-auto w-max min-w-full justify-start gap-1">
        {children}
      </TabsList>
    </div>
  );
}
