import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { clearAuth } from '../lib/api';
import {
  LayoutDashboard,
  FileText,
  Building2,
  Users,
  Key,
  Webhook,
  AlertTriangle,
  LogOut,
  Zap,
  Hash,
  Shield,
} from 'lucide-react';

interface Props {
  children: ReactNode;
  onLogout: () => void;
}

const nav = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/invoices', label: 'Facturas', icon: FileText },
  { path: '/companies', label: 'Empresas', icon: Building2 },
  { path: '/buyers', label: 'Clientes', icon: Users },
  { path: '/sequences', label: 'Secuencias', icon: Hash },
  { path: '/certificates', label: 'Certificados', icon: Shield },
  { path: '/api-keys', label: 'API Keys', icon: Key },
  { path: '/webhooks', label: 'Webhooks', icon: Webhook },
  { path: '/contingency', label: 'Contingencia', icon: AlertTriangle },
];

export default function Layout({ children, onLogout }: Props) {
  const location = useLocation();

  const handleLogout = () => {
    clearAuth();
    onLogout();
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-brand-900 text-white flex flex-col">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-400" />
            <span className="text-lg font-bold">ECF API</span>
          </div>
          <p className="text-xs text-white/50 mt-1">Facturación Electrónica RD</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 w-full transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
