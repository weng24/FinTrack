import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Trash2, ArrowRightLeft } from 'lucide-react';
import { db, CATEGORY_COLORS } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useUIStore } from '../store';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function AddTransactionDrawer({ isOpen, onClose }: Props) {
    const { editingTx, currency } = useUIStore();

    const categories = useLiveQuery(() => db.categories.toArray()) || [];
    const accounts = useLiveQuery(() => db.accounts.toArray()) || [];

    const [amount, setAmount] = useState('');
    const [type, setType] = useState<'expense' | 'income' | 'transfer'>('expense');
    const [selectedCat, setSelectedCat] = useState<number | null>(null);
    const [selectedAcc, setSelectedAcc] = useState<number | null>(null);
    const [transferAcc, setTransferAcc] = useState<number | null>(null);
    const [note, setNote] = useState('');
    const [date, setDate] = useState('');

    // Add Category inline dialog state
    const [showAddCat, setShowAddCat] = useState(false);
    const [newCatName, setNewCatName] = useState('');
    const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0]);

    // Delete mode
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

    // Initialize state when drawer opens
    useEffect(() => {
        if (isOpen) {
            if (editingTx) {
                setAmount(editingTx.amount.toString());
                setType(editingTx.type);
                setSelectedCat(editingTx.categoryId);
                setSelectedAcc(editingTx.accountId);
                setTransferAcc(editingTx.transferAccountId || null);
                setNote(editingTx.note || '');
                setDate(editingTx.date.substring(0, 10)); // Extract YYYY-MM-DD
            } else {
                setAmount('');
                setType('expense');
                setSelectedCat(null);
                setSelectedAcc(accounts.length > 0 ? accounts[0].id! : null);
                setTransferAcc(accounts.length > 1 ? accounts[1].id! : null);
                setNote('');
                // Use local date for YYYY-MM-DD
                const d = new Date();
                const localDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
                setDate(localDate);
            }
        }
    }, [isOpen, editingTx, accounts.length]);

    // Default selection fallback if changing accounts
    useEffect(() => {
        if (accounts.length > 0 && selectedAcc === null && !editingTx) {
            setSelectedAcc(accounts[0].id!);
        }
        if (accounts.length > 1 && transferAcc === null && !editingTx) {
            setTransferAcc(accounts.find(a => a.id !== selectedAcc)?.id || accounts[1].id!);
        }
    }, [accounts, selectedAcc, transferAcc, editingTx]);


    const handleSave = async () => {
        if (!amount || isNaN(Number(amount)) || !selectedAcc) return;
        if (type !== 'transfer' && !selectedCat) return;
        if (type === 'transfer' && (!transferAcc || selectedAcc === transferAcc)) return;

        const numAmount = Number(amount);
        const parsedAmount = parseFloat(numAmount.toFixed(2));

        try {
            await db.transaction('rw', db.transactions, db.accounts, async () => {

                const adjustBalance = async (accId: number, delta: number) => {
                    const acc = await db.accounts.get(accId);
                    if (acc) {
                        await db.accounts.update(accId, { balance: acc.balance + delta });
                    }
                };

                // 1. If editing, revert previous effects
                if (editingTx) {
                    if (editingTx.type === 'expense') {
                        await adjustBalance(editingTx.accountId, editingTx.amount);
                    } else if (editingTx.type === 'income') {
                        await adjustBalance(editingTx.accountId, -editingTx.amount);
                    } else if (editingTx.type === 'transfer') {
                        await adjustBalance(editingTx.accountId, editingTx.amount);
                        if (editingTx.transferAccountId) {
                            await adjustBalance(editingTx.transferAccountId, -editingTx.amount);
                        }
                    }
                }

                // 2. Apply new transaction effects
                if (type === 'expense') {
                    await adjustBalance(selectedAcc, -parsedAmount);
                } else if (type === 'income') {
                    await adjustBalance(selectedAcc, parsedAmount);
                } else if (type === 'transfer') {
                    await adjustBalance(selectedAcc, -parsedAmount);
                    if (transferAcc) {
                        await adjustBalance(transferAcc, parsedAmount);
                    }
                }

                // 3. Save or update
                const timeStr = editingTx ? editingTx.date.substring(10) : new Date().toISOString().substring(10);
                const fullDate = date + timeStr;

                const txObj = {
                    amount: parsedAmount,
                    type,
                    categoryId: type === 'transfer' ? null : selectedCat,
                    accountId: selectedAcc,
                    transferAccountId: type === 'transfer' ? (transferAcc || undefined) : undefined,
                    date: fullDate,
                    note,
                    createdAt: editingTx ? editingTx.createdAt : new Date().toISOString(),
                };

                if (editingTx && editingTx.id) {
                    await db.transactions.update(editingTx.id, txObj);
                } else {
                    await db.transactions.add(txObj as any);
                }
            });

            onClose();
        } catch (error) {
            console.error("Failed to save transaction", error);
            alert('Error saving transaction');
        }
    };

    const handleAddCategory = async () => {
        const trimmed = newCatName.trim();
        if (!trimmed) return;

        try {
            const newId = await db.categories.add({
                name: trimmed,
                type: type === 'expense' || type === 'income' ? type : 'expense',
                icon: 'tag',
                color: newCatColor,
            });
            setSelectedCat(newId as number);
            setNewCatName('');
            setShowAddCat(false);
        } catch (error) {
            console.error("Failed to add category", error);
        }
    };

    const handleDeleteCategory = async (catId: number) => {
        try {
            const txCount = await db.transactions.where('categoryId').equals(catId).count();
            if (txCount > 0) {
                alert(`Cannot delete: ${txCount} transaction(s) use this category. Remove or reassign them first.`);
                setDeleteConfirmId(null);
                return;
            }
            await db.categories.delete(catId);
            if (selectedCat === catId) setSelectedCat(null);
            setDeleteConfirmId(null);
        } catch (error) {
            console.error("Failed to delete category", error);
        }
    };

    const filteredCategories = categories.filter(c => c.type === type);

    const isTransferValid = type !== 'transfer' || (selectedAcc !== transferAcc);
    const isSaveEnabled = amount && (type === 'transfer' ? (isTransferValid && transferAcc !== null) : selectedCat !== null);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed bottom-0 left-0 right-0 max-w-2xl mx-auto h-[85vh] bg-background border-t border-border rounded-t-3xl z-50 flex flex-col shadow-2xl"
                    >
                        {/* Header */}
                        <div className="flex justify-between items-center p-4 border-b border-border">
                            <button onClick={onClose} className="p-2 rounded-full hover:bg-card text-slate-500">
                                <X size={24} />
                            </button>
                            <h2 className="text-lg font-semibold">{editingTx ? 'Edit Transaction' : 'New Transaction'}</h2>
                            <button
                                onClick={handleSave}
                                disabled={!isSaveEnabled}
                                className="p-2 rounded-full bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:bg-transparent"
                            >
                                <Check size={24} />
                            </button>
                        </div>

                        {/* Content Form */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">

                            {/* Type Toggle */}
                            <div className="flex bg-card rounded-xl p-1 shadow-sm border border-border">
                                <button
                                    type="button"
                                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${type === 'expense' ? 'bg-destructive text-white shadow' : 'text-slate-500 hover:text-foreground'}`}
                                    onClick={() => { setType('expense'); setSelectedCat(null); setDeleteConfirmId(null); }}
                                >
                                    Expense
                                </button>
                                <button
                                    type="button"
                                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${type === 'income' ? 'bg-success text-white shadow' : 'text-slate-500 hover:text-foreground'}`}
                                    onClick={() => { setType('income'); setSelectedCat(null); setDeleteConfirmId(null); }}
                                >
                                    Income
                                </button>
                                <button
                                    type="button"
                                    className={`flex-1 flex items-center justify-center gap-1 py-2 text-sm font-medium rounded-lg transition-colors ${type === 'transfer' ? 'bg-blue-500 text-white shadow' : 'text-slate-500 hover:text-foreground'}`}
                                    onClick={() => { setType('transfer'); setSelectedCat(null); setDeleteConfirmId(null); }}
                                >
                                    Transfer
                                </button>
                            </div>

                            {/* Amount & Date Input */}
                            <div className="text-center flex flex-col items-center">
                                <div className="text-sm text-slate-500 mb-2">Amount ({currency})</div>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={amount}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) setAmount(val);
                                    }}
                                    placeholder="0.00"
                                    className="w-full text-5xl font-bold bg-transparent text-center focus:outline-none placeholder:text-slate-300 dark:placeholder:text-slate-700"
                                    autoFocus
                                />

                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="mt-4 bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary appearance-none max-w-[150px] text-center"
                                />
                            </div>

                            {/* Category Grid (Hide for Transfer) */}
                            {type !== 'transfer' && (
                                <div>
                                    <div className="text-sm font-medium text-slate-500 mb-3">Category</div>
                                    <div className="grid grid-cols-4 gap-3">
                                        {filteredCategories.map(cat => (
                                            <div key={cat.id} className="relative">
                                                <button
                                                    onClick={() => {
                                                        setSelectedCat(cat.id!);
                                                        setDeleteConfirmId(null);
                                                    }}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        setDeleteConfirmId(deleteConfirmId === cat.id! ? null : cat.id!);
                                                    }}
                                                    className={`w-full flex flex-col items-center justify-center p-3 rounded-2xl transition-all ${selectedCat === cat.id
                                                        ? 'bg-primary/10 ring-2 ring-primary border-transparent'
                                                        : 'bg-card border border-border hover:border-slate-400'
                                                        }`}
                                                >
                                                    <div
                                                        className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
                                                        style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                                                    >
                                                        <span className="text-xs font-semibold uppercase">{cat.name.substring(0, 2)}</span>
                                                    </div>
                                                    <span className="text-xs text-foreground truncate w-full text-center">{cat.name}</span>
                                                </button>

                                                {/* Delete overlay */}
                                                <AnimatePresence>
                                                    {deleteConfirmId === cat.id && (
                                                        <motion.button
                                                            initial={{ opacity: 0, scale: 0.8 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            exit={{ opacity: 0, scale: 0.8 }}
                                                            onClick={() => handleDeleteCategory(cat.id!)}
                                                            className="absolute -top-2 -right-2 p-1.5 bg-destructive text-white rounded-full shadow-md z-10"
                                                        >
                                                            <Trash2 size={12} />
                                                        </motion.button>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        ))}

                                        {/* Add Category Button */}
                                        <button
                                            onClick={() => setShowAddCat(true)}
                                            className="flex flex-col items-center justify-center p-3 rounded-2xl border border-dashed border-border text-slate-400 hover:text-primary hover:border-primary transition-colors"
                                        >
                                            <span className="w-10 h-10 rounded-full flex items-center justify-center bg-card text-xl">+</span>
                                            <span className="text-xs mt-2">New</span>
                                        </button>
                                    </div>

                                    <div className="text-[10px] text-slate-400 mt-2 text-center">
                                        Right-click a category to delete it
                                    </div>
                                </div>
                            )}

                            {/* Add Category Inline Dialog */}
                            <AnimatePresence>
                                {showAddCat && type !== 'transfer' && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm font-semibold">New {type === 'expense' ? 'Expense' : 'Income'} Category</span>
                                                <button onClick={() => { setShowAddCat(false); setNewCatName(''); }} className="text-slate-400 hover:text-foreground">
                                                    <X size={16} />
                                                </button>
                                            </div>

                                            <input
                                                type="text"
                                                value={newCatName}
                                                onChange={(e) => setNewCatName(e.target.value)}
                                                placeholder="Category name"
                                                maxLength={20}
                                                className="w-full bg-background border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-slate-400"
                                                autoFocus
                                            />

                                            {/* Color picker */}
                                            <div>
                                                <div className="text-xs text-slate-500 mb-2">Color</div>
                                                <div className="flex gap-2 flex-wrap">
                                                    {CATEGORY_COLORS.map(color => (
                                                        <button
                                                            key={color}
                                                            onClick={() => setNewCatColor(color)}
                                                            className={`w-7 h-7 rounded-full transition-all ${newCatColor === color ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'hover:scale-110'}`}
                                                            style={{ backgroundColor: color }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>

                                            <button
                                                onClick={handleAddCategory}
                                                disabled={!newCatName.trim()}
                                                className="w-full py-2.5 bg-primary text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-blue-600 transition-colors"
                                            >
                                                Add Category
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Account Selection */}
                            <div className="space-y-4">
                                {type === 'transfer' ? (
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1">
                                            <div className="text-sm font-medium text-slate-500 mb-2">From Account</div>
                                            <select
                                                className="w-full bg-card border border-border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary appearance-none text-foreground"
                                                value={selectedAcc || ''}
                                                onChange={(e) => setSelectedAcc(Number(e.target.value))}
                                            >
                                                {accounts.map(acc => (
                                                    <option key={acc.id} value={acc.id}>{acc.name} ({currency}{acc.balance.toFixed(2)})</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="mt-7 text-slate-400">
                                            <ArrowRightLeft size={20} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm font-medium text-slate-500 mb-2">To Account</div>
                                            <select
                                                className="w-full bg-card border border-border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary appearance-none text-foreground"
                                                value={transferAcc || ''}
                                                onChange={(e) => setTransferAcc(Number(e.target.value))}
                                            >
                                                {accounts.map(acc => (
                                                    <option key={acc.id} value={acc.id}>{acc.name} ({currency}{acc.balance.toFixed(2)})</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="text-sm font-medium text-slate-500 mb-3">Account</div>
                                        <select
                                            className="w-full bg-card border border-border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary appearance-none text-foreground"
                                            value={selectedAcc || ''}
                                            onChange={(e) => setSelectedAcc(Number(e.target.value))}
                                        >
                                            {accounts.map(acc => (
                                                <option key={acc.id} value={acc.id}>{acc.name} (Bal: {currency}{acc.balance.toFixed(2)})</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {type === 'transfer' && !isTransferValid && (
                                    <div className="text-xs text-destructive mt-1">
                                        Cannot transfer to the same account.
                                    </div>
                                )}
                            </div>

                            {/* Note */}
                            <div>
                                <div className="text-sm font-medium text-slate-500 mb-3">Note (Optional)</div>
                                <input
                                    type="text"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="What was this for?"
                                    className="w-full bg-card border border-border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-slate-400"
                                />
                            </div>

                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
