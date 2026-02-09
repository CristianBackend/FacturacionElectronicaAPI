import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { auth, health, contingency } from '../lib/api';
import {
  FileText,
  Building2,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Server,
} from 'lucide-react';

export default function DashboardPage() {
  const [tenant, setTenant] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [healthData, setHealthData] = useState<any>(null);
  const [contStats, setContStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      auth.getMe().catch(() => null),
      auth.getStats().catch(() => null),
      health.check().catch(() => null),
      contingency.stats().catch(() => null),
    ]).then(([t, s, h, c]) => {
      setTenant(t);
      setStats(s);
      setHealthData(h);
      setContStats(c);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Cargando...</div>;
  }

  const cards = [
    {
      label: 'Facturas este mes',
      value: stats?.invoicesThisMonth ?? 0,
      icon: FileText,
      color: 'blue',
      link: '/invoices',
    },
    {
      label: 'Total facturas',
      value: stats?.totalInvoices ?? 0,
      icon: TrendingUp,
      color: 'green',
      link: '/invoices',
    },
    {
      label: 'Empresas',
      value: stats?.totalCompanies ?? 0,
      icon: Building2,
      color: 'purple',
      link: '/companies',
    },
    {
      label: 'En contingencia',
      value: contStats?.contingencyCount ?? 0,
      icon: AlertTriangle,
      color: contStats?.contingencyCount > 0 ? 'red' : 'gray',
      link: '/contingency',
    },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
    gray: 'bg-gray-50 text-gray-400',
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Bienvenido{tenant?.name ? `, ${tenant.name}` : ''}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Plan: <span className="font-medium text-brand-600">{tenant?.plan || 'STARTER'}</span>
          {' · '}
          Ambiente DGII: <span className="font-medium">DEV</span>
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {cards.map((card) => (
          <Link
            key={card.label}
            to={card.link}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`p-2 rounded-lg ${colorMap[card.color]}`}>
                <card.icon className="w-5 h-5" />
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value.toLocaleString()}</p>
            <p className="text-sm text-gray-500 mt-1">{card.label}</p>
          </Link>
        ))}
      </div>

      {/* Status & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* System Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Server className="w-4 h-4" /> Estado del Sistema
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">API</span>
              <span className="flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-green-600 font-medium">Operativo</span>
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Base de datos</span>
              <span className="flex items-center gap-1.5 text-sm">
                <CheckCircle2 className={`w-4 h-4 ${healthData?.services?.database === 'ok' ? 'text-green-500' : 'text-red-500'}`} />
                <span className={`font-medium ${healthData?.services?.database === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                  {healthData?.services?.database === 'ok' ? 'Operativo' : 'Error'}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Ambiente DGII</span>
              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
                {healthData?.services?.dgiiEnvironment || 'DEV'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Versión</span>
              <span className="text-sm text-gray-900 font-mono">{healthData?.version || '0.1.0'}</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Acciones rápidas</h2>
          <div className="space-y-2">
            <Link
              to="/companies"
              className="block w-full text-left px-4 py-3 rounded-lg bg-blue-50 text-blue-700 text-sm hover:bg-blue-100 transition-colors"
            >
              🏢 Registrar nueva empresa emisora
            </Link>
            <Link
              to="/invoices"
              className="block w-full text-left px-4 py-3 rounded-lg bg-green-50 text-green-700 text-sm hover:bg-green-100 transition-colors"
            >
              📄 Ver facturas emitidas
            </Link>
            <Link
              to="/api-keys"
              className="block w-full text-left px-4 py-3 rounded-lg bg-purple-50 text-purple-700 text-sm hover:bg-purple-100 transition-colors"
            >
              🔑 Gestionar API Keys
            </Link>
            <a
              href="/docs"
              target="_blank"
              className="block w-full text-left px-4 py-3 rounded-lg bg-gray-50 text-gray-700 text-sm hover:bg-gray-100 transition-colors"
            >
              📚 Documentación Swagger
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
