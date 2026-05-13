import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'admin-studio-ui.theme';

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
}>({
  theme: 'system',
  setTheme: () => undefined,
});

function resolveSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveInitialTheme(storedTheme: string | null): Theme {
  if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
    return storedTheme;
  }
  return 'system';
}

export function ThemeProvider(props: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window === 'undefined' ? 'system' : resolveInitialTheme(localStorage.getItem(STORAGE_KEY)),
  );

  useEffect(() => {
    const root = document.documentElement;
    const effective = theme === 'system' ? resolveSystemTheme() : theme;
    root.dataset.theme = effective;
    root.style.colorScheme = effective;
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const effective = media.matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = effective;
      document.documentElement.style.colorScheme = effective;
    };
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme: (nextTheme: Theme) => {
        setThemeState(nextTheme);
        localStorage.setItem(STORAGE_KEY, nextTheme);
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
