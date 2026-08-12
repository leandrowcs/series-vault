import type { LucideIcon } from "lucide-react";
import type { TrackedSeries } from "./series";

export type ActiveTab = "home" | "tracked" | "calendar" | "stats";

export type LibraryFilter =
  | "watching"
  | "waiting"
  | "finished"
  | "abandoned"
  | "all";

export type LibraryViewMode = "covers" | "list";

export type TabTransitionDirection = "slide-left" | "slide-right";

export type SeriesModalTab = "details" | "seasons";

export type LibrarySeriesStatus =
  | "watching"
  | "waiting"
  | "finished"
  | "abandoned"
  | "notStarted";

export type DashboardMetric = {
  label: string;
  value: string;
  icon: LucideIcon;
  layout: "compact" | "wide";
  tone: "cyan" | "purple" | "amber" | "green";
};

export type LibrarySeriesGroup = {
  id: string;
  label: string;
  series: TrackedSeries[];
  collapsible: boolean;
};

export type SeriesActionValue =
  | "added"
  | "abandoned"
  | "abandon"
  | "reactivate"
  | "remove";
