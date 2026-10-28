/**
 * ThemeSwitcher — lets a user flip the app's live anchor (Beacon, Compass, Dusk, Cove, Nova, …)
 * at runtime. Reads the SAME registry the app boots from: `THEMES` / `applyTheme` / `getTheme`,
 * generated per-app at `src/themes.js` by engine/emit-live-themes.mjs from reference/ui-themes.json
 * — this component is pipeline output's consumer, not a second copy of the registry.
 *
 * 2026-08-13 — added alongside Compass/Dusk/Cove/Nova (the first sibling re-hues since Beacon went
 * solo 2026-08-12).
 *
 * Two variants, one component (not a fork — kit-install.mjs ships one file either way):
 *   variant="header"  (default) — mirrors app-shell.jsx's RoleSwitcher shape 1:1 (label + select-
 *                       styled pill trigger, dropdown align="end"), for sitting beside it in a
 *                       header row.
 *   variant="sidebar" — 2026-08-13, on request: theme is a display preference, the same axis as
 *                       dark mode, not a page-contextual control like "viewing as <role>" — so it
 *                       moved to the sidebar footer, just above the dark-mode toggle. Matches that
 *                       button's own shape exactly (kit Button, rank="outline" size="sm", full
 *                       width, transparent border) rather than the header's compact pill, since it
 *                       now sits in that same narrow w-60 column doing the same job.
 *
 * RENDERS NOTHING below 2 anchors — the "visible THEMES picker UI a generated app might render (a
 * one-option picker)" emit-live-themes.mjs flagged as an undecided UX call. Deciding it here: a
 * switcher with one option is not a switcher, it's dead chrome. A brand-new app scaffolded with
 * only Beacon in its registry mounts this and gets nothing, silently — no prop, no opt-out needed.
 */
import { useState } from "react";
import { Check, Palette } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "./Floating";
import { Button } from "./Buttons";
import { THEMES, applyTheme, getTheme } from "@/themes";

export function ThemeSwitcher({ variant = "header", className = "" }) {
  const [current, setCurrent] = useState(() => getTheme() || THEMES[0]?.id);
  if (THEMES.length < 2) return null;

  const active = THEMES.find((t) => t.id === current) || THEMES[0];

  function pick(id) {
    applyTheme(id);
    setCurrent(id);
  }

  const swatch = (t) => <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.swatch }} />;
  const menu = (
    <DropdownMenuContent align={variant === "sidebar" ? "start" : "end"} className="w-52">
      <DropdownMenuLabel>Switch theme</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {THEMES.map((t) => (
        <DropdownMenuItem key={t.id} onSelect={() => pick(t.id)} className="gap-2">
          {swatch(t)}
          <span className="flex-1 truncate">{t.label}</span>
          {t.id === active.id && <Check className="size-3.5 shrink-0" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );

  if (variant === "sidebar") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            rank="outline"
            size="sm"
            className={"w-full justify-start gap-2 border-transparent text-sidebar-muted hover:border-[#DDE0E4] " + className}
          >
            {swatch(active)}
            <span className="flex-1 truncate text-left">{active.label}</span>
            <Palette className="size-4 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    );
  }

  return (
    <div className={"flex items-center gap-2 " + className}>
      <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">Theme</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-9 max-w-[200px] cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground outline-none transition-colors hover:border-text-subtle focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0"
          >
            {swatch(active)}
            <span className="truncate">{active.label}</span>
            <Palette className="size-3.5 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    </div>
  );
}
