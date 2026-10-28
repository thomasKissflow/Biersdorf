// The Workbench colour theme: light unless the user switches to dark (copied from the portal's theme.tsx; its own
// storage key bdf-wb-theme, guarded: storage can be blocked in the Kissflow frame). workbench.html applies a
// remembered "dark" before the first paint; this provider keeps <html data-theme> in step.
import { Moon, Sun } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui/primitives";

export type Theme = "light" | "dark";
export const THEME_KEY = "bdf-wb-theme";

export function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
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
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === "light" ? "dark" : "light")), []);
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const ctx = useContext(ThemeContext);
  if (!ctx) return null;
  return (
    <IconButton label={ctx.theme === "light" ? "Dark theme" : "Light theme"} onClick={ctx.toggle}>
      {ctx.theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
    </IconButton>
  );
}
