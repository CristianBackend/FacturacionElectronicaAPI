import { useState, useEffect, useCallback } from 'react';
import { buyers, rnc } from '../lib/api';
import { Users, Plus, X, Search, CheckCircle, AlertTriangle, Loader2, RefreshCw, ChevronRight } from 'lucide-react';

const ECF_LABELS: Record<string, string> = {
  E31: 'Crédito Fiscal', E32: 'Consumo', E33: 'Nota Débito', E34: 'Nota Crédito',
  E41: 'Compras', E43: 'Gastos Menores', E44: 'Reg. Especial', E45: 'Gubernamental',
  E46: 'Exportaciones', E47: 'Pagos Exterior',
};

export default function BuyersPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [search, setSearch] = useState('');

  // Create form
  const [rncInput, setRncInput] = useState('');
  const [dgiiData, setDgiiData] = useState<any>(null);
  const [dgiiLoading, setDgiiLoading] = useState(false);
  const [dgiiError, setDgiiError] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      const res = await buyers.list(params);
      setList(res.data || res);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const lookupRnc = useCallback(async (v: string) => {
    if (v.length !== 9 && v.length !== 11) { setDgiiData(null); setDgiiError(''); return; }
    setDgiiLoading(true); setDgiiError(''); setDgiiData(null);
    try {
      const result = await rnc.lookup(v);
      setDgiiData(result);
    } catch (e: any) {
      setDgiiError(e.message);
    } finally {
      setDgiiLoading(false);
    }
  }, []);

  const handleCreate = async () => {
    if (!rncInput || (rncInput.length !== 9 && rncInput.length !== 11)) {
      setError('Ingrese un RNC válido (9 o 11 dígitos)'); return;
    }
    if (!dgiiData) {
      setError('Espere a que se consulte la DGII'); return;
    }
    setSaving(true); setError('');
    try {
      await buyers.create({
        rnc: rncInput,
        email: email || undefined,
        phone: phone || undefined,
        contactPerson: contactPerson || undefined,
        notes: notes || undefined,
      });
      closeModal();
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setRncInput(''); setDgiiData(null); setDgiiError('');
    setEmail(''); setPhone(''); setContactPerson(''); setNotes('');
    setError('');
  };

  const handleRefreshDgii = async (buyerId: string) => {
    try {
      await buyers.refreshDgii(buyerId);
      load();
      if (showDetail?.id === buyerId) {
        const updated = await buyers.get(buyerId);
        setShowDetail(updated);
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">Contribuyentes registrados en DGII para facturación E31 (Crédito Fiscal)</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> Nuevo Cliente
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
        <input placeholder="Buscar por nombre o RNC..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No hay clientes registrados</p>
          <p className="text-xs text-gray-400 mt-1">Registra aquí los contribuyentes a los que les emites E31 (Crédito Fiscal).<br/>Para consumidores finales (E32) no necesitas registrar cliente.</p>
          <button onClick={() => setShowModal(true)} className="mt-3 text-brand-600 text-sm font-medium hover:underline">Agregar primer cliente</button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">RNC</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Estado DGII</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">e-CF</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Facturas</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.map((b: any) => (
                <tr key={b.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { buyers.get(b.id).then(setShowDetail).catch(() => setShowDetail(b)); }}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{b.name}</p>
                    {b.commercialName && <p className="text-xs text-gray-500">{b.commercialName}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{b.rnc}</td>
                  <td className="px-4 py-3">
                    {b.dgii ? (
                      <span className={`text-xs font-medium ${b.dgii.status === 'ACTIVO' ? 'text-green-600' : 'text-red-500'}`}>{b.dgii.status}</span>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">E31</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{b.invoiceCount || 0}</td>
                  <td className="px-4 py-3"><ChevronRight className="w-4 h-4 text-gray-400" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ CREATE MODAL ═══ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-gray-900">Nuevo Cliente</h2>
              <button onClick={closeModal}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
            </div>

            <div className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

              {/* RNC */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">RNC o Cédula</label>
                <div className="relative">
                  <input autoFocus placeholder="Ej: 131996035"
                    value={rncInput}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '');
                      if (v.length <= 11) {
                        setRncInput(v);
                        setDgiiData(null); setDgiiError('');
                        if (v.length === 9 || v.length === 11) lookupRnc(v);
                      }
                    }}
                    maxLength={11}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base font-mono focus:ring-2 focus:ring-brand-500 outline-none" />
                  {dgiiLoading && <Loader2 className="w-5 h-5 text-brand-500 animate-spin absolute right-3 top-3.5" />}
                </div>
              </div>

              {/* DGII result */}
              {dgiiData && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-3">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">Encontrado en DGII</span>
                  </div>
                  <p className="text-base font-semibold text-gray-900">{dgiiData.name}</p>
                  {dgiiData.commercialName && <p className="text-sm text-gray-500">{dgiiData.commercialName}</p>}
                  <div className="flex items-center gap-2">
                    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">E31 – Crédito Fiscal</span>
                  </div>
                  <div className="flex gap-3 flex-wrap text-xs">
                    <span className={`font-medium ${dgiiData.status === 'ACTIVO' ? 'text-green-600' : 'text-amber-600'}`}>{dgiiData.status}</span>
                    {dgiiData.paymentRegime && <span className="text-gray-500">{dgiiData.paymentRegime}</span>}
                    {dgiiData.isElectronicInvoicer && <span className="text-blue-600 font-medium">e-CF ✓</span>}
                  </div>
                  {dgiiData.economicActivity && (
                    <p className="text-[11px] text-gray-400 leading-tight">{dgiiData.economicActivity.substring(0, 150)}</p>
                  )}

                  <details className="pt-2 border-t border-green-200">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">Agregar datos de contacto (opcional)</summary>
                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono"
                          className="px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-brand-500 outline-none" />
                        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
                          className="px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-brand-500 outline-none" />
                      </div>
                      <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Persona de contacto"
                        className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-brand-500 outline-none" />
                      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas internas"
                        className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-brand-500 outline-none" />
                    </div>
                  </details>
                </div>
              )}

              {dgiiError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-sm text-red-600">{dgiiError}</span>
                </div>
              )}

              {!dgiiData && !dgiiError && !dgiiLoading && rncInput.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Escriba el RNC o Cédula del contribuyente</p>
              )}
            </div>

            <div className="flex justify-end gap-3 p-5 border-t">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
              <button onClick={handleCreate} disabled={saving || !dgiiData}
                className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Crear Cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ DETAIL PANEL ═══ */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-gray-900">{showDetail.name}</h2>
              <button onClick={() => setShowDetail(null)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">E31 – Crédito Fiscal</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">RNC</span><span className="font-mono">{showDetail.rnc}</span></div>
                {showDetail.commercialName && <div className="flex justify-between"><span className="text-gray-500">Nombre Comercial</span><span>{showDetail.commercialName}</span></div>}
                {showDetail.contactPerson && <div className="flex justify-between"><span className="text-gray-500">Contacto</span><span>{showDetail.contactPerson}</span></div>}
                {showDetail.email && <div className="flex justify-between"><span className="text-gray-500">Email</span><span>{showDetail.email}</span></div>}
                {showDetail.phone && <div className="flex justify-between"><span className="text-gray-500">Teléfono</span><span>{showDetail.phone}</span></div>}
                {showDetail.notes && <div className="flex justify-between"><span className="text-gray-500">Notas</span><span className="text-right max-w-[200px] text-gray-600">{showDetail.notes}</span></div>}
                <div className="flex justify-between"><span className="text-gray-500">Facturas</span><span>{showDetail.invoiceCount || 0}</span></div>
              </div>
              {showDetail.dgii && (
                <div className="p-3 bg-gray-50 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">DGII</span>
                    <button onClick={() => handleRefreshDgii(showDetail.id)} className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
                      <RefreshCw className="w-3 h-3" /> Actualizar
                    </button>
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-gray-500">Estado</span><span className={`font-medium ${showDetail.dgii.status === 'ACTIVO' ? 'text-green-600' : 'text-red-500'}`}>{showDetail.dgii.status}</span></div>
                    {showDetail.dgii.paymentRegime && <div className="flex justify-between"><span className="text-gray-500">Régimen</span><span>{showDetail.dgii.paymentRegime}</span></div>}
                    {showDetail.dgii.isElectronicInvoicer && <div className="flex justify-between"><span className="text-gray-500">Facturador e-CF</span><span className="text-blue-600">Sí ✓</span></div>}
                    {showDetail.dgii.economicActivity && <p className="text-[10px] text-gray-400 mt-1 leading-tight">{showDetail.dgii.economicActivity.substring(0, 150)}</p>}
                    {showDetail.dgii.lastVerified && <p className="text-[10px] text-gray-400">Verificado: {new Date(showDetail.dgii.lastVerified).toLocaleDateString()}</p>}
                  </div>
                </div>
              )}
              {showDetail.recentInvoices?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Facturas Recientes</p>
                  <div className="space-y-1">
                    {showDetail.recentInvoices.map((inv: any) => (
                      <div key={inv.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                        <span className="font-mono text-gray-700">{inv.encf || '—'}</span>
                        <div className="text-right">
                          <span className="font-medium">RD$ {Number(inv.totalAmount).toLocaleString()}</span>
                          <span className={`ml-2 ${inv.status === 'ACCEPTED' ? 'text-green-600' : inv.status === 'REJECTED' ? 'text-red-500' : 'text-amber-500'}`}>{inv.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-5 border-t">
              <button onClick={() => setShowDetail(null)} className="w-full px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
