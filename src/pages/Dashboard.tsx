import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Wallet, ChevronRight, CreditCard, Building2, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useUIStore } from '../store';

export default function Dashboard() {
    const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
    const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
    const categories = useLiveQuery(() => db.categories.toArray()) || [];
    const { currency, monthlyBudget } = useUIStore();

    const catMap = new Map(categories.map(c => [c.id!, c]));
    const accMap = new Map(accounts.map(a => [a.id!, a]));

    const totalBalance = accounts.reduce((acc, curr) => acc + curr.balance, 0);

    // Calculate this month's income and expenses
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const thisMonthTxs = transactions.filter(t => t.date >= startOfMonth);
    const totalIncome = thisMonthTxs.filter(t => t.type === 'income').reduce((acc, curr) => acc + curr.amount, 0);
    const totalExpense = thisMonthTxs.filter(t => t.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0);

    // Recent 5 transactions
    const recentTxs = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

    // Last 7 days cashflow data for chart
    const chartData = useMemo(() => {
        const data = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dayStr = d.toISOString().substring(0, 10);
            const label = d.toLocaleDateString('en-US', { weekday: 'short' });

            const dayTxs = transactions.filter(t => t.date.substring(0, 10) === dayStr);
            const income = dayTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
            const expense = dayTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

            data.push({ name: label, balance: income - expense });
        }
        // Convert to cumulative
        let cumulative = 0;
        for (const d of data) {
            cumulative += d.balance;
            d.balance = cumulative;
        }
        return data;
    }, [transactions]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 md:p-8 space-y-6 pb-20"
        >
            {/* Total Balance Card */}
            <div className="bg-gradient-to-br from-primary to-blue-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-500/20">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-blue-100 font-medium">Total Net Worth</span>
                    <Wallet className="text-blue-200" size={24} />
                </div>
                <div className="text-4xl font-bold tracking-tight">
                    {currency}{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
            </div>

            {/* Individual Accounts List (Horizontal Scroll) */}
            {accounts.length > 0 && (
                <div className="-mx-4 md:mx-0 px-4 md:px-0">
                    <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        {accounts.map(acc => {
                            let Icon = Wallet;
                            if (acc.type === 'bank') Icon = Building2;
                            if (acc.type === 'credit') Icon = CreditCard;
                            if (acc.type === 'investment') Icon = TrendingUp;

                            return (
                                <Link
                                    to="/settings"
                                    key={acc.id}
                                    className="snap-start shrink-0 w-[140px] bg-card border border-border rounded-2xl p-3.5 shadow-sm hover:border-primary/30 transition-colors"
                                >
                                    <div className="flex items-center gap-2 mb-2 text-slate-500 dark:text-slate-400">
                                        <Icon size={16} className="text-primary/70" />
                                        <span className="text-xs font-medium truncate">{acc.name}</span>
                                    </div>
                                    <div className="text-base font-bold text-foreground">
                                        {currency}{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Income & Expense Summary */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-card p-4 rounded-2xl border border-border shadow-sm flex flex-col justify-center">
                    <div className="flex items-center space-x-4">
                        <div className="p-3 bg-success/10 rounded-full shrink-0">
                            <ArrowUpRight className="text-success" size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm text-slate-500 dark:text-slate-400">Income</div>
                            <div className="text-lg font-bold text-success truncate">+{currency}{totalIncome.toLocaleString()}</div>
                        </div>
                    </div>
                </div>
                <div className="bg-card p-4 rounded-2xl border border-border shadow-sm flex flex-col justify-center">
                    <div className="flex items-center space-x-4">
                        <div className="p-3 bg-destructive/10 rounded-full shrink-0">
                            <ArrowDownRight className="text-destructive" size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm text-slate-500 dark:text-slate-400 flex justify-between items-center">
                                <span>Expenses</span>
                                {monthlyBudget && (
                                    <span className="text-[10px] text-slate-400 font-medium truncate ml-1">
                                        / {currency}{monthlyBudget.toLocaleString()}
                                    </span>
                                )}
                            </div>
                            <div className="text-lg font-bold text-destructive truncate">-{currency}{totalExpense.toLocaleString()}</div>
                        </div>
                    </div>
                    {monthlyBudget && (
                        <div className="mt-3 w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${totalExpense > monthlyBudget ? 'bg-red-500' : 'bg-primary'}`}
                                style={{ width: `${Math.min((totalExpense / monthlyBudget) * 100, 100)}%` }}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Chart Section */}
            <div className="bg-card p-4 rounded-2xl border border-border shadow-sm">
                <h3 className="text-lg font-semibold mb-4 px-2">Cashflow Trend</h3>
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Area type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorBalance)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                    <h3 className="text-lg font-semibold">Recent Transactions</h3>
                    <Link to="/transactions" className="text-primary text-sm font-medium flex items-center gap-1 hover:underline">
                        View All <ChevronRight size={14} />
                    </Link>
                </div>
                {recentTxs.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                        No transactions yet. Tap + to add one!
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {recentTxs.map(tx => {
                            const cat = catMap.get(tx.categoryId || 0);
                            const acc = accMap.get(tx.accountId);
                            return (
                                <div key={tx.id} className="flex items-center px-4 py-3 gap-3">
                                    <div
                                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{
                                            backgroundColor: cat ? `${cat.color}18` : '#e2e8f018',
                                            color: cat?.color || '#94a3b8',
                                        }}
                                    >
                                        {tx.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-foreground truncate">{cat?.name || 'Uncategorized'}</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{acc?.name}{tx.note ? ` · ${tx.note}` : ''}</div>
                                    </div>
                                    <div className={`text-sm font-bold flex-shrink-0 ${tx.type === 'income' ? 'text-success' : 'text-destructive'}`}>
                                        {tx.type === 'income' ? '+' : '-'}{currency}{tx.amount.toFixed(2)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

        </motion.div>
    );
}
