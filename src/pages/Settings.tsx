import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { uploadBackup, downloadAndRestore, getBackupInfo } from '../driveSync';
import {
    Plus, Trash2, Edit3, X,
    Sun, Moon, Monitor, Cloud, Wallet,
    CreditCard, Building2, TrendingUp, RefreshCw, LogIn, LogOut, CloudUpload, CloudDownload,
    DollarSign, Target,
} from 'lucide-react';
import { useUIStore } from '../store';

const ACCOUNT_TYPES = [
    { value: 'cash', label: 'Cash', icon: Wallet },
    { value: 'bank', label: 'Bank', icon: Building2 },
    { value: 'credit', label: 'Credit Card', icon: CreditCard },
    { value: 'investment', label: 'Investment', icon: TrendingUp },
] as const;

type AccountType = typeof ACCOUNT_TYPES[number]['value'];

export default function Settings() {
    const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
    const { currency, setCurrency, monthlyBudget, setMonthlyBudget } = useUIStore();

    const [budgetInput, setBudgetInput] = useState(monthlyBudget ? monthlyBudget.toString() : '');

    // Account form state
    const [showAddAccount, setShowAddAccount] = useState(false);
    const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
    const [accName, setAccName] = useState('');
    const [accType, setAccType] = useState<AccountType>('bank');
    const [accBalance, setAccBalance] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

    // Theme
    const [themeMode, setThemeMode] = useState<'system' | 'light' | 'dark'>(() => {
        const stored = localStorage.getItem('theme');
        if (stored === 'dark') return 'dark';
        if (stored === 'light') return 'light';
        return 'system';
    });

    // Google Drive state
    const [accessToken, setAccessToken] = useState<string | null>(() => {
        return localStorage.getItem('gdriveToken');
    });
    const [userEmail, setUserEmail] = useState<string | null>(() => {
        return localStorage.getItem('gdriveEmail');
    });
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'restoring' | 'success' | 'error'>('idle');
    const [lastBackup, setLastBackup] = useState<string | null>(null);
    const [syncMessage, setSyncMessage] = useState('');

    // Fetch backup info on mount / token change
    const fetchBackupInfo = useCallback(async () => {
        if (!accessToken) return;
        try {
            const info = await getBackupInfo(accessToken);
            if (info) {
                setLastBackup(info.lastModified);
            }
        } catch {
            // token may have expired
            handleLogout();
        }
    }, [accessToken]);

    useEffect(() => {
        fetchBackupInfo();
    }, [fetchBackupInfo]);

    // Google Login
    const login = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            const token = tokenResponse.access_token;
            setAccessToken(token);
            localStorage.setItem('gdriveToken', token);

            // Fetch user email
            try {
                const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                setUserEmail(data.email);
                localStorage.setItem('gdriveEmail', data.email);
            } catch { /* ignore */ }
        },
        onError: () => {
            setSyncStatus('error');
            setSyncMessage('Google login failed');
        },
        scope: 'https://www.googleapis.com/auth/drive.appdata',
    });

    const handleLogout = () => {
        googleLogout();
        setAccessToken(null);
        setUserEmail(null);
        setLastBackup(null);
        localStorage.removeItem('gdriveToken');
        localStorage.removeItem('gdriveEmail');
    };

    // Backup / Restore
    const handleSync = async () => {
        if (!accessToken) return;
        setSyncStatus('syncing');
        setSyncMessage('');
        try {
            await uploadBackup(accessToken);
            setSyncStatus('success');
            setSyncMessage('Backup uploaded successfully!');
            await fetchBackupInfo();
            setTimeout(() => setSyncStatus('idle'), 3000);
        } catch (err: any) {
            console.error('Sync failed', err);
            if (err.message?.includes('401') || err.message?.includes('403')) {
                handleLogout();
                setSyncMessage('Session expired. Please sign in again.');
            } else {
                setSyncMessage(err.message || 'Sync failed');
            }
            setSyncStatus('error');
            setTimeout(() => setSyncStatus('idle'), 4000);
        }
    };

    const handleRestore = async () => {
        if (!accessToken) return;
        const confirmed = confirm(
            'This will REPLACE all local data with the cloud backup.\n\nAre you sure?'
        );
        if (!confirmed) return;

        setSyncStatus('restoring');
        setSyncMessage('');
        try {
            const counts = await downloadAndRestore(accessToken);
            setSyncStatus('success');
            setSyncMessage(`Restored ${counts.categories} categories, ${counts.accounts} accounts, ${counts.transactions} transactions`);
            setTimeout(() => setSyncStatus('idle'), 4000);
        } catch (err: any) {
            console.error('Restore failed', err);
            if (err.message?.includes('401') || err.message?.includes('403')) {
                handleLogout();
                setSyncMessage('Session expired. Please sign in again.');
            } else {
                setSyncMessage(err.message || 'Restore failed');
            }
            setSyncStatus('error');
            setTimeout(() => setSyncStatus('idle'), 4000);
        }
    };

    // ---------- Account Management ----------
    const resetAccountForm = () => {
        setAccName('');
        setAccType('bank');
        setAccBalance('');
        setShowAddAccount(false);
        setEditingAccountId(null);
    };

    const handleSaveAccount = async () => {
        const trimmed = accName.trim();
        if (!trimmed) return;
        const balance = parseFloat(accBalance) || 0;

        try {
            if (editingAccountId !== null) {
                await db.accounts.update(editingAccountId, {
                    name: trimmed,
                    type: accType,
                    balance,
                });
            } else {
                await db.accounts.add({
                    name: trimmed,
                    type: accType,
                    balance,
                });
            }
            resetAccountForm();
        } catch (err) {
            console.error('Failed to save account', err);
            alert('Error saving account');
        }
    };

    const handleEditAccount = (acc: { id?: number; name: string; type: string; balance: number }) => {
        setEditingAccountId(acc.id!);
        setAccName(acc.name);
        setAccType(acc.type as AccountType);
        setAccBalance(acc.balance.toString());
        setShowAddAccount(true);
        setDeleteConfirmId(null);
    };

    const handleDeleteAccount = async (accId: number) => {
        try {
            const txCount = await db.transactions.where('accountId').equals(accId).count();
            if (txCount > 0) {
                alert(`Cannot delete: ${txCount} transaction(s) are linked to this account. Remove or reassign them first.`);
                setDeleteConfirmId(null);
                return;
            }
            await db.accounts.delete(accId);
            setDeleteConfirmId(null);
        } catch (err) {
            console.error('Failed to delete account', err);
        }
    };

    // ---------- Theme ----------
    const applyTheme = (mode: 'system' | 'light' | 'dark') => {
        setThemeMode(mode);
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
    };

    const getTypeIcon = (type: string) => {
        const found = ACCOUNT_TYPES.find(t => t.value === type);
        return found ? found.icon : Wallet;
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 md:p-8 space-y-6 pb-20 max-w-2xl mx-auto"
        >
            <h2 className="text-2xl font-bold text-foreground">Settings</h2>

            {/* ===== ACCOUNT MANAGEMENT ===== */}
            <section className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                    <h3 className="text-base font-semibold">Accounts</h3>
                    <button
                        onClick={() => { resetAccountForm(); setShowAddAccount(true); }}
                        className="text-primary text-sm font-medium flex items-center gap-1 hover:underline"
                    >
                        <Plus size={14} /> Add
                    </button>
                </div>

                {accounts.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">No accounts yet</div>
                ) : (
                    <div className="divide-y divide-border">
                        {accounts.map(acc => {
                            const Icon = getTypeIcon(acc.type);
                            return (
                                <div key={acc.id} className="flex items-center px-5 py-3.5 gap-3">
                                    <div className="p-2 rounded-full bg-primary/10 text-primary">
                                        <Icon size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-foreground">{acc.name}</div>
                                        <div className="text-xs text-slate-400 capitalize">{acc.type}</div>
                                    </div>
                                    <div className="text-sm font-bold text-foreground mr-2">
                                        ${acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                    <button
                                        onClick={() => handleEditAccount(acc)}
                                        className="p-1.5 rounded-lg hover:bg-card text-slate-400 hover:text-primary transition-colors"
                                    >
                                        <Edit3 size={14} />
                                    </button>
                                    {deleteConfirmId === acc.id ? (
                                        <button
                                            onClick={() => handleDeleteAccount(acc.id!)}
                                            className="p-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setDeleteConfirmId(acc.id!)}
                                            className="p-1.5 rounded-lg hover:bg-card text-slate-400 hover:text-destructive transition-colors"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Add/Edit Account Form */}
                <AnimatePresence>
                    {showAddAccount && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="border-t border-border p-4 space-y-3 bg-background/50">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-semibold">
                                        {editingAccountId !== null ? 'Edit Account' : 'New Account'}
                                    </span>
                                    <button onClick={resetAccountForm} className="text-slate-400 hover:text-foreground">
                                        <X size={16} />
                                    </button>
                                </div>

                                <input
                                    type="text"
                                    value={accName}
                                    onChange={e => setAccName(e.target.value)}
                                    placeholder="Account name"
                                    maxLength={30}
                                    className="w-full bg-card border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-slate-400"
                                    autoFocus
                                />

                                {/* Type selector */}
                                <div className="grid grid-cols-4 gap-2">
                                    {ACCOUNT_TYPES.map(t => {
                                        const TIcon = t.icon;
                                        return (
                                            <button
                                                key={t.value}
                                                onClick={() => setAccType(t.value)}
                                                className={`flex flex-col items-center p-2.5 rounded-xl text-xs transition-all ${accType === t.value
                                                    ? 'bg-primary/10 text-primary ring-2 ring-primary'
                                                    : 'bg-card border border-border text-slate-500 hover:border-slate-400'
                                                    }`}
                                            >
                                                <TIcon size={18} className="mb-1" />
                                                {t.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={accBalance}
                                    onChange={e => {
                                        const v = e.target.value;
                                        if (v === '' || v === '-' || /^-?\d*\.?\d{0,2}$/.test(v)) setAccBalance(v);
                                    }}
                                    placeholder="Initial balance (0.00)"
                                    className="w-full bg-card border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-slate-400"
                                />

                                <button
                                    onClick={handleSaveAccount}
                                    disabled={!accName.trim()}
                                    className="w-full py-2.5 bg-primary text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-blue-600 transition-colors"
                                >
                                    {editingAccountId !== null ? 'Save Changes' : 'Add Account'}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </section>

            {/* ===== BACKUP & SYNC (Google Drive) ===== */}
            <section className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 pt-5 pb-3 flex items-center gap-2">
                    <Cloud size={18} className="text-primary" />
                    <h3 className="text-base font-semibold">Backup & Sync</h3>
                </div>

                <div className="px-5 pb-5 space-y-4">
                    {!accessToken ? (
                        /* ── Not signed in ── */
                        <>
                            <p className="text-xs text-slate-400">
                                Sign in with Google to backup your data to Google Drive. Your data is stored privately in your own account.
                            </p>
                            <button
                                onClick={() => login()}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-white dark:bg-slate-800 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                Sign in with Google
                            </button>
                        </>
                    ) : (
                        /* ── Signed in ── */
                        <>
                            {/* User info */}
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                                    <LogIn size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-foreground truncate">{userEmail}</div>
                                    <div className="text-xs text-slate-400">Connected to Google Drive</div>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="p-2 rounded-lg text-slate-400 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    title="Sign out"
                                >
                                    <LogOut size={16} />
                                </button>
                            </div>

                            {/* Last backup info */}
                            {lastBackup && (
                                <div className="text-xs text-slate-400 bg-background/50 rounded-lg px-3 py-2 flex items-center gap-2">
                                    <RefreshCw size={12} />
                                    Last backup: {new Date(lastBackup).toLocaleString()}
                                </div>
                            )}

                            {/* Action buttons */}
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={handleSync}
                                    disabled={syncStatus === 'syncing' || syncStatus === 'restoring'}
                                    className="flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-blue-600 transition-colors"
                                >
                                    {syncStatus === 'syncing' ? (
                                        <RefreshCw size={16} className="animate-spin" />
                                    ) : (
                                        <CloudUpload size={16} />
                                    )}
                                    {syncStatus === 'syncing' ? 'Syncing...' : 'Backup Now'}
                                </button>
                                <button
                                    onClick={handleRestore}
                                    disabled={syncStatus === 'syncing' || syncStatus === 'restoring'}
                                    className="flex items-center justify-center gap-2 py-3 bg-card border border-border text-foreground rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-background transition-colors"
                                >
                                    {syncStatus === 'restoring' ? (
                                        <RefreshCw size={16} className="animate-spin" />
                                    ) : (
                                        <CloudDownload size={16} />
                                    )}
                                    {syncStatus === 'restoring' ? 'Restoring...' : 'Restore'}
                                </button>
                            </div>

                            {/* Status message */}
                            <AnimatePresence>
                                {syncMessage && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className={`text-xs px-3 py-2 rounded-lg text-center font-medium ${syncStatus === 'success' ? 'bg-success/10 text-success' :
                                            syncStatus === 'error' ? 'bg-destructive/10 text-destructive' :
                                                'bg-primary/10 text-primary'
                                            }`}
                                    >
                                        {syncMessage}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </>
                    )}
                </div>
            </section>

            {/* ===== APPEARANCE ===== */}
            <section className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 pt-5 pb-3">
                    <h3 className="text-base font-semibold">Appearance</h3>
                </div>
                <div className="px-5 pb-5">
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { mode: 'system' as const, label: 'System', icon: Monitor },
                            { mode: 'light' as const, label: 'Light', icon: Sun },
                            { mode: 'dark' as const, label: 'Dark', icon: Moon },
                        ].map(({ mode, label, icon: TIcon }) => (
                            <button
                                key={mode}
                                onClick={() => applyTheme(mode)}
                                className={`flex flex-col items-center p-3 rounded-xl text-xs transition-all ${themeMode === mode
                                    ? 'bg-primary/10 text-primary ring-2 ring-primary'
                                    : 'bg-background border border-border text-slate-500 hover:border-slate-400'
                                    }`}
                            >
                                <TIcon size={20} className="mb-1.5" />
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Currency Selection */}
                <div className="px-5 pt-3 pb-3 border-t border-border mt-2">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <DollarSign size={16} className="text-primary" />
                        Currency Symbol
                    </h3>
                    <div className="grid grid-cols-5 gap-2">
                        {[
                            { value: '$', label: '$' },
                            { value: 'RM', label: 'RM' },
                            { value: '¥', label: '¥' },
                            { value: '€', label: '€' },
                            { value: '£', label: '£' },
                        ].map(c => (
                            <button
                                key={c.value}
                                onClick={() => setCurrency(c.value)}
                                className={`py-2.5 rounded-xl text-sm font-bold transition-all ${currency === c.value
                                    ? 'bg-primary/10 text-primary ring-2 ring-primary'
                                    : 'bg-background border border-border text-slate-500 hover:border-slate-400'
                                    }`}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Monthly Budget Setting */}
                <div className="px-5 pt-3 pb-5 border-t border-border mt-2">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Target size={16} className="text-primary" />
                        Monthly Budget Limit
                    </h3>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                                {currency}
                            </div>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={budgetInput}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) setBudgetInput(val);
                                }}
                                placeholder="e.g. 2000"
                                className="w-full pl-8 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-slate-400"
                            />
                        </div>
                        <button
                            onClick={() => {
                                const parsed = parseFloat(budgetInput);
                                if (!isNaN(parsed) && parsed > 0) {
                                    setMonthlyBudget(parsed);
                                } else {
                                    setMonthlyBudget(null);
                                    setBudgetInput('');
                                }
                            }}
                            className="px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-colors"
                        >
                            Save Option
                        </button>
                    </div>
                    {monthlyBudget && (
                        <div className="text-xs text-primary mt-2">
                            Current Budget: {currency}{monthlyBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                    )}
                </div>
            </section>

            {/* App Info */}
            <div className="text-center py-4 text-xs text-slate-400">
                FinTrack v1.0.0 · Local-First · Your data, your control
            </div>
        </motion.div>
    );
}
