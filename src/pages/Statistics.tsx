import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useUIStore } from '../store';

const CHART_COLORS = [
    '#3b82f6', '#f87171', '#34d399', '#fbbf24', '#a78bfa',
    '#f472b6', '#38bdf8', '#fb923c', '#4ade80', '#e879f9',
];

export default function Statistics() {
    const { currency } = useUIStore();
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    });
    const [viewMode, setViewMode] = useState<'expense' | 'income'>('expense');

    const categories = useLiveQuery(() => db.categories.toArray()) || [];
    const allTransactions = useLiveQuery(() => db.transactions.toArray()) || [];

    const catMap = useMemo(() => new Map(categories.map(c => [c.id!, c])), [categories]);

    // Current month transactions
    const startOfMonth = new Date(selectedMonth.year, selectedMonth.month, 1).toISOString();
    const endOfMonth = new Date(selectedMonth.year, selectedMonth.month + 1, 0, 23, 59, 59).toISOString();

    const monthTxs = useMemo(
        () => allTransactions.filter(t => t.date >= startOfMonth && t.date <= endOfMonth),
        [allTransactions, startOfMonth, endOfMonth]
    );

    const filteredTxs = monthTxs.filter(t => t.type === viewMode);
    const totalAmount = filteredTxs.reduce((s, t) => s + t.amount, 0);

    // --- PIE CHART DATA: Category breakdown ---
    const categoryBreakdown = useMemo(() => {
        const map = new Map<number, number>();
        for (const tx of filteredTxs) {
            const catId = tx.categoryId || 0;
            map.set(catId, (map.get(catId) || 0) + tx.amount);
        }
        return Array.from(map.entries())
            .map(([catId, amount]) => {
                const cat = catMap.get(catId);
                return {
                    name: cat?.name || 'Uncategorized',
                    value: amount,
                    color: cat?.color || '#94a3b8',
                    percent: totalAmount > 0 ? ((amount / totalAmount) * 100).toFixed(1) : '0',
                };
            })
            .sort((a, b) => b.value - a.value);
    }, [filteredTxs, catMap, totalAmount]);

    // --- BAR CHART DATA: Last 6 months trend ---
    const monthlyTrend = useMemo(() => {
        const data = [];
        for (let i = 5; i >= 0; i--) {
            let m = selectedMonth.month - i;
            let y = selectedMonth.year;
            while (m < 0) { m += 12; y--; }

            const mStart = new Date(y, m, 1).toISOString();
            const mEnd = new Date(y, m + 1, 0, 23, 59, 59).toISOString();
            const mTxs = allTransactions.filter(t => t.date >= mStart && t.date <= mEnd);

            const income = mTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
            const expense = mTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

            const label = new Date(y, m).toLocaleDateString('en-US', { month: 'short' });
            data.push({ name: label, income, expense });
        }
        return data;
    }, [allTransactions, selectedMonth]);

    // --- Daily spending for daily breakdown ---
    const dailyBreakdown = useMemo(() => {
        const map = new Map<string, number>();
        for (const tx of filteredTxs) {
            const day = tx.date.substring(0, 10);
            map.set(day, (map.get(day) || 0) + tx.amount);
        }
        return Array.from(map.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([day, amount]) => ({
                day,
                label: new Date(day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                amount,
            }));
    }, [filteredTxs]);

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

    // Compare with last month
    const prevMonthStart = new Date(selectedMonth.year, selectedMonth.month - 1, 1).toISOString();
    const prevMonthEnd = new Date(selectedMonth.year, selectedMonth.month, 0, 23, 59, 59).toISOString();
    const prevMonthTotal = allTransactions
        .filter(t => t.date >= prevMonthStart && t.date <= prevMonthEnd && t.type === viewMode)
        .reduce((s, t) => s + t.amount, 0);
    const changePercent = prevMonthTotal > 0 ? (((totalAmount - prevMonthTotal) / prevMonthTotal) * 100) : 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 md:p-8 space-y-6 pb-20"
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

            {/* Expense / Income Toggle */}
            <div className="flex bg-card rounded-xl p-1 shadow-sm border border-border">
                <button
                    className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${viewMode === 'expense' ? 'bg-destructive text-white shadow' : 'text-slate-500 hover:text-foreground'}`}
                    onClick={() => setViewMode('expense')}
                >
                    Expenses
                </button>
                <button
                    className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${viewMode === 'income' ? 'bg-success text-white shadow' : 'text-slate-500 hover:text-foreground'}`}
                    onClick={() => setViewMode('income')}
                >
                    Income
                </button>
            </div>

            {/* Total + Comparison */}
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">
                    Total {viewMode === 'expense' ? 'Expenses' : 'Income'}
                </div>
                <div className="flex items-end gap-3">
                    <span className={`text-3xl font-bold ${viewMode === 'expense' ? 'text-destructive' : 'text-success'}`}>
                        {currency}{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    {prevMonthTotal > 0 && (
                        <span className={`text-xs font-medium flex items-center gap-0.5 px-2 py-1 rounded-full ${changePercent > 0
                            ? (viewMode === 'expense' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400')
                            : (viewMode === 'expense' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400')
                            }`}>
                            {changePercent > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            {Math.abs(changePercent).toFixed(1)}% vs last month
                        </span>
                    )}
                </div>
            </div>

            {/* Pie Chart: Category Breakdown */}
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 pt-5 pb-2">
                    <h3 className="text-base font-semibold">Category Breakdown</h3>
                </div>

                {categoryBreakdown.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-sm">
                        No {viewMode} data this month
                    </div>
                ) : (
                    <>
                        {/* Chart */}
                        <div className="h-56 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={categoryBreakdown}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={55}
                                        outerRadius={85}
                                        paddingAngle={3}
                                        dataKey="value"
                                        strokeWidth={0}
                                    >
                                        {categoryBreakdown.map((entry, index) => (
                                            <Cell key={entry.name} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: number) => [`${currency}${value.toFixed(2)}`, '']}
                                        contentStyle={{
                                            borderRadius: '12px',
                                            border: 'none',
                                            boxShadow: '0 4px 12px rgb(0 0 0 / 0.12)',
                                            fontSize: '13px',
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Legend List */}
                        <div className="px-4 pb-4 space-y-2">
                            {categoryBreakdown.map((item, index) => (
                                <div key={item.name} className="flex items-center gap-3 py-2">
                                    <div
                                        className="w-3 h-3 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: item.color || CHART_COLORS[index % CHART_COLORS.length] }}
                                    />
                                    <span className="flex-1 text-sm text-foreground">{item.name}</span>
                                    <span className="text-sm font-medium text-foreground">{currency}{item.value.toFixed(2)}</span>
                                    <span className="text-xs text-slate-400 w-12 text-right">{item.percent}%</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Bar Chart: 6-Month Trend */}
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                <h3 className="text-base font-semibold mb-4">6-Month Trend</h3>
                <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyTrend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `${currency}${v}`} />
                            <Tooltip
                                formatter={(value: number, name: string) => [`${currency}${value.toFixed(2)}`, name.charAt(0).toUpperCase() + name.slice(1)]}
                                contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 12px rgb(0 0 0 / 0.12)',
                                    fontSize: '13px',
                                }}
                            />
                            <Bar dataKey="income" fill="#34d399" radius={[6, 6, 0, 0]} barSize={20} />
                            <Bar dataKey="expense" fill="#f87171" radius={[6, 6, 0, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <div className="w-3 h-3 rounded-sm bg-success" /> Income
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <div className="w-3 h-3 rounded-sm bg-destructive" /> Expense
                    </div>
                </div>
            </div>

            {/* Daily Breakdown */}
            {dailyBreakdown.length > 0 && (
                <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                    <div className="px-5 pt-5 pb-2">
                        <h3 className="text-base font-semibold">Daily {viewMode === 'expense' ? 'Spending' : 'Earnings'}</h3>
                    </div>
                    <div className="divide-y divide-border">
                        {dailyBreakdown.map(d => (
                            <div key={d.day} className="flex items-center px-5 py-3 gap-3">
                                <div className={`p-2 rounded-full ${viewMode === 'expense' ? 'bg-destructive/10' : 'bg-success/10'}`}>
                                    {viewMode === 'expense' ? (
                                        <ArrowDownRight size={16} className="text-destructive" />
                                    ) : (
                                        <ArrowUpRight size={16} className="text-success" />
                                    )}
                                </div>
                                <span className="flex-1 text-sm text-foreground">{d.label}</span>
                                <span className={`text-sm font-bold ${viewMode === 'expense' ? 'text-destructive' : 'text-success'}`}>
                                    {currency}{d.amount.toFixed(2)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </motion.div>
    );
}
