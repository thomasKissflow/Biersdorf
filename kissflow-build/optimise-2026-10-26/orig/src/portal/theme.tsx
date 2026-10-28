// The portal's colour theme: light unless the user switches to dark. One source of truth for the whole portal
// (master.md §6.11). The choice is remembered per browser (guarded: storage can be blocked in the Kissflow frame).
// portal.html applies a remembered "dark" before the first paint; this provider keeps <html data-theme> in step.
import { Moon, Sun } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui";

export type Theme = "light" | "dark";
const KEY = "bdf-theme";

export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

const ThemeContext = createContext<{ theme: Theme; toggle(): void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === "light" ? "dark" : "light")), []);
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle({ round }: { round?: boolean } = {}) {
  const ctx = useContext(ThemeContext);
  if (!ctx) return null;
  const label = ctx.theme === "light" ? "Dark theme" : "Light theme";
  // the same button as Reload (32 px, 16 px icon), shown as a small soft circle
  if (round)
    return (
      <IconButton label={label} onClick={ctx.toggle} className="shrink-0 rounded-full bg-surface-2 hover:bg-surface-3">
        {ctx.theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
      </IconButton>
    );
  return (
    <IconButton label={ctx.theme === "light" ? "Dark theme" : "Light theme"} onClick={ctx.toggle}>
      {ctx.theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
    </IconButton>
  );
}
