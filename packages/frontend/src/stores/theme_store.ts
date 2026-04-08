import { create } from 'zustand';

type Appearance = 'light' | 'dark' | 'inherit';

type ThemeState = {
  appearance: Appearance;
  isDark: boolean;
  setAppearance: (appearance: Appearance) => void;
};

function resolveIsDark(appearance: Appearance): boolean {
  if (appearance === 'inherit') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return appearance === 'dark';
}

function applyThemeClass(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark);
}

const stored = (localStorage.getItem('theme') as Appearance) || 'inherit';
const initialIsDark = resolveIsDark(stored);
applyThemeClass(initialIsDark);

export const useThemeStore = create<ThemeState>()((set) => ({
  appearance: stored,
  isDark: initialIsDark,
  setAppearance: (appearance) => {
    localStorage.setItem('theme', appearance);
    const isDark = resolveIsDark(appearance);
    applyThemeClass(isDark);
    set({ appearance, isDark });
  },
}));

// Listen to OS theme changes when in 'inherit' mode
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
mediaQuery.addEventListener('change', () => {
  const { appearance } = useThemeStore.getState();
  if (appearance === 'inherit') {
    const isDark = resolveIsDark(appearance);
    applyThemeClass(isDark);
    useThemeStore.setState({ isDark });
  }
});
