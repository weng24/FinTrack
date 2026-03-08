import Dexie, { type EntityTable } from 'dexie';

export interface Category {
    id?: number;
    name: string;
    type: 'income' | 'expense';
    icon: string;
    color: string;
}

export interface Account {
    id?: number;
    name: string;
    type: 'cash' | 'bank' | 'credit' | 'investment';
    balance: number;
}

export interface Transaction {
    id?: number;
    amount: number;
    type: 'expense' | 'income' | 'transfer';
    categoryId: number | null; // null for transfers
    accountId: number;
    transferAccountId?: number; // the destination account id for transfers
    date: string; // ISO string YYYY-MM-DDTHH:mm:ss.sssZ
    note?: string;
    createdAt: string;
}

const db = new Dexie('FinTrackDB') as Dexie & {
    categories: EntityTable<Category, 'id'>;
    accounts: EntityTable<Account, 'id'>;
    transactions: EntityTable<Transaction, 'id'>;
};

// Schema declaration
db.version(1).stores({
    categories: '++id, type, name',
    accounts: '++id, type, name',
    transactions: '++id, type, date, accountId, categoryId',
});

// Seed initial data if empty
db.on('populate', async () => {
    await db.categories.bulkAdd([
        // Expense categories
        { name: 'Food', type: 'expense', icon: 'utensils', color: '#f87171' },
        { name: 'Transport', type: 'expense', icon: 'bus', color: '#60a5fa' },
        { name: 'Shopping', type: 'expense', icon: 'shopping-bag', color: '#f472b6' },
        { name: 'Entertainment', type: 'expense', icon: 'gamepad', color: '#a78bfa' },
        { name: 'Housing', type: 'expense', icon: 'home', color: '#fb923c' },
        { name: 'Health', type: 'expense', icon: 'heart-pulse', color: '#34d399' },
        { name: 'Education', type: 'expense', icon: 'graduation', color: '#38bdf8' },
        { name: 'Bills', type: 'expense', icon: 'receipt', color: '#fbbf24' },
        { name: 'Other', type: 'expense', icon: 'more', color: '#94a3b8' },
        // Income categories
        { name: 'Salary', type: 'income', icon: 'briefcase', color: '#34d399' },
        { name: 'Freelance', type: 'income', icon: 'laptop', color: '#60a5fa' },
        { name: 'Investment', type: 'income', icon: 'trending-up', color: '#a78bfa' },
        { name: 'Gift', type: 'income', icon: 'gift', color: '#f472b6' },
        { name: 'Other Income', type: 'income', icon: 'plus-circle', color: '#fbbf24' },
    ]);

    await db.accounts.add({
        name: 'Cash',
        type: 'cash',
        balance: 0,
    });
});

// Predefined color palette for new categories
export const CATEGORY_COLORS = [
    '#f87171', '#fb923c', '#fbbf24', '#34d399', '#38bdf8',
    '#60a5fa', '#a78bfa', '#f472b6', '#e879f9', '#94a3b8',
];

export { db };
