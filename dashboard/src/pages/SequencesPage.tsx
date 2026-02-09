import { useState, useEffect } from 'react';
import { companies, sequences } from '../lib/api';
import { Hash, Plus, Building2, AlertCircle, CheckCircle, XCircle, ChevronDown } from 'lucide-react';

const ECF_TYPES = [
  { value: 'E31', label: 'E31 — Crédito Fiscal' },
  { value: 'E32', label: 'E32 — Consumo' },
  { value: 'E33', label: 'E33 — Nota de Débito' },
  { value: 'E34', label: 'E34 — Nota de Crédito' },
  { value: 'E41', label: 'E41 — Compras' },
  { value: 'E43', label: 'E43 — Gastos Menores' },
  { value: 'E44', label: 'E44 — Regímenes Especiales' },
  { value: 'E45', label: 'E45 — Gubernamental' },
  { value: 'E46', label: 'E46 — Exportaciones' },
  { value: 'E47', label: 'E47 — Pagos al Exterior' },
];

export default function SequencesPage() {
  const [companyList, setCompanyList] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    ecfType: 'E31',
    prefix: 'E31',
    startNumber: '',
    endNumber: '',
    expiresAt: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Load companies
  useEffect(() => {
    companies.list().then((data) => {
      const list = Array.isArray(data) ? data : (data as any)?.data || [];
      setCompanyList(list);
      if (list.length === 1) setSelectedCompany(list[0].id);
    });
  }, []);

  // Load sequences when company changes
  useEffect(() => {
    if (!selectedCompany) { setList([]); return; }
    setLoading(true);
    setError('');
    sequences.list(selectedCompany)
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [selectedCompany]);

  const handleTypeChange = (ecfType: string) => {
    setForm(f => ({ ...f, ecfType, prefix: ecfType }));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    const start = parseInt(form.startNumber, 10);
    const end = parseInt(form.endNumber, 10);
    if (!form.startNumber || isNaN(start) || start < 1) errs.startNumber = 'Debe ser un número positivo (mínimo 1)';
    if (!form.endNumber || isNaN(end) || end < 1) errs.endNumber = 'Debe ser un número positivo (mínimo 1)';
    if (!errs.startNumber && !errs.endNumber && end < start) errs.endNumber = 'Debe ser mayor o igual al inicial';
    if (!form.expiresAt) errs.expiresAt = 'Fecha de vencimiento requerida';

    // Check overlap
    const overlap = list.find(s =>
      s.ecfType === form.ecfType &&
      !(end < s.startNumber || start > s.endNumber)
    );
    if (overlap) {
      errs.startNumber = `Se solapa con secuencia existente ${overlap.startNumber}-${overlap.endNumber}`;
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await sequences.create({
        companyId: selectedCompany,
        ecfType: form.ecfType,
        prefix: form.prefix,
        startNumber: parseInt(form.startNumber, 10),
        endNumber: parseInt(form.endNumber, 10),
        expiresAt: new Date(form.expiresAt).toISOString(),
      });
      setSuccess('Secuencia creada exitosamente');
      setShowForm(false);
      setForm({ ecfType: 'E31', prefix: 'E31', startNumber: '', endNumber: '', expiresAt: '' });
      // Reload
      const data = await sequences.list(selectedCompany);
      setList(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || 'Error creando secuencia');
    } finally {
      setSaving(false);
    }
  };

  const getUsagePercent = (s: any) => {
    const total = s.endNumber - s.startNumber + 1;
    const used = s.currentNumber - s.startNumber;
    return Math.round((used / total) * 100);
  };

  const isExpired = (s: any) => s.expiresAt && new Date(s.expiresAt) < new Date();
  const isExhausted = (s: any) => s.currentNumber > s.endNumber;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Hash className="w-7 h-7 text-blue-600" /> Secuencias eNCF
          </h1>
          <p className="text-gray-500 text-sm mt-1">Rangos autorizados por DGII para emisión de comprobantes</p>
        </div>
      </div>

      {/* Company selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Building2 className="w-4 h-4 inline mr-1" /> Seleccionar empresa
        </label>
        <div className="relative">
          <select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="w-full md:w-96 appearance-none bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 pr-10 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">— Seleccionar empresa —</option>
            {companyList.map((c) => (
              <option key={c.id} value={c.id}>{c.businessName} ({c.rnc})</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
        </div>
      </div>

      {!selectedCompany && (
        <div className="text-center py-16 text-gray-400">
          <Hash className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Selecciona una empresa para ver sus secuencias</p>
        </div>
      )}

      {selectedCompany && (
        <>
          {/* Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> {success}
            </div>
          )}

          {/* Actions bar */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">{list.length} secuencia{list.length !== 1 ? 's' : ''} registrada{list.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => { setShowForm(!showForm); setFormErrors({}); setError(''); setSuccess(''); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> Nueva secuencia
            </button>
          </div>

          {/* Create form */}
          {showForm && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-gray-900">Registrar secuencia autorizada</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo e-CF</label>
                  <select
                    value={form.ecfType}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {ECF_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vencimiento</label>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                    className={`w-full bg-gray-50 border rounded-lg px-3 py-2 text-sm ${formErrors.expiresAt ? 'border-red-300' : 'border-gray-300'}`}
                  />
                  {formErrors.expiresAt && <p className="text-xs text-red-500 mt-1">{formErrors.expiresAt}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número inicial</label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-400 font-mono">{form.prefix}</span>
                    <input
                      type="number"
                      min="1"
                      value={form.startNumber}
                      onChange={(e) => setForm(f => ({ ...f, startNumber: e.target.value }))}
                      placeholder="1"
                      className={`flex-1 bg-gray-50 border rounded-lg px-3 py-2 text-sm font-mono ${formErrors.startNumber ? 'border-red-300' : 'border-gray-300'}`}
                    />
                  </div>
                  {formErrors.startNumber && <p className="text-xs text-red-500 mt-1">{formErrors.startNumber}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número final</label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-400 font-mono">{form.prefix}</span>
                    <input
                      type="number"
                      min="1"
                      value={form.endNumber}
                      onChange={(e) => setForm(f => ({ ...f, endNumber: e.target.value }))}
                      placeholder="500"
                      className={`flex-1 bg-gray-50 border rounded-lg px-3 py-2 text-sm font-mono ${formErrors.endNumber ? 'border-red-300' : 'border-gray-300'}`}
                    />
                  </div>
                  {formErrors.endNumber && <p className="text-xs text-red-500 mt-1">{formErrors.endNumber}</p>}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Crear secuencia'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Sequences list */}
          {loading ? (
            <div className="text-center py-12 text-gray-400">Cargando secuencias...</div>
          ) : list.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <Hash className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-400">No hay secuencias registradas</p>
              <p className="text-gray-400 text-sm">Registra las secuencias autorizadas por DGII para empezar a facturar</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {list.map((s) => {
                const usage = getUsagePercent(s);
                const expired = isExpired(s);
                const exhausted = isExhausted(s);
                const active = !expired && !exhausted;
                const total = s.endNumber - s.startNumber + 1;
                const used = s.currentNumber - s.startNumber;
                const remaining = total - used;

                return (
                  <div key={s.id} className={`bg-white rounded-xl border p-5 ${
                    active ? 'border-gray-200' : 'border-red-200 bg-red-50/30'
                  }`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">{s.ecfType}</span>
                          <span className="font-mono text-sm text-gray-900">
                            {s.prefix}{String(s.startNumber).padStart(10 - s.prefix.length, '0')} — {s.prefix}{String(s.endNumber).padStart(10 - s.prefix.length, '0')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {ECF_TYPES.find(t => t.value === s.ecfType)?.label.split('—')[1]?.trim() || s.ecfType}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {expired && (
                          <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                            <XCircle className="w-3 h-3" /> Vencida
                          </span>
                        )}
                        {exhausted && (
                          <span className="flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                            <AlertCircle className="w-3 h-3" /> Agotada
                          </span>
                        )}
                        {active && (
                          <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                            <CheckCircle className="w-3 h-3" /> Activa
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>{used} usados de {total}</span>
                        <span>{remaining} disponibles</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            usage > 90 ? 'bg-red-500' : usage > 70 ? 'bg-amber-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${Math.min(usage, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Próximo: <span className="font-mono">{s.prefix}{String(s.currentNumber).padStart(10 - s.prefix.length, '0')}</span></span>
                      <span>Vence: {s.expiresAt ? new Date(s.expiresAt).toLocaleDateString('es-DO') : 'N/A'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
