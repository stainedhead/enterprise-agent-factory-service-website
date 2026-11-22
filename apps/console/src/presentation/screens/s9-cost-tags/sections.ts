// Shared list: the cards of S9 in order, added by the owning stream (M4-G here; M5-T adds *Tag status*).
import type { ComponentType } from "react";
import { ServiceTagsSection } from "./ServiceTagsSection.js";
import { SpendSection } from "./SpendSection.js";
import { TagStatusSection } from "./status/TagStatusSection.js";

export interface CostTagSection {
  readonly id: string;
  readonly Component: ComponentType;
}

export const sections: readonly CostTagSection[] = [
  { id: "tags", Component: ServiceTagsSection },
  { id: "spend", Component: SpendSection },
  { id: "status", Component: TagStatusSection },
];
