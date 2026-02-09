import { useState, useEffect } from 'react';
import { auth } from '../lib/api';
import { Key, Plus, Trash2, Copy, Check } from 'lucide-react';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState('');

  const load = () => {
    auth.listKeys().then(setKeys).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (isLive: boolean) => {
    setCreating(true);
    try {
      const name = isLive ? 'Dashboard Live Key' : 'Dashboard Test Key';
      const result = await auth.createKey(name, isLive);
      setNewKey(result);
      load();
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('¿Revocar esta API key? Esta acción no se puede deshacer.')) return;
    await auth.revokeKey(id);
    load();
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-sm text-gray-500">Gestiona las claves de acceso a tu API</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleCreate(false)} disabled={creating}
            className="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50">
            <Plus className="w-4 h-4" /> Test Key
          </button>
          <button onClick={() => handleCreate(true)} disabled={creating}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50">
            <Plus className="w-4 h-4" /> Live Key
          </button>
        </div>
      </div>

      {/* New Key Alert */}
      {newKey && (
        <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-sm font-medium text-green-800 mb-2">✅ Nueva API key creada</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white p-2 rounded border font-mono break-all">{newKey.key}</code>
            <button onClick={() => copyToClipboard(newKey.key, 'new')}
              className="p-2 bg-white rounded border hover:bg-gray-50">
              {copied === 'new' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
            </button>
          </div>
          <p className="text-xs text-amber-600 mt-2">⚠️ Copia esta clave ahora. No se mostrará de nuevo.</p>
        </div>
      )}

      {/* Keys List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nombre</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Prefijo</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Último uso</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Cargando...</td></tr>
            ) : keys.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">No hay API keys</td></tr>
            ) : (
              keys.map((k: any) => (
                <tr key={k.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-sm text-gray-500">{k.keyPrefix}...</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${k.isLive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {k.isLive ? 'LIVE' : 'TEST'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs ${k.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {k.isActive ? 'Activa' : 'Revocada'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('es-DO') : 'Nunca'}
                  </td>
                  <td className="px-4 py-3">
                    {k.isActive && (
                      <button onClick={() => handleRevoke(k.id)} className="text-red-400 hover:text-red-600" title="Revocar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
