import { create } from 'zustand';
import type { Transaction } from './db';

type ThemeMode = 'system' | 'light' | 'dark';

function getInitialTheme(): ThemeMode {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') return 'dark';
    if (stored === 'light') return 'light';
    return 'system';
}

function applyThemeToDOM(mode: ThemeMode) {
    if (mode === 'dark') {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    } else if (mode === 'light') {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        localStorage.removeItem('theme');
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }
}

interface UIState {
    isDrawerOpen: boolean;
    editingTx: Transaction | null;
    currency: string;
    monthlyBudget: number | null;
    themeMode: ThemeMode;
    openDrawer: (tx?: Transaction) => void;
    closeDrawer: () => void;
    setCurrency: (c: string) => void;
    setMonthlyBudget: (budget: number | null) => void;
    setThemeMode: (mode: ThemeMode) => void;
    toggleTheme: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
    isDrawerOpen: false,
    editingTx: null,
    currency: localStorage.getItem('currency') || '$',
    monthlyBudget: localStorage.getItem('monthlyBudget') ? Number(localStorage.getItem('monthlyBudget')) : null,
    themeMode: getInitialTheme(),
    openDrawer: (tx) => set({ isDrawerOpen: true, editingTx: tx || null }),
    closeDrawer: () => set({ isDrawerOpen: false, editingTx: null }),
    setCurrency: (c) => {
        localStorage.setItem('currency', c);
        set({ currency: c });
    },
    setMonthlyBudget: (budget) => {
        if (budget === null) {
            localStorage.removeItem('monthlyBudget');
        } else {
            localStorage.setItem('monthlyBudget', budget.toString());
        }
        set({ monthlyBudget: budget });
    },
    setThemeMode: (mode) => {
        applyThemeToDOM(mode);
        set({ themeMode: mode });
    },
    toggleTheme: () => {
        const current = get().themeMode;
        const isDark = current === 'dark' || (current === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        const newMode: ThemeMode = isDark ? 'light' : 'dark';
        applyThemeToDOM(newMode);
        set({ themeMode: newMode });
    },
}));

// Apply theme on initial load
applyThemeToDOM(getInitialTheme());
