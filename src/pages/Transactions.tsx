import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Transaction, type Category, type Account } from '../db';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, ArrowRightLeft, Search, X } from 'lucide-react';
import { useUIStore } from '../store';

// Helper: group transactions by date
function groupByDate(transactions: Transaction[]): Record<string, Transaction[]> {
    const groups: Record<string, Transaction[]> = {};
    for (const tx of transactions) {
        const dateKey = tx.date.substring(0, 10); // YYYY-MM-DD
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(tx);
    }
    return groups;
}

function formatDateLabel(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (dateStr === today.toISOString().substring(0, 10)) return 'Today';
    if (dateStr === yesterday.toISOString().substring(0, 10)) return 'Yesterday';

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getDayTotal(txs: Transaction[]): { income: number; expense: number } {
    return txs.reduce(
        (acc, tx) => {
            if (tx.type === 'income') acc.income += tx.amount;
            if (tx.type === 'expense') acc.expense += tx.amount;
            return acc;
        },
        { income: 0, expense: 0 }
    );
}

export default function Transactions() {
    const { openDrawer, currency } = useUIStore();

    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    });

    const categories = useLiveQuery(() => db.categories.toArray()) || [];
    const accounts = useLiveQuery(() => db.accounts.toArray()) || [];

    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<Transaction['type'] | 'all'>('all');

    // Query transactions for the selected month
    const startOfMonth = new Date(selectedMonth.year, selectedMonth.month, 1).toISOString();
    const endOfMonth = new Date(selectedMonth.year, selectedMonth.month + 1, 0, 23, 59, 59).toISOString();

    const rawTransactions = useLiveQuery(
        () =>
            db.transactions
                .where('date')
                .between(startOfMonth, endOfMonth, true, true)
                .reverse()
                .sortBy('date'),
        [startOfMonth, endOfMonth]
    ) || [];

    const catMap = new Map(categories.map(c => [c.id!, c]));
    const accMap = new Map(accounts.map(a => [a.id!, a]));

    // Apply search and filter
    const transactions = rawTransactions.filter(tx => {
        if (filterType !== 'all' && tx.type !== filterType) return false;

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            const catName = (catMap.get(tx.categoryId || 0)?.name || 'Uncategorized').toLowerCase();
            const accName = (accMap.get(tx.accountId)?.name || '').toLowerCase();
            const note = (tx.note || '').toLowerCase();

            return catName.includes(query) || accName.includes(query) || note.includes(query);
        }
        return true;
    });

    const grouped = groupByDate(transactions);
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    // Month totals (calculated from raw data so the summary bar stays consistent even when filtering)
    const monthIncome = rawTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const monthExpense = rawTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    const navigateMonth = (delta: number) => {
        setSelectedMonth(prev => {
            let m = prev.month + delta;
            let y = prev.year;
            if (m < 0) { m = 11; y--; }
            if (m > 11) { m = 0; y++; }
            return { year: y, month: m };
        });
    };

    const monthLabel = new Date(selectedMonth.year, selectedMonth.month).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
    });

    const handleDelete = async (tx: Transaction) => {
        if (!confirm(`Delete this ${tx.type} of ${currency}${tx.amount.toFixed(2)}?`)) return;
        try {
            await db.transaction('rw', db.transactions, db.accounts, async () => {
                await db.transactions.delete(tx.id!);
                const acc = await db.accounts.get(tx.accountId);
                if (acc) {
                    let restored = acc.balance;
                    if (tx.type === 'income') restored = acc.balance - tx.amount;
                    else if (tx.type === 'expense') restored = acc.balance + tx.amount;
                    else if (tx.type === 'transfer') restored = acc.balance + tx.amount; // return to sender
                    await db.accounts.update(tx.accountId, { balance: restored });
                }
                if (tx.type === 'transfer' && tx.transferAccountId) {
                    const toAcc = await db.accounts.get(tx.transferAccountId);
                    if (toAcc) {
                        await db.accounts.update(toAcc.id!, { balance: toAcc.balance - tx.amount }); // remove from receiver
                    }
                }
            });
        } catch (err) {
            console.error('Delete failed', err);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 md:p-8 space-y-5 pb-20 max-w-2xl mx-auto"
        >
            {/* Month Selector */}
            <div className="flex items-center justify-between">
                <button onClick={() => navigateMonth(-1)} className="p-2 rounded-full hover:bg-card transition-colors">
                    <ChevronLeft size={20} className="text-foreground" />
                </button>
                <h2 className="text-lg font-semibold text-foreground">{monthLabel}</h2>
                <button onClick={() => navigateMonth(1)} className="p-2 rounded-full hover:bg-card transition-colors">
                    <ChevronRight size={20} className="text-foreground" />
                </button>
            </div>

            {/* Search and Filter */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        <Search size={16} className="text-slate-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search notes, categories..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-slate-400 transition-shadow"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-foreground"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
                <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                    className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer text-foreground"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em`, paddingRight: `2.5rem` }}
                >
                    <option value="all">All Types</option>
                    <option value="expense">Expenses</option>
                    <option value="income">Income</option>
                    <option value="transfer">Transfers</option>
                </select>
            </div>

            {/* Month Summary Bar */}
            <div className="flex gap-3">
                <div className="flex-1 bg-card rounded-2xl border border-border p-3 text-center">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Income</div>
                    <div className="text-base font-bold text-success">+{currency}{monthIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="flex-1 bg-card rounded-2xl border border-border p-3 text-center">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Expense</div>
                    <div className="text-base font-bold text-destructive">-{currency}{monthExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="flex-1 bg-card rounded-2xl border border-border p-3 text-center">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Balance</div>
                    <div className={`text-base font-bold ${monthIncome - monthExpense >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {monthIncome - monthExpense < 0 ? '-' : ''}{currency}{Math.abs(monthIncome - monthExpense).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                </div>
            </div>

            {/* Transaction List */}
            {sortedDates.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                    <div className="text-5xl mb-4">📝</div>
                    <div className="text-lg font-medium">No transactions yet</div>
                    <div className="text-sm mt-1">Tap the + button to add your first entry</div>
                </div>
            ) : (
                <div className="space-y-4">
                    <AnimatePresence>
                        {sortedDates.map(dateKey => {
                            const dayTxs = grouped[dateKey];
                            const dayTotals = getDayTotal(dayTxs);
                            return (
                                <motion.div
                                    key={dateKey}
                                    layout
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -50 }}
                                    className="space-y-1"
                                >
                                    {/* Date Header */}
                                    <div className="flex justify-between items-center px-1 mb-2">
                                        <span className="text-sm font-semibold text-foreground">{formatDateLabel(dateKey)}</span>
                                        <div className="flex gap-3 text-xs">
                                            {dayTotals.income > 0 && (
                                                <span className="text-success font-medium">+{currency}{dayTotals.income.toLocaleString()}</span>
                                            )}
                                            {dayTotals.expense > 0 && (
                                                <span className="text-destructive font-medium">-{currency}{dayTotals.expense.toLocaleString()}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Transaction Items */}
                                    <div className="bg-card rounded-2xl border border-border overflow-hidden divide-y divide-border">
                                        {dayTxs.map(tx => {
                                            const cat = catMap.get(tx.categoryId || 0);
                                            const acc = accMap.get(tx.accountId);
                                            return (
                                                <TransactionItem
                                                    key={tx.id}
                                                    tx={tx}
                                                    cat={cat}
                                                    acc={acc}
                                                    toAcc={tx.transferAccountId ? accMap.get(tx.transferAccountId) : undefined}
                                                    currency={currency}
                                                    onDelete={() => handleDelete(tx)}
                                                    onClick={() => openDrawer(tx)}
                                                />
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </motion.div>
    );
}

interface TransactionItemProps {
    tx: Transaction;
    cat?: Category;
    acc?: Account;
    toAcc?: Account;
    currency: string;
    onDelete: () => void;
    onClick: () => void;
}

function TransactionItem({ tx, cat, acc, toAcc, currency, onDelete, onClick }: TransactionItemProps) {
    const [showActions, setShowActions] = useState(false);

    return (
        <motion.div
            layout
            className="flex items-center px-4 py-3 gap-3 cursor-pointer hover:bg-background/50 transition-colors relative"
            onClick={(e) => {
                const target = e.target as HTMLElement;
                if (!target.closest('button')) {
                    onClick();
                }
            }}
            onContextMenu={(e) => {
                e.preventDefault();
                setShowActions(!showActions);
            }}
        >
            {/* Category Icon */}
            <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                    backgroundColor: tx.type === 'transfer' ? '#3b82f618' : (cat ? `${cat.color}18` : '#e2e8f018'),
                    color: tx.type === 'transfer' ? '#3b82f6' : (cat?.color || '#94a3b8'),
                }}
            >
                {tx.type === 'income' ? (
                    <ArrowUpRight size={18} />
                ) : tx.type === 'transfer' ? (
                    <ArrowRightLeft size={18} />
                ) : (
                    <ArrowDownRight size={18} />
                )}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                    {tx.type === 'transfer' ? 'Transfer' : (cat?.name || 'Uncategorized')}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {tx.type === 'transfer'
                        ? `${acc?.name || 'Unknown'} → ${toAcc?.name || 'Unknown'}`
                        : (acc?.name || 'Unknown')}
                    {tx.note ? ` · ${tx.note}` : ''}
                </div>
            </div>

            {/* Amount */}
            <div className={`text-sm font-bold flex-shrink-0 ${tx.type === 'income' ? 'text-success' : tx.type === 'transfer' ? 'text-blue-500' : 'text-destructive'}`}>
                {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '' : '-'}{currency}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>

            {/* Delete action overlay */}
            <AnimatePresence>
                {showActions && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                    >
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            className="p-2 bg-destructive text-white rounded-full shadow-md hover:bg-red-600 transition-colors"
                        >
                            <Trash2 size={16} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
