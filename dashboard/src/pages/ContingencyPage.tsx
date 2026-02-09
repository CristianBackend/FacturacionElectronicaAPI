import { useState, useEffect } from 'react';
import { contingency } from '../lib/api';
import { AlertTriangle, RefreshCw, Clock } from 'lucide-react';

export default function ContingencyPage() {
  const [stats, setStats] = useState<any>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([
      contingency.stats().catch(() => null),
      contingency.list().catch(() => []),
    ]).then(([s, p]) => {
      setStats(s);
      setPending(p);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const handleRetryOne = async (invoiceId: string) => {
    await contingency.retryOne(invoiceId);
    load();
  };

  const handleRetryAll = async () => {
    await contingency.retryAll();
    load();
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contingencia</h1>
          <p className="text-sm text-gray-500">Facturas pendientes de envío a DGII</p>
        </div>
        {pending.length > 0 && (
          <button onClick={handleRetryAll}
            className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-amber-600">
            <RefreshCw className="w-4 h-4" /> Reintentar todas
          </button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-2xl font-bold text-amber-600">{stats.contingencyCount}</p>
            <p className="text-sm text-gray-500">En contingencia</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-2xl font-bold text-red-600">{stats.errorCount}</p>
            <p className="text-sm text-gray-500">Con error</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-2xl font-bold text-gray-900">{stats.totalToday}</p>
            <p className="text-sm text-gray-500">Facturas hoy</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className={`text-2xl font-bold ${stats.oldestContingencyHours > 60 ? 'text-red-600' : 'text-gray-900'}`}>
              {stats.oldestContingencyHours}h
            </p>
            <p className="text-sm text-gray-500">Más antigua</p>
          </div>
        </div>
      )}

      {/* Pending List */}
      {pending.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No hay facturas en contingencia</p>
          <p className="text-sm text-gray-400 mt-1">Todo está al día con la DGII</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">eNCF</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Monto</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tiempo</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Restante</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((inv: any) => (
                <tr key={inv.id} className={`border-b ${inv.urgent ? 'bg-red-50' : inv.expired ? 'bg-red-100' : ''}`}>
                  <td className="px-4 py-3 font-mono text-sm">{inv.encf}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{inv.ecfType}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">
                    RD${Number(inv.totalAmount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="flex items-center justify-center gap-1 text-sm text-gray-500">
                      <Clock className="w-3 h-3" /> {inv.hoursInContingency}h
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      inv.expired ? 'bg-red-200 text-red-800' :
                      inv.urgent ? 'bg-amber-200 text-amber-800' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {inv.expired ? 'EXPIRADA' : `${inv.hoursRemaining}h`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleRetryOne(inv.id)}
                      className="text-amber-500 hover:text-amber-700" title="Reintentar">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
