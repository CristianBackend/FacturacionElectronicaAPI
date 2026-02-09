import { useState, useEffect } from 'react';
import { webhooks } from '../lib/api';
import { Webhook, Plus, Trash2, X } from 'lucide-react';

const ALL_EVENTS = [
  'INVOICE_ACCEPTED', 'INVOICE_REJECTED', 'INVOICE_CONDITIONAL',
  'INVOICE_VOIDED', 'DOCUMENT_RECEIVED', 'COMMERCIAL_APPROVAL_RECEIVED',
  'CERTIFICATE_EXPIRING', 'SEQUENCE_LOW',
];

export default function WebhooksPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [newSecret, setNewSecret] = useState('');

  const load = () => {
    webhooks.list().then(setList).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!url || events.length === 0) return;
    const result = await webhooks.create(url, events);
    setNewSecret(result.secret);
    setShowForm(false);
    setUrl('');
    setEvents([]);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este webhook?')) return;
    await webhooks.delete(id);
    load();
  };

  const toggleEvent = (event: string) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="text-sm text-gray-500">Recibe notificaciones en tiempo real</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-700">
          <Plus className="w-4 h-4" /> Nuevo webhook
        </button>
      </div>

      {/* Secret Alert */}
      {newSecret && (
        <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-sm font-medium text-green-800 mb-2">✅ Webhook creado</p>
          <p className="text-xs text-gray-600 mb-1">Secret para verificar firmas HMAC:</p>
          <code className="block text-xs bg-white p-2 rounded border font-mono break-all">{newSecret}</code>
          <p className="text-xs text-amber-600 mt-2">⚠️ Guarda este secret. No se mostrará de nuevo.</p>
          <button onClick={() => setNewSecret('')} className="mt-2 text-xs text-gray-400 hover:text-gray-600">Cerrar</button>
        </div>
      )}

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">Nuevo webhook</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://mi-app.com/webhooks" className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Eventos</label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_EVENTS.map((event) => (
                    <label key={event} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={events.includes(event)} onChange={() => toggleEvent(event)}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                      <span className="text-gray-600">{event.replace(/_/g, ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={handleCreate} disabled={!url || events.length === 0}
              className="w-full mt-4 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
              Crear webhook
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-gray-400 py-8">Cargando...</div>
        ) : list.length === 0 ? (
          <div className="text-gray-400 py-8 text-center">No hay webhooks configurados</div>
        ) : (
          list.map((wh: any) => (
            <div key={wh.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Webhook className="w-5 h-5 text-brand-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 font-mono">{wh.url}</p>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {wh.events.map((e: string) => (
                        <span key={e} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{e}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${wh.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {wh.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                  <button onClick={() => handleDelete(wh.id)} className="text-red-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">{wh._count?.deliveries || 0} entregas</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
