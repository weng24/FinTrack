import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Moon, Sun, Home, List, BarChart3, Settings, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Statistics from './pages/Statistics';
import SettingsPage from './pages/Settings';
import AddTransactionDrawer from './components/AddTransactionDrawer';
import { useUIStore } from './store';

function App() {
    const isDrawerOpen = useUIStore(state => state.isDrawerOpen);
    const openDrawer = useUIStore(state => state.openDrawer);
    const closeDrawer = useUIStore(state => state.closeDrawer);
    const toggleTheme = useUIStore(state => state.toggleTheme);
    const themeMode = useUIStore(state => state.themeMode);

    const isDark = themeMode === 'dark' || (themeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    return (
        <Router>
            <div className="min-h-screen bg-background text-foreground transition-colors duration-300 flex flex-col md:flex-row pb-16 md:pb-0">

                {/* Main Content Area */}
                <main className="flex-1 overflow-y-auto">
                    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border p-4 flex justify-between items-center">
                        <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
                            FinTrack
                        </h1>
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-full hover:bg-card transition-colors"
                        >
                            {isDark ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-slate-600" />}
                        </button>
                    </header>

                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/transactions" element={<Transactions />} />
                        <Route path="/statistics" element={<Statistics />} />
                        <Route path="/settings" element={<SettingsPage />} />
                    </Routes>
                </main>

                {/* Floating Action Button */}
                <div className="fixed bottom-24 right-6 md:bottom-8 md:right-8 z-50">
                    <motion.button
                        onClick={() => openDrawer()}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="bg-primary text-white p-4 rounded-full shadow-lg shadow-primary/30 flex items-center justify-center"
                    >
                        <Plus size={24} />
                    </motion.button>
                </div>

                {/* Bottom Navigation (Mobile) & Side Navigation (Desktop) */}
                <nav className="fixed bottom-0 w-full md:relative md:w-20 md:h-screen bg-card border-t md:border-t-0 md:border-r border-border z-40">
                    <ul className="flex flex-row md:flex-col justify-around md:justify-start items-center h-16 md:h-full md:pt-6 md:space-y-6">
                        <NavItem to="/" icon={<Home size={22} />} label="Home" />
                        <NavItem to="/transactions" icon={<List size={22} />} label="Ledger" />
                        <NavItem to="/statistics" icon={<BarChart3 size={22} />} label="Stats" />
                        <NavItem to="/settings" icon={<Settings size={22} />} label="Settings" />
                    </ul>
                </nav>

                {/* Overlay Drawer Components */}
                <AddTransactionDrawer isOpen={isDrawerOpen} onClose={closeDrawer} />
            </div>
        </Router>
    );
}

function NavItem({ to, icon, label }: { to: string, icon: React.ReactNode, label: string }) {
    const location = useLocation();
    const isActive = location.pathname === to;

    return (
        <li>
            <Link
                to={to}
                className={`flex flex-col items-center justify-center p-2 transition-colors ${isActive ? 'text-primary' : 'text-slate-400 hover:text-primary'
                    }`}
            >
                {icon}
                <span className={`text-[10px] mt-1 ${isActive ? 'font-semibold' : ''}`}>{label}</span>
            </Link>
        </li>
    );
}

export default App;
