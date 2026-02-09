import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { companies, rnc } from '../lib/api';
import { Building2, Plus, X, ChevronRight, Search, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

export default function CompaniesPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ rnc: '', businessName: '', address: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dgiiLookup, setDgiiLookup] = useState<any>(null);
  const [dgiiLoading, setDgiiLoading] = useState(false);
  const [dgiiError, setDgiiError] = useState('');

  const load = () => {
    companies.list().then(setList).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Auto-lookup RNC when valid length
  const lookupRnc = useCallback(async (rncValue: string) => {
    if (rncValue.length !== 9 && rncValue.length !== 11) {
      setDgiiLookup(null);
      setDgiiError('');
      return;
    }
    setDgiiLoading(true);
    setDgiiError('');
    setDgiiLookup(null);
    try {
      const result = await rnc.lookup(rncValue);
      setDgiiLookup(result);
      // Auto-fill name
      if (result?.name) {
        setForm(prev => ({
          ...prev,
          businessName: result.name,
          ...(result.commercialName ? {} : {}),
        }));
      }
    } catch (e: any) {
      setDgiiError(e.message);
    } finally {
      setDgiiLoading(false);
    }
  }, []);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // RNC validation
    const rnc = form.rnc.trim();
    if (!rnc) {
      errors.rnc = 'RNC es requerido';
    } else if (!/^\d+$/.test(rnc)) {
      errors.rnc = 'Solo dígitos numéricos';
    } else if (rnc.length !== 9 && rnc.length !== 11) {
      errors.rnc = 'RNC: 9 dígitos / Cédula: 11 dígitos';
    }

    // Business name
    const name = form.businessName.trim();
    if (!name) {
      errors.businessName = 'Razón social es requerida';
    } else if (name.length < 2) {
      errors.businessName = 'Mínimo 2 caracteres';
    } else if (name.length > 250) {
      errors.businessName = 'Máximo 250 caracteres';
    }

    // Email validation (optional)
    if (form.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.email.trim())) {
        errors.email = 'Email inválido';
      }
    }

    // Phone validation (optional)
    if (form.phone.trim() && form.phone.trim().length > 20) {
      errors.phone = 'Máximo 20 caracteres';
    }

    // Address (optional)
    if (form.address.trim() && form.address.trim().length > 500) {
      errors.address = 'Máximo 500 caracteres';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;
    setSaving(true);
    setError('');
    try {
      await companies.create({
        rnc: form.rnc.trim(),
        businessName: form.businessName.trim(),
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        dgiiEnv: 'DEV',
      });
      setShowForm(false);
      setForm({ rnc: '', businessName: '', address: '', phone: '', email: '' });
      setFieldErrors({});
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = (field: string) =>
    `w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 outline-none ${
      fieldErrors[field] ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-brand-500'
    }`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empresas</h1>
          <p className="text-sm text-gray-500">Empresas emisoras registradas</p>
        </div>
        <button onClick={() => { setShowForm(true); setError(''); setFieldErrors({}); }}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-700">
          <Plus className="w-4 h-4" /> Nueva empresa
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">Nueva empresa</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {error && <div className="mb-3 p-2 bg-red-50 text-red-600 text-sm rounded">{error}</div>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">RNC <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input placeholder="9 u 11 dígitos"
                    value={form.rnc}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '');
                      if (v.length <= 11) {
                        setForm({ ...form, rnc: v });
                        setFieldErrors({ ...fieldErrors, rnc: '' });
                        setDgiiLookup(null);
                        setDgiiError('');
                        if (v.length === 9 || v.length === 11) lookupRnc(v);
                      }
                    }}
                    maxLength={11}
                    className={inputClass('rnc')} />
                  {dgiiLoading && (
                    <Loader2 className="w-4 h-4 text-brand-500 animate-spin absolute right-3 top-2.5" />
                  )}
                </div>
                {fieldErrors.rnc && <p className="text-xs text-red-500 mt-1">{fieldErrors.rnc}</p>}

                {/* DGII Lookup Result */}
                {dgiiLookup && (
                  <div className="mt-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-xs font-medium text-green-700">Contribuyente encontrado en DGII</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{dgiiLookup.name}</p>
                    {dgiiLookup.commercialName && <p className="text-xs text-gray-500">{dgiiLookup.commercialName}</p>}
                    <div className="flex gap-3 mt-1 text-xs text-gray-500">
                      <span className={`font-medium ${dgiiLookup.status === 'ACTIVO' ? 'text-green-600' : 'text-red-500'}`}>
                        {dgiiLookup.status}
                      </span>
                      {dgiiLookup.isElectronicInvoicer && <span className="text-blue-600">e-CF ✓</span>}
                    </div>
                  </div>
                )}

                {dgiiError && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-xs text-red-600">{dgiiError}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Razón Social <span className="text-red-400">*</span></label>
                <input placeholder="Nombre legal de la empresa"
                  value={form.businessName}
                  onChange={e => { if (!dgiiLookup) { setForm({ ...form, businessName: e.target.value }); setFieldErrors({ ...fieldErrors, businessName: '' }); } }}
                  readOnly={!!dgiiLookup}
                  maxLength={250}
                  className={`${inputClass('businessName')} ${dgiiLookup ? 'bg-gray-100 cursor-not-allowed text-gray-600' : ''}`} />
                {fieldErrors.businessName && <p className="text-xs text-red-500 mt-1">{fieldErrors.businessName}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Dirección</label>
                <input placeholder="Dirección fiscal"
                  value={form.address}
                  onChange={e => { setForm({ ...form, address: e.target.value }); setFieldErrors({ ...fieldErrors, address: '' }); }}
                  maxLength={500}
                  className={inputClass('address')} />
                {fieldErrors.address && <p className="text-xs text-red-500 mt-1">{fieldErrors.address}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Teléfono</label>
                <input placeholder="809-555-0100"
                  value={form.phone}
                  onChange={e => { setForm({ ...form, phone: e.target.value }); setFieldErrors({ ...fieldErrors, phone: '' }); }}
                  maxLength={20}
                  className={inputClass('phone')} />
                {fieldErrors.phone && <p className="text-xs text-red-500 mt-1">{fieldErrors.phone}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input placeholder="facturacion@empresa.com" type="email"
                  value={form.email}
                  onChange={e => { setForm({ ...form, email: e.target.value }); setFieldErrors({ ...fieldErrors, email: '' }); }}
                  className={inputClass('email')} />
                {fieldErrors.email && <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>}
              </div>
            </div>
            <button onClick={handleCreate} disabled={saving}
              className="w-full mt-4 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Guardando...' : 'Crear empresa'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="text-gray-400 py-8">Cargando...</div>
        ) : list.length === 0 ? (
          <div className="text-gray-400 py-8">No hay empresas registradas</div>
        ) : (
          list.map((c: any) => (
            <div key={c.id} onClick={() => navigate(`/companies/${c.id}`)}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-brand-200 transition-all cursor-pointer group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="p-2 bg-purple-50 text-purple-600 rounded-lg"><Building2 className="w-5 h-5" /></span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{c.businessName}</h3>
                    <p className="text-sm text-gray-500">RNC: {c.rnc}</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-brand-500 transition-colors" />
              </div>
              {(c.address || c.email) && (
                <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-500 space-y-1">
                  {c.address && <p>📍 {c.address}</p>}
                  {c.email && <p>✉️ {c.email}</p>}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-gray-100 flex gap-4 text-xs text-gray-400">
                <span>📄 {c._count?.invoices || 0} facturas</span>
                <span>🔐 {c._count?.certificates || 0} certificados</span>
                <span>🔢 {c._count?.sequences || 0} secuencias</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
