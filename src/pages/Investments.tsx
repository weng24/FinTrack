import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Plus, Trash2, RefreshCw, X, AlertCircle } from 'lucide-react';
import { useUIStore } from '../store';

export default function Investments() {
    const { currency } = useUIStore();
    const investments = useLiveQuery(() => db.investments.toArray()) || [];
    
    const [prices, setPrices] = useState<Record<string, number>>({});
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [errorMsg, setErrorMsg] = useState<string>('');

    // Modal state
    const [showAdd, setShowAdd] = useState(false);
    const [symbol, setSymbol] = useState('');
    const [name, setName] = useState('');
    const [quantity, setQuantity] = useState('');
    const [averagePrice, setAveragePrice] = useState('');

    const fetchPrices = useCallback(async () => {
        if (investments.length === 0) return;
        setIsRefreshing(true);
        setErrorMsg('');
        
        const newPrices: Record<string, number> = { ...prices };
        let hasError = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isNative = !!(window as any).Capacitor?.isNativePlatform;

        for (const inv of investments) {
            try {
                // In Capacitor (APK), the native webview has no CORS restrictions,
                // so we can fetch Yahoo Finance directly. In dev mode, use Vite proxy.
                const chartPath = `/v8/finance/chart/${encodeURIComponent(inv.symbol)}?interval=1d`;
                const url = isNative
                    ? `https://query1.finance.yahoo.com${chartPath}`
                    : `/api/yahoo${chartPath}`;
                
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                
                const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
                if (price) {
                    newPrices[inv.symbol] = price;
                }
            } catch (err) {
                console.error(`Failed to fetch price for ${inv.symbol}`, err);
                hasError = true;
            }
        }

        setPrices(newPrices);
        setLastUpdated(new Date());
        if (hasError) {
            setErrorMsg('Some prices could not be updated. Check your symbols or try again later.');
        }
        setIsRefreshing(false);
    }, [investments]); // Note: excluding 'prices' to avoid infinite loops if prices change

    // Initial fetch
    useEffect(() => {
        // Only fetch if we haven't fetched recently or if investments changed significantly
        if (investments.length > 0 && Object.keys(prices).length === 0) {
            fetchPrices();
        }
    }, [investments.length, fetchPrices]); // only trigger on length change

    const handleSave = async () => {
        if (!symbol.trim() || !quantity || !averagePrice) return;
        
        await db.investments.add({
            symbol: symbol.toUpperCase().trim(),
            name: name.trim() || symbol.toUpperCase().trim(),
            quantity: parseFloat(quantity),
            averagePrice: parseFloat(averagePrice),
            currency: 'USD' // Defaulting to USD for simplicity, could be dynamic
        });
        
        setSymbol('');
        setName('');
        setQuantity('');
        setAveragePrice('');
        setShowAdd(false);
        // Trigger a fetch for the new symbol
        fetchPrices();
    };

    const handleDelete = async (id: number) => {
        if (confirm('Remove this investment?')) {
            await db.investments.delete(id);
        }
    };

    // Calculations
    let totalCost = 0;
    let totalCurrentValue = 0;

    const enrichedInvestments = investments.map(inv => {
        const currentPrice = prices[inv.symbol] || inv.averagePrice; // Fallback to avg price if not fetched
        const costBasis = inv.quantity * inv.averagePrice;
        const currentValue = inv.quantity * currentPrice;
        const profitLoss = currentValue - costBasis;
        const profitLossPercent = costBasis > 0 ? (profitLoss / costBasis) * 100 : 0;
        
        totalCost += costBasis;
        totalCurrentValue += currentValue;

        return {
            ...inv,
            currentPrice,
            currentValue,
            profitLoss,
            profitLossPercent
        };
    });

    const totalProfitLoss = totalCurrentValue - totalCost;
    const totalProfitLossPercent = totalCost > 0 ? (totalProfitLoss / totalCost) * 100 : 0;
    const isTotalPositive = totalProfitLoss >= 0;

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 md:p-8 space-y-6 pb-24"
        >
            {/* Header & Total Portfolio Value */}
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h2 className="text-sm font-medium text-slate-500 mb-1">Total Portfolio Value</h2>
                        <div className="text-3xl font-bold text-foreground">
                            {currency}{totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                    <button 
                        onClick={fetchPrices}
                        disabled={isRefreshing || investments.length === 0}
                        className={`p-2 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors ${isRefreshing ? 'animate-spin' : ''}`}
                    >
                        <RefreshCw size={20} />
                    </button>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                        <span className={`text-sm font-semibold flex items-center ${isTotalPositive ? 'text-success' : 'text-destructive'}`}>
                            {isTotalPositive ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
                            {currency}{Math.abs(totalProfitLoss).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-xs text-slate-500">
                            ({isTotalPositive ? '+' : ''}{totalProfitLossPercent.toFixed(2)}%)
                        </span>
                    </div>
                    {lastUpdated && (
                        <div className="text-xs text-slate-400">
                            Updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    )}
                </div>
            </div>

            {errorMsg && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <p>{errorMsg}</p>
                </div>
            )}

            {/* Action Bar */}
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-foreground">Holdings</h3>
                <button 
                    onClick={() => setShowAdd(true)}
                    className="flex items-center gap-1 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
                >
                    <Plus size={16} /> Add Asset
                </button>
            </div>

            {/* Asset List */}
            <div className="space-y-3">
                {enrichedInvestments.length === 0 ? (
                    <div className="text-center py-10 bg-card rounded-xl border border-border border-dashed text-slate-400">
                        <TrendingUp size={48} className="mx-auto mb-3 opacity-20" />
                        <p>No investments added yet.</p>
                        <p className="text-sm mt-1">Track your stocks, ETFs, or crypto.</p>
                    </div>
                ) : (
                    enrichedInvestments.map(inv => (
                        <div key={inv.id} className="bg-card p-4 rounded-xl shadow-sm border border-border flex justify-between items-center">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-foreground">{inv.symbol}</h4>
                                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 truncate max-w-[100px]">
                                        {inv.name}
                                    </span>
                                </div>
                                <div className="text-sm text-slate-500 mt-1">
                                    {inv.quantity} shares @ {currency}{inv.averagePrice.toFixed(2)}
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <div className="font-semibold text-foreground">
                                        {currency}{inv.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                    <div className={`text-xs font-medium ${inv.profitLoss >= 0 ? 'text-success' : 'text-destructive'}`}>
                                        {inv.profitLoss >= 0 ? '+' : ''}{inv.profitLossPercent.toFixed(2)}%
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleDelete(inv.id!)}
                                    className="p-2 text-slate-400 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add Asset Modal */}
            <AnimatePresence>
                {showAdd && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-card w-full max-w-md rounded-2xl shadow-xl border border-border overflow-hidden"
                        >
                            <div className="p-4 border-b border-border flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                                <h3 className="font-semibold text-foreground">Add Investment</h3>
                                <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-foreground">
                                    <X size={20} />
                                </button>
                            </div>
                            
                            <div className="p-5 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-500 mb-1">Symbol (Ticker)</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. AAPL, TSLA, BTC-USD"
                                        value={symbol}
                                        onChange={e => setSymbol(e.target.value.toUpperCase())}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                    <p className="text-xs text-slate-400 mt-1">Use standard Yahoo Finance tickers.</p>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-slate-500 mb-1">Name (Optional)</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Apple Inc."
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-500 mb-1">Quantity</label>
                                        <input 
                                            type="number" 
                                            placeholder="0.00"
                                            step="any"
                                            value={quantity}
                                            onChange={e => setQuantity(e.target.value)}
                                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-500 mb-1">Avg Price ({currency})</label>
                                        <input 
                                            type="number" 
                                            placeholder="0.00"
                                            step="any"
                                            value={averagePrice}
                                            onChange={e => setAveragePrice(e.target.value)}
                                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                        />
                                    </div>
                                </div>

                                <button 
                                    onClick={handleSave}
                                    disabled={!symbol.trim() || !quantity || !averagePrice}
                                    className="w-full bg-primary text-primary-foreground font-semibold py-2.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                                >
                                    Save Investment
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
