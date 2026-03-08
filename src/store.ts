import { create } from 'zustand';
import type { Transaction } from './db';

interface UIState {
    isDrawerOpen: boolean;
    editingTx: Transaction | null;
    currency: string;
    monthlyBudget: number | null;
    openDrawer: (tx?: Transaction) => void;
    closeDrawer: () => void;
    setCurrency: (c: string) => void;
    setMonthlyBudget: (budget: number | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
    isDrawerOpen: false,
    editingTx: null,
    currency: localStorage.getItem('currency') || '$',
    monthlyBudget: localStorage.getItem('monthlyBudget') ? Number(localStorage.getItem('monthlyBudget')) : null,
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
}));
