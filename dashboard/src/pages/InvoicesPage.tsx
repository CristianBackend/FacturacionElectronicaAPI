import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { invoices, buyers, companies, rnc } from '../lib/api';
import {
  FileText, Plus, X, Eye, Loader2, ChevronLeft, ChevronRight,
  Users, ShoppingBag, Trash2, CheckCircle, Search, UserPlus, Building2,
  Globe, Landmark, FileEdit, ArrowDownLeft, ArrowUpRight, Receipt, Briefcase,
} from 'lucide-react';

// ═══ TYPE CONFIG ═══
const ECF_TYPES = {
  E31: { label: 'Crédito Fiscal', short: 'Crédito Fiscal', color: 'bg-blue-100 text-blue-700', icon: Users, desc: 'Contribuyente activo con RNC' },
  E32: { label: 'Consumo', short: 'Consumo', color: 'bg-green-100 text-green-700', icon: ShoppingBag, desc: 'Consumidor final' },
  E33: { label: 'Nota de Débito', short: 'Nota Débito', color: 'bg-orange-100 text-orange-700', icon: ArrowUpRight, desc: 'Aumenta monto de factura original' },
  E34: { label: 'Nota de Crédito', short: 'Nota Crédito', color: 'bg-purple-100 text-purple-700', icon: ArrowDownLeft, desc: 'Reduce monto de factura original' },
  E41: { label: 'Compras', short: 'Compras', color: 'bg-amber-100 text-amber-700', icon: Receipt, desc: 'Proveedor informal sin RNC' },
  E43: { label: 'Gastos Menores', short: 'Gastos Menores', color: 'bg-gray-100 text-gray-700', icon: Briefcase, desc: 'Gastos menores sin retención' },
  E44: { label: 'Régimen Especial', short: 'Rég. Especial', color: 'bg-teal-100 text-teal-700', icon: FileEdit, desc: 'Zona franca, exentos' },
  E45: { label: 'Gubernamental', short: 'Gubernamental', color: 'bg-indigo-100 text-indigo-700', icon: Landmark, desc: 'Entidades del gobierno' },
  E46: { label: 'Exportaciones', short: 'Exportación', color: 'bg-cyan-100 text-cyan-700', icon: Globe, desc: 'Ventas a compradores extranjeros' },
  E47: { label: 'Pagos al Exterior', short: 'Pago Exterior', color: 'bg-rose-100 text-rose-700', icon: Globe, desc: 'Servicios a no residentes' },
} as const;

type EcfKey = keyof typeof ECF_TYPES;

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700', PROCESSING: 'bg-yellow-100 text-yellow-700',
  SENT: 'bg-blue-100 text-blue-700', ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700', CONDITIONAL: 'bg-orange-100 text-orange-700',
  VOIDED: 'bg-gray-200 text-gray-600', CONTINGENCY: 'bg-amber-100 text-amber-700',
  ERROR: 'bg-red-100 text-red-700',
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador', PROCESSING: 'Procesando', SENT: 'Enviada',
  ACCEPTED: 'Aceptada', REJECTED: 'Rechazada', CONDITIONAL: 'Condicional',
  VOIDED: 'Anulada', CONTINGENCY: 'Contingencia', ERROR: 'Error',
};
const PAYMENTS = [
  { v: 1, l: 'Efectivo' }, { v: 2, l: 'Cheque / Transferencia' },
  { v: 3, l: 'Tarjeta Crédito/Débito' }, { v: 4, l: 'Venta a Crédito' },
  { v: 5, l: 'Permuta' }, { v: 6, l: 'Nota de Crédito' }, { v: 7, l: 'Mixto' },
];

// Types that require selecting a client (RNC)
const TYPES_WITH_CLIENT: EcfKey[] = ['E31', 'E44', 'E45'];
// Types for quick invoice (no client needed)
const TYPES_NO_CLIENT: EcfKey[] = ['E32', 'E41', 'E43', 'E46', 'E47'];
// Types that need a reference document
const TYPES_WITH_REF: EcfKey[] = ['E33', 'E34'];

interface Item { desc: string; qty: number; price: number; itbis: number; disc: number; }
const blankItem = (): Item => ({ desc: '', qty: 1, price: 0, itbis: 18, disc: 0 });
const fmt = (n: any) => Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const companyLabel = (c: any) => c.businessName || c.tradeName || c.rnc;

export default function InvoicesPage() {
  // ═══ LIST ═══
  const [data, setData] = useState<any>({ data: [], meta: {} });
  const [loading, setLoading] = useState(true);
  const [pg, setPg] = useState(1);
  const [fStatus, setFStatus] = useState('');
  const [fType, setFType] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const p: Record<string, string> = { page: String(pg), limit: '15' };
    if (fStatus) p.status = fStatus;
    if (fType) p.ecfType = fType;
    invoices.list(p).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [pg, fStatus, fType]);
  useEffect(() => { load(); }, [load]);

  // ═══ CREATE MODAL ═══
  const [modal, setModal] = useState(false);
  const [step, setStep] = useState(1); // 1=type+buyer, 2=items
  const [comps, setComps] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [compId, setCompId] = useState('');
  const [ecfType, setEcfType] = useState<EcfKey>('E32');
  const [buyer, setBuyer] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([blankItem()]);
  const [pay, setPay] = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  // Reference (for E33/E34)
  const [refEncf, setRefEncf] = useState('');
  const [refDate, setRefDate] = useState('');
  const [refCode, setRefCode] = useState(1);

  // ═══ CLIENT SEARCH + QUICK ADD ═══
  const [searchQ, setSearchQ] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickRnc, setQuickRnc] = useState('');
  const [quickLooking, setQuickLooking] = useState(false);
  const [quickData, setQuickData] = useState<any>(null);
  const [quickErr, setQuickErr] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  const openModal = async () => {
    setModal(true); setStep(1); setEcfType('E32'); setBuyer(null);
    setItems([blankItem()]); setPay(1); setErr(''); setOk('');
    setSearchQ(''); resetQuickAdd(); setRefEncf(''); setRefDate(''); setRefCode(1);
    try {
      const [c, b] = await Promise.all([companies.list(), buyers.list()]);
      const cl = Array.isArray(c) ? c : c.data || [];
      setComps(cl);
      setCompId(cl.length > 0 ? cl[0].id : '');
      setClients(Array.isArray(b) ? b : b.data || []);
    } catch {}
  };

  const closeModal = () => setModal(false);

  const resetQuickAdd = () => {
    setShowQuickAdd(false); setQuickRnc(''); setQuickData(null);
    setQuickErr(''); setQuickSaving(false); setQuickLooking(false);
  };

  // ═══ TYPE HELPERS ═══
  const needsClient = TYPES_WITH_CLIENT.includes(ecfType);
  const needsRef = TYPES_WITH_REF.includes(ecfType);
  const typeInfo = ECF_TYPES[ecfType];

  const selectType = (t: EcfKey) => {
    setEcfType(t);
    // Reset buyer if switching to a type that doesn't need one
    if (!TYPES_WITH_CLIENT.includes(t)) {
      setBuyer(null); setSearchQ(''); resetQuickAdd();
    }
  };

  // ═══ CLIENT SEARCH ═══
  const filteredClients = clients.filter(b => {
    if (!searchQ.trim()) return true;
    const q = searchQ.toLowerCase().trim();
    return b.name?.toLowerCase().includes(q) || b.commercialName?.toLowerCase().includes(q) || b.rnc?.includes(q);
  });

  // Filter clients by matching ecfType (E31 clients for E31, E45 for E45, etc.)
  const matchingClients = needsClient ? filteredClients.filter(b => {
    if (ecfType === 'E31') return b.defaultEcfType === 'E31' || !b.defaultEcfType;
    if (ecfType === 'E44') return b.defaultEcfType === 'E44';
    if (ecfType === 'E45') return b.defaultEcfType === 'E45';
    return true;
  }) : [];

  const displayClients = matchingClients;

  const quickLookup = async (val: string) => {
    const clean = val.replace(/\D/g, '');
    setQuickRnc(clean);
    if (clean.length !== 9 && clean.length !== 11) { setQuickData(null); setQuickErr(''); return; }
    setQuickLooking(true); setQuickErr(''); setQuickData(null);
    try { setQuickData(await rnc.lookup(clean)); }
    catch (e: any) { setQuickErr(e.message || 'No encontrado en DGII'); }
    finally { setQuickLooking(false); }
  };

  const quickCreate = async () => {
    if (!quickData) return;
    setQuickSaving(true); setQuickErr('');
    try {
      const newBuyer = await buyers.create({ rnc: quickRnc });
      setClients(prev => [newBuyer, ...prev]);
      setBuyer(newBuyer);
      // Auto-set ecfType based on new client's type
      if (newBuyer.defaultEcfType && ECF_TYPES[newBuyer.defaultEcfType as EcfKey]) {
        setEcfType(newBuyer.defaultEcfType as EcfKey);
      }
      resetQuickAdd(); setSearchQ('');
    } catch (e: any) {
      setQuickErr(e.message || 'Error al crear cliente');
    } finally { setQuickSaving(false); }
  };

  // ═══ ITEMS ═══
  const setItem = (i: number, f: keyof Item, v: any) => setItems(p => p.map((x, j) => j === i ? { ...x, [f]: v } : x));
  const addItem = () => setItems(p => [...p, blankItem()]);
  const delItem = (i: number) => { if (items.length > 1) setItems(p => p.filter((_, j) => j !== i)); };

  const calc = (it: Item) => {
    const sub = it.qty * it.price;
    const net = Math.max(0, sub - (it.disc || 0));
    const tax = net * (it.itbis / 100);
    return { sub, net, tax, total: net + tax };
  };
  const totals = items.reduce((a, it) => {
    const c = calc(it);
    return { sub: a.sub + c.sub, disc: a.disc + (it.disc || 0), tax: a.tax + c.tax, total: a.total + c.total };
  }, { sub: 0, disc: 0, tax: 0, total: 0 });

  // ═══ VALIDATION ═══
  const step1Ok = compId !== '' && (
    (needsClient && buyer !== null) ||
    (!needsClient && !needsRef) ||
    (needsRef && refEncf.length === 13 && refDate.length >= 8)
  );
  const step2Ok = items.length > 0 && items.every(it => it.desc.trim() && it.qty > 0 && it.price > 0);

  const submit = async () => {
    if (!step2Ok) return;
    setSaving(true); setErr(''); setOk('');
    try {
      const payload: any = {
        companyId: compId, ecfType,
        buyer: buyer ? { rnc: buyer.rnc, name: buyer.name } : { name: 'Consumidor Final' },
        items: items.map(it => ({
          description: it.desc, quantity: it.qty, unitPrice: it.price,
          itbisRate: it.itbis, discount: it.disc || 0,
        })),
        payment: { type: pay },
      };
      if (needsRef) {
        payload.reference = { encf: refEncf, date: refDate, modificationCode: refCode };
      }
      const res = await invoices.create(payload);
      setOk(`Factura creada: ${res.encf || res.id} — ${res.status}`);
      setTimeout(() => { closeModal(); load(); }, 1500);
    } catch (e: any) { setErr(e.message || 'Error al crear factura'); }
    finally { setSaving(false); }
  };

  const rows = data?.data || data || [];
  const meta = data?.meta || { total: rows.length, page: 1, totalPages: 1 };

  // ═══ TYPE BADGE COMPONENT ═══
  const TypeBadge = ({ type, size = 'sm' }: { type: string; size?: 'sm' | 'xs' }) => {
    const info = ECF_TYPES[type as EcfKey];
    if (!info) return <span className="text-xs text-gray-500">{type}</span>;
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full font-medium ${info.color} ${size === 'xs' ? 'text-[10px]' : 'text-xs'}`}>
        {type}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturas</h1>
          <p className="text-sm text-gray-500">{meta.total || 0} facturas en total</p>
        </div>
        <button onClick={openModal} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> Nueva Factura
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select value={fStatus} onChange={e => { setFStatus(e.target.value); setPg(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={fType} onChange={e => { setFType(e.target.value); setPg(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none">
          <option value="">Todos los tipos</option>
          {Object.entries(ECF_TYPES).map(([k, v]) => <option key={k} value={k}>{k} – {v.short}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No hay facturas</p>
          <button onClick={openModal} className="mt-3 text-brand-600 text-sm font-medium hover:underline">Crear primera factura</button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">e-NCF</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Monto</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Fecha</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((inv: any) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{inv.encf || '—'}</td>
                  <td className="px-4 py-3"><TypeBadge type={inv.ecfType} /></td>
                  <td className="px-4 py-3 text-gray-700">{inv.buyerName || 'Consumidor Final'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">RD$ {fmt(inv.totalAmount)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[inv.status] || ''}`}>{STATUS_LABEL[inv.status] || inv.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('es-DO') : '—'}</td>
                  <td className="px-4 py-3"><Link to={`/invoices/${inv.id}`} className="text-brand-600 hover:text-brand-700"><Eye className="w-4 h-4" /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-xs text-gray-500">Página {meta.page} de {meta.totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPg(p => Math.max(1, p - 1))} disabled={pg <= 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setPg(p => Math.min(meta.totalPages, p + 1))} disabled={pg >= meta.totalPages} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════ */}
      {/* ═══ CREATE INVOICE MODAL ═══ */}
      {/* ══════════════════════════════════════ */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Nueva Factura</h2>
                <p className="text-xs text-gray-500">{step === 1 ? 'Paso 1: Tipo de comprobante y destinatario' : 'Paso 2: Items y pago'}</p>
              </div>
              <button onClick={closeModal}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {err && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{err}</div>}
              {ok && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2"><CheckCircle className="w-4 h-4" />{ok}</div>}

              {/* ════════ STEP 1 ════════ */}
              {step === 1 && (
                <>
                  {/* Company */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Empresa emisora</label>
                    {comps.length <= 1 ? (
                      <div className="px-3 py-2.5 bg-gray-50 rounded-lg text-sm font-medium text-gray-800 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        {comps.length === 1 ? `${companyLabel(comps[0])} (${comps[0].rnc})` : 'No hay empresas'}
                      </div>
                    ) : (
                      <select value={compId} onChange={e => setCompId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none">
                        {comps.map((c: any) => <option key={c.id} value={c.id}>{companyLabel(c)} — {c.rnc}</option>)}
                      </select>
                    )}
                  </div>

                  {/* Type selector - grid */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Tipo de comprobante</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.entries(ECF_TYPES) as [EcfKey, typeof ECF_TYPES[EcfKey]][]).map(([key, info]) => {
                        const Icon = info.icon;
                        const selected = ecfType === key;
                        return (
                          <div
                            key={key}
                            onClick={() => selectType(key)}
                            className={`p-3 rounded-xl border-2 cursor-pointer transition ${
                              selected
                                ? `border-brand-500 bg-brand-50`
                                : 'border-gray-150 hover:border-gray-300 bg-white'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selected ? 'bg-brand-100' : 'bg-gray-100'}`}>
                                <Icon className={`w-4 h-4 ${selected ? 'text-brand-600' : 'text-gray-400'}`} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-xs font-bold ${selected ? 'text-brand-700' : 'text-gray-500'}`}>{key}</span>
                                  <span className={`text-xs font-medium ${selected ? 'text-gray-900' : 'text-gray-700'}`}>{info.short}</span>
                                </div>
                                <p className="text-[10px] text-gray-400 truncate">{info.desc}</p>
                              </div>
                              {selected && <CheckCircle className="w-4 h-4 text-brand-500 shrink-0 ml-auto" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── CLIENT SELECTOR (for E31, E44, E45) ── */}
                  {needsClient && (
                    <div className="space-y-3">
                      <label className="block text-xs font-medium text-gray-500">Seleccione el cliente</label>
                      {/* Search */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input value={searchQ} onChange={e => { setSearchQ(e.target.value); resetQuickAdd(); }}
                          placeholder="Buscar por nombre o RNC..."
                          className="w-full pl-9 pr-8 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none" autoFocus />
                        {searchQ && <button onClick={() => { setSearchQ(''); resetQuickAdd(); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>}
                      </div>

                      {!showQuickAdd && (
                        <>
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {displayClients.length === 0 && searchQ.trim() ? (
                              <div className="text-center py-3 text-sm text-gray-400">No se encontró "{searchQ}"</div>
                            ) : displayClients.map((b: any) => (
                              <div key={b.id} onClick={() => setBuyer(b)}
                                className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer text-sm transition ${buyer?.id === b.id ? 'bg-blue-100 ring-1 ring-blue-300' : 'hover:bg-blue-50'}`}>
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-900 truncate">{b.name}</p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 font-mono">{b.rnc}</span>
                                    {b.defaultEcfType && <TypeBadge type={b.defaultEcfType} size="xs" />}
                                  </div>
                                </div>
                                {buyer?.id === b.id && <CheckCircle className="w-4 h-4 text-blue-500 shrink-0" />}
                              </div>
                            ))}
                          </div>
                          <button onClick={() => { setShowQuickAdd(true); const q = searchQ.trim(); if (/^\d{6,}$/.test(q)) quickLookup(q); }}
                            className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition">
                            <UserPlus className="w-4 h-4" /> Agregar nuevo cliente
                          </button>
                        </>
                      )}

                      {/* Quick add */}
                      {showQuickAdd && (
                        <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3 shadow-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2"><UserPlus className="w-4 h-4 text-blue-600" /><span className="text-sm font-medium text-blue-700">Agregar cliente rápido</span></div>
                            <button onClick={resetQuickAdd}><X className="w-4 h-4 text-gray-400 hover:text-gray-600" /></button>
                          </div>
                          <div className="relative">
                            <input value={quickRnc} onChange={e => quickLookup(e.target.value)}
                              placeholder="RNC (9 dígitos) o Cédula (11 dígitos)"
                              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none font-mono" maxLength={11} autoFocus />
                            {quickLooking && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-blue-500" />}
                          </div>
                          {quickData && (
                            <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
                              <div className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-600" /><span className="text-xs font-medium text-green-700">Encontrado en DGII</span></div>
                              <p className="text-sm font-semibold text-gray-900">{quickData.name}</p>
                              {quickData.commercialName && <p className="text-xs text-gray-500">{quickData.commercialName}</p>}
                              <div className="flex gap-2 text-xs">
                                <span className="text-green-600 font-medium">{quickData.status}</span>
                                {quickData.paymentRegime && <span className="text-gray-400">{quickData.paymentRegime}</span>}
                              </div>
                              <button onClick={quickCreate} disabled={quickSaving}
                                className="w-full mt-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                                {quickSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Crear y seleccionar
                              </button>
                            </div>
                          )}
                          {quickErr && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{quickErr}</div>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── REFERENCE (for E33, E34) ── */}
                  {needsRef && (
                    <div className="space-y-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                      <label className="block text-xs font-medium text-orange-700">Documento de referencia</label>
                      <input value={refEncf} onChange={e => setRefEncf(e.target.value)} placeholder="e-NCF original (ej: E310000000001)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-orange-400 outline-none" maxLength={13} />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" value={refDate} onChange={e => setRefDate(e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none" />
                        <select value={refCode} onChange={e => setRefCode(Number(e.target.value))}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none">
                          <option value={1}>Descuento</option><option value={2}>Intereses</option>
                          <option value={3}>Devolución</option><option value={4}>Anulación</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  <div className="p-3 bg-gray-50 rounded-lg flex items-center gap-2 text-sm">
                    <TypeBadge type={ecfType} />
                    <span className="text-xs text-gray-400">→</span>
                    <span className="text-xs text-gray-600 truncate">
                      {buyer ? `${buyer.name} (${buyer.rnc})` : TYPES_NO_CLIENT.includes(ecfType) ? (ecfType === 'E32' ? 'Consumidor Final' : ECF_TYPES[ecfType].short) : needsRef ? `Ref: ${refEncf || '...'}` : 'Seleccione cliente'}
                    </span>
                  </div>
                </>
              )}

              {/* ════════ STEP 2 ════════ */}
              {step === 2 && (
                <>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <TypeBadge type={ecfType} />
                    <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">
                      {buyer ? `${buyer.name} (${buyer.rnc})` : ecfType === 'E32' ? 'Consumidor Final' : ECF_TYPES[ecfType].short}
                    </span>
                    <button onClick={() => setStep(1)} className="text-xs text-brand-600 hover:underline shrink-0">Cambiar</button>
                  </div>

                  {/* Items */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-gray-500">Items</label>
                      <button onClick={addItem} className="text-xs text-brand-600 hover:underline">+ Agregar item</button>
                    </div>
                    <div className="space-y-3">
                      {items.map((it, i) => (
                        <div key={i} className="p-3 bg-gray-50 rounded-lg space-y-2">
                          <div className="flex items-start gap-2">
                            <input placeholder="Descripción del producto o servicio" value={it.desc}
                              onChange={e => setItem(i, 'desc', e.target.value)}
                              className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none" />
                            {items.length > 1 && <button onClick={() => delItem(i)} className="p-1 text-gray-400 hover:text-red-500 mt-0.5"><Trash2 className="w-4 h-4" /></button>}
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Cantidad</label>
                              <input type="number" min="0.01" step="0.01" value={it.qty}
                                onChange={e => setItem(i, 'qty', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-right focus:ring-1 focus:ring-brand-500 outline-none" />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Precio Unit.</label>
                              <input type="number" min="0.01" step="0.01" value={it.price || ''}
                                onChange={e => setItem(i, 'price', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-right focus:ring-1 focus:ring-brand-500 outline-none" />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">ITBIS %</label>
                              <select value={it.itbis} onChange={e => setItem(i, 'itbis', Number(e.target.value))}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none">
                                <option value={18}>18%</option><option value={16}>16%</option><option value={0}>0%</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Descuento</label>
                              <input type="number" min="0" step="0.01" value={it.disc || ''}
                                onChange={e => setItem(i, 'disc', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-right focus:ring-1 focus:ring-brand-500 outline-none" />
                            </div>
                          </div>
                          <div className="text-right text-xs text-gray-500">
                            Subtotal: RD$ {fmt(calc(it).net)} + ITBIS: RD$ {fmt(calc(it).tax)} = <span className="font-medium text-gray-700">RD$ {fmt(calc(it).total)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Forma de pago</label>
                    <select value={pay} onChange={e => setPay(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none">
                      {PAYMENTS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
                    </select>
                  </div>

                  {/* Totals */}
                  <div className="p-4 bg-gray-50 rounded-xl space-y-1.5 text-sm">
                    <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>RD$ {fmt(totals.sub)}</span></div>
                    {totals.disc > 0 && <div className="flex justify-between text-gray-600"><span>Descuento</span><span>- RD$ {fmt(totals.disc)}</span></div>}
                    <div className="flex justify-between text-gray-600"><span>ITBIS</span><span>RD$ {fmt(totals.tax)}</span></div>
                    <div className="flex justify-between font-bold text-gray-900 text-base pt-1.5 border-t border-gray-200">
                      <span>Total</span><span>RD$ {fmt(totals.total)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center p-5 border-t shrink-0">
              {step === 1 ? (
                <>
                  <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
                  <button onClick={() => setStep(2)} disabled={!step1Ok}
                    className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    Siguiente →
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">← Atrás</button>
                  <button onClick={submit} disabled={saving || !step2Ok}
                    className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />} Crear Factura
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
