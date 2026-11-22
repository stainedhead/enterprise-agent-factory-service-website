import type { ReactNode } from "react";
import s from "./ui.module.css";

const TONE = {
  blue: s.badgeBlue,
  purple: s.badgePurple,
  grey: s.badgeGrey,
  amber: s.badgeAmber,
} as const;

/** A small label, for example *Unmetered*, *Template retired*, *Ephemeral*. */
export function Badge({
  children,
  tone = "grey",
}: {
  children: ReactNode;
  tone?: keyof typeof TONE;
}) {
  return <span className={`${s.badge} ${TONE[tone]}`}>{children}</span>;
}
