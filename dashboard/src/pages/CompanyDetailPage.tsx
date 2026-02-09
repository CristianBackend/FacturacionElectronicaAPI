import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { companies, certificates, sequences, invoices } from '../lib/api';
import {
  ArrowLeft, Building2, Shield, Hash, FileText, Plus, X, Upload,
  RefreshCw, Trash2, Check, AlertCircle
} from 'lucide-react';

type Tab = 'overview' | 'sequences' | 'certificates' | 'invoices';

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      companies.get(id).then(setCompany).finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) return <div className="py-12 text-center text-gray-400">Cargando...</div>;
  if (!company) return <div className="py-12 text-center text-red-500">Empresa no encontrada</div>;

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'overview', label: 'General', icon: Building2 },
    { key: 'sequences', label: 'Secuencias', icon: Hash },
    { key: 'certificates', label: 'Certificados', icon: Shield },
    { key: 'invoices', label: 'Crear Factura', icon: FileText },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/companies')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{company.businessName}</h1>
          <p className="text-sm text-gray-500">RNC: {company.rnc} · {company.dgiiEnv || 'DEV'}</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab company={company} />}
      {tab === 'sequences' && <SequencesTab companyId={id!} />}
      {tab === 'certificates' && <CertificatesTab companyId={id!} />}
      {tab === 'invoices' && <CreateInvoiceTab companyId={id!} />}
    </div>
  );
}

// ═══════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════
function OverviewTab({ company }: { company: any }) {
  const fields = [
    { label: 'Razón Social', value: company.businessName },
    { label: 'Nombre Comercial', value: company.tradeName || '—' },
    { label: 'RNC', value: company.rnc },
    { label: 'Dirección', value: company.address || '—' },
    { label: 'Email', value: company.email || '—' },
    { label: 'Teléfono', value: company.phone || '—' },
    { label: 'Municipio', value: company.municipality || '—' },
    { label: 'Provincia', value: company.province || '—' },
    { label: 'Ambiente DGII', value: company.dgiiEnv || 'DEV' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-4">Información de la empresa</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map(f => (
          <div key={f.label}>
            <p className="text-xs text-gray-400 uppercase font-medium">{f.label}</p>
            <p className="text-sm text-gray-900 mt-0.5">{f.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// SEQUENCES TAB
// ═══════════════════════════════════════════════
function SequencesTab({ companyId }: { companyId: string }) {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    ecfType: 'E31',
    startNumber: '1',
    endNumber: '10000',
    expiresAt: '2027-12-31',
  });

  const ecfTypes = [
    { value: 'E31', label: 'E31 - Factura de Crédito Fiscal' },
    { value: 'E32', label: 'E32 - Factura de Consumo' },
    { value: 'E33', label: 'E33 - Nota de Débito' },
    { value: 'E34', label: 'E34 - Nota de Crédito' },
    { value: 'E41', label: 'E41 - Compras' },
    { value: 'E43', label: 'E43 - Gastos Menores' },
    { value: 'E44', label: 'E44 - Regímenes Especiales' },
    { value: 'E45', label: 'E45 - Gubernamental' },
    { value: 'E46', label: 'E46 - Exportaciones' },
    { value: 'E47', label: 'E47 - Pagos al Exterior' },
  ];

  const load = () => {
    sequences.list(companyId).then(setList).catch(() => setList([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [companyId]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const start = parseInt(form.startNumber);
    const end = parseInt(form.endNumber);

    if (!form.startNumber || isNaN(start)) {
      errors.startNumber = 'Requerido';
    } else if (start < 1) {
      errors.startNumber = 'Debe ser mayor a 0';
    } else if (!Number.isInteger(start)) {
      errors.startNumber = 'Debe ser un número entero';
    }

    if (!form.endNumber || isNaN(end)) {
      errors.endNumber = 'Requerido';
    } else if (end < 2) {
      errors.endNumber = 'Debe ser al menos 2';
    } else if (!Number.isInteger(end)) {
      errors.endNumber = 'Debe ser un número entero';
    }

    if (start >= end) {
      errors.endNumber = 'Debe ser mayor al número inicial';
    }

    if (end - start > 10000000) {
      errors.endNumber = 'Rango máximo: 10,000,000';
    }

    if (form.expiresAt) {
      const expDate = new Date(form.expiresAt);
      if (expDate <= new Date()) {
        errors.expiresAt = 'La fecha debe ser futura';
      }
    }

    // Check overlap with existing sequences (client-side)
    const overlap = list.find(s =>
      s.ecfType === form.ecfType && (
        (start >= s.startNumber && start <= s.endNumber) ||
        (end >= s.startNumber && end <= s.endNumber) ||
        (start <= s.startNumber && end >= s.endNumber)
      )
    );
    if (overlap) {
      errors.startNumber = `Rango se solapa con secuencia existente ${overlap.startNumber}-${overlap.endNumber}`;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;
    setSaving(true);
    setError('');
    try {
      await sequences.create({
        companyId,
        ecfType: form.ecfType,
        startNumber: parseInt(form.startNumber),
        endNumber: parseInt(form.endNumber),
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      });
      setShowForm(false);
      setForm({ ecfType: 'E31', startNumber: '1', endNumber: '10000', expiresAt: '2027-12-31' });
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Secuencias eNCF</h2>
        <button onClick={() => { setShowForm(true); setError(''); setFieldErrors({}); }}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-700">
          <Plus className="w-4 h-4" /> Nueva secuencia
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Nueva secuencia</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {error && <div className="mb-3 p-2 bg-red-50 text-red-600 text-sm rounded">{error}</div>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tipo de e-CF</label>
                <select value={form.ecfType} onChange={e => setForm({ ...form, ecfType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white">
                  {ecfTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Número inicial</label>
                  <input type="number" min="1" step="1" value={form.startNumber}
                    onChange={e => { setForm({ ...form, startNumber: e.target.value }); setFieldErrors({ ...fieldErrors, startNumber: '' }); }}
                    className={inputClass('startNumber')} />
                  {fieldErrors.startNumber && <p className="text-xs text-red-500 mt-1">{fieldErrors.startNumber}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Número final</label>
                  <input type="number" min="2" step="1" value={form.endNumber}
                    onChange={e => { setForm({ ...form, endNumber: e.target.value }); setFieldErrors({ ...fieldErrors, endNumber: '' }); }}
                    className={inputClass('endNumber')} />
                  {fieldErrors.endNumber && <p className="text-xs text-red-500 mt-1">{fieldErrors.endNumber}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Fecha vencimiento</label>
                <input type="date" value={form.expiresAt}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => { setForm({ ...form, expiresAt: e.target.value }); setFieldErrors({ ...fieldErrors, expiresAt: '' }); }}
                  className={inputClass('expiresAt')} />
                {fieldErrors.expiresAt && <p className="text-xs text-red-500 mt-1">{fieldErrors.expiresAt}</p>}
              </div>
            </div>
            <button onClick={handleCreate} disabled={saving}
              className="w-full mt-4 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Guardando...' : 'Crear secuencia'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Rango</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actual</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Disponibles</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vencimiento</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Cargando...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">No hay secuencias. Crea una para empezar a facturar.</td></tr>
            ) : (
              list.map((s: any) => {
                const available = s.endNumber - s.currentNumber;
                const total = s.endNumber - s.startNumber + 1;
                const pct = Math.round(((s.currentNumber - s.startNumber + 1) / total) * 100);
                const expired = s.expiresAt && new Date(s.expiresAt) < new Date();
                return (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="bg-blue-100 text-blue-700 text-xs font-mono font-medium px-2 py-0.5 rounded">{s.ecfType}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-mono">{s.startNumber} → {s.endNumber}</td>
                    <td className="px-4 py-3 text-center text-sm font-mono text-gray-900 font-medium">{s.currentNumber}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{available}</span>
                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {s.expiresAt ? new Date(s.expiresAt).toLocaleDateString('es-DO') : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        expired ? 'bg-red-100 text-red-600' : s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {expired ? 'Vencida' : s.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// CERTIFICATES TAB
// ═══════════════════════════════════════════════
function CertificatesTab({ companyId }: { companyId: string }) {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [passphrase, setPassphrase] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [success, setSuccess] = useState('');

  const load = () => {
    certificates.list(companyId).then(setList).catch(() => setList([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [companyId]);

  const validateUpload = (): boolean => {
    const errors: Record<string, string> = {};

    if (!file) {
      errors.file = 'Selecciona un archivo .p12 o .pfx';
    } else {
      const ext = file.name.toLowerCase();
      if (!ext.endsWith('.p12') && !ext.endsWith('.pfx')) {
        errors.file = 'Solo se aceptan archivos .p12 o .pfx';
      }
      if (file.size > 10 * 1024 * 1024) {
        errors.file = 'El archivo no puede exceder 10MB';
      }
    }

    if (!passphrase) {
      errors.passphrase = 'La contraseña del certificado es requerida';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleUpload = async () => {
    if (!validateUpload()) return;
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const b64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(b64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file!);
      });

      await certificates.upload(companyId, base64, passphrase);
      setSuccess('Certificado subido exitosamente');
      setShowUpload(false);
      setFile(null);
      setPassphrase('');
      setFieldErrors({});
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Certificados digitales</h2>
        <button onClick={() => { setShowUpload(true); setError(''); setSuccess(''); setFieldErrors({}); }}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-700">
          <Upload className="w-4 h-4" /> Subir certificado
        </button>
      </div>

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
          <Check className="w-4 h-4" /> {success}
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Subir certificado P12</h3>
              <button onClick={() => setShowUpload(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {error && <div className="mb-3 p-2 bg-red-50 text-red-600 text-sm rounded">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Archivo .p12 / .pfx</label>
                <div className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                  fieldErrors.file ? 'border-red-300 bg-red-50' : 'border-gray-300 hover:border-brand-400'
                }`}>
                  <input type="file" accept=".p12,.pfx"
                    onChange={e => { setFile(e.target.files?.[0] || null); setFieldErrors({ ...fieldErrors, file: '' }); }}
                    className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-600 hover:file:bg-brand-100" />
                  {file && <p className="text-xs text-green-600 mt-2">✓ {file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
                </div>
                {fieldErrors.file && <p className="text-xs text-red-500 mt-1">{fieldErrors.file}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Contraseña del certificado</label>
                <input type="password" value={passphrase}
                  onChange={e => { setPassphrase(e.target.value); setFieldErrors({ ...fieldErrors, passphrase: '' }); }}
                  placeholder="Contraseña del .p12"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 outline-none ${
                    fieldErrors.passphrase ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-brand-500'
                  }`} />
                {fieldErrors.passphrase && <p className="text-xs text-red-500 mt-1">{fieldErrors.passphrase}</p>}
              </div>
            </div>
            <button onClick={handleUpload} disabled={uploading}
              className="w-full mt-4 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
              {uploading ? 'Subiendo...' : 'Subir certificado'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="text-gray-400 py-8 text-center">Cargando...</div>
        ) : list.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Sin certificado</p>
              <p className="text-xs text-yellow-600 mt-1">Sube un certificado digital P12 para poder firmar las facturas electrónicas.</p>
            </div>
          </div>
        ) : (
          list.map((cert: any) => (
            <div key={cert.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="p-2 bg-green-50 text-green-600 rounded-lg"><Shield className="w-5 h-5" /></span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{cert.subjectCN || cert.issuer || 'Certificado digital'}</p>
                    <p className="text-xs text-gray-500 font-mono">{cert.fingerprint}</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs ${cert.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {cert.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-4 text-xs text-gray-500">
                <div><span className="text-gray-400">Válido desde:</span> {cert.validFrom ? new Date(cert.validFrom).toLocaleDateString('es-DO') : '—'}</div>
                <div><span className="text-gray-400">Válido hasta:</span> {cert.validTo ? new Date(cert.validTo).toLocaleDateString('es-DO') : '—'}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// CREATE INVOICE TAB
// ═══════════════════════════════════════════════
function CreateInvoiceTab({ companyId }: { companyId: string }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);

  const [ecfType, setEcfType] = useState('E32');
  const [buyerName, setBuyerName] = useState('CONSUMIDOR FINAL');
  const [buyerRnc, setBuyerRnc] = useState('');
  const [paymentType, setPaymentType] = useState('1');

  const [items, setItems] = useState([
    { description: '', quantity: '1', unitPrice: '', itbisRate: '18' }
  ]);

  const ecfTypes = [
    { value: 'E31', label: 'E31 - Crédito Fiscal', requiresRnc: true },
    { value: 'E32', label: 'E32 - Consumo', requiresRnc: false },
    { value: 'E33', label: 'E33 - Nota de Débito', requiresRnc: true },
    { value: 'E34', label: 'E34 - Nota de Crédito', requiresRnc: true },
    { value: 'E41', label: 'E41 - Compras', requiresRnc: true },
    { value: 'E44', label: 'E44 - Reg. Especiales', requiresRnc: true },
    { value: 'E45', label: 'E45 - Gubernamental', requiresRnc: true },
    { value: 'E46', label: 'E46 - Exportaciones', requiresRnc: false },
    { value: 'E47', label: 'E47 - Pagos Exterior', requiresRnc: false },
  ];

  const paymentTypes = [
    { value: '1', label: 'Efectivo' },
    { value: '2', label: 'Cheque' },
    { value: '3', label: 'Tarjeta Crédito/Débito' },
    { value: '4', label: 'Crédito' },
    { value: '5', label: 'Permuta' },
    { value: '6', label: 'Nota de Crédito' },
    { value: '7', label: 'Mixto' },
  ];

  const addItem = () => {
    setItems([...items, { description: '', quantity: '1', unitPrice: '', itbisRate: '18' }]);
  };

  const removeItem = (i: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, idx) => idx !== i));
  };

  const updateItem = (i: number, field: string, value: string) => {
    const newItems = [...items];
    (newItems[i] as any)[field] = value;
    setItems(newItems);
  };

  const calcSubtotal = () =>
    items.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0), 0);

  const calcITBIS = () =>
    items.reduce((sum, it) => {
      const base = (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0);
      return sum + base * ((parseFloat(it.itbisRate) || 0) / 100);
    }, 0);

  const validateInvoice = (): boolean => {
    const errors: Record<string, string> = {};

    // Buyer validation
    if (!buyerName.trim()) {
      errors.buyerName = 'Nombre del comprador requerido';
    } else if (buyerName.trim().length < 2) {
      errors.buyerName = 'Mínimo 2 caracteres';
    } else if (buyerName.trim().length > 250) {
      errors.buyerName = 'Máximo 250 caracteres';
    }

    // RNC validation
    const currentType = ecfTypes.find(t => t.value === ecfType);
    if (currentType?.requiresRnc && !buyerRnc.trim()) {
      errors.buyerRnc = `RNC requerido para ${ecfType}`;
    }
    if (buyerRnc.trim()) {
      if (!/^\d+$/.test(buyerRnc.trim())) {
        errors.buyerRnc = 'Solo dígitos numéricos';
      } else if (buyerRnc.trim().length !== 9 && buyerRnc.trim().length !== 11) {
        errors.buyerRnc = 'RNC: 9 dígitos / Cédula: 11 dígitos';
      }
    }

    // Items validation
    const itemErrors: string[] = [];
    items.forEach((item, i) => {
      if (!item.description.trim()) {
        itemErrors.push(`Item ${i + 1}: descripción requerida`);
      } else if (item.description.trim().length > 500) {
        itemErrors.push(`Item ${i + 1}: descripción máx 500 caracteres`);
      }

      const qty = parseFloat(item.quantity);
      if (!item.quantity || isNaN(qty) || qty <= 0) {
        itemErrors.push(`Item ${i + 1}: cantidad debe ser mayor a 0`);
      }

      const price = parseFloat(item.unitPrice);
      if (!item.unitPrice || isNaN(price) || price < 0) {
        itemErrors.push(`Item ${i + 1}: precio inválido`);
      } else if (price === 0) {
        itemErrors.push(`Item ${i + 1}: precio debe ser mayor a 0`);
      }

      const rate = parseFloat(item.itbisRate);
      if (isNaN(rate) || (rate !== 0 && rate !== 16 && rate !== 18)) {
        itemErrors.push(`Item ${i + 1}: ITBIS debe ser 0%, 16% o 18%`);
      }
    });

    if (itemErrors.length > 0) {
      errors.items = itemErrors.join('. ');
    }

    // E32 max 250,000 DOP check (RFCE)
    if (ecfType === 'E32') {
      const total = calcSubtotal() + calcITBIS();
      if (total > 250000) {
        errors.total = 'Factura de consumo (E32) no puede exceder RD$ 250,000. Use E31 (Crédito Fiscal).';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSend = async () => {
    if (!validateInvoice()) return;
    setSending(true);
    setError('');
    setResult(null);
    try {
      const payload = {
        companyId,
        ecfType,
        buyer: {
          name: buyerName.trim(),
          ...(buyerRnc.trim() ? { rnc: buyerRnc.trim() } : {}),
        },
        items: items.map(it => ({
          description: it.description.trim(),
          quantity: parseFloat(it.quantity) || 1,
          unitPrice: parseFloat(it.unitPrice) || 0,
          itbisRate: parseFloat(it.itbisRate) || 0,
        })),
        payment: { type: parseInt(paymentType) },
        idempotencyKey: `dash-${Date.now()}`,
      };
      const res = await invoices.create(payload);
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const inputClass = (field: string) =>
    `w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 outline-none ${
      fieldErrors[field] ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-brand-500'
    }`;

  return (
    <div className="max-w-3xl">
      {result && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Check className="w-5 h-5 text-green-600" />
            <span className="font-semibold text-green-800">Factura creada exitosamente</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm text-green-700">
            <p><span className="text-green-500">eNCF:</span> {result.encf || '—'}</p>
            <p><span className="text-green-500">Estado:</span> {result.status}</p>
            <p><span className="text-green-500">Código seguridad:</span> {result.securityCode}</p>
            <p><span className="text-green-500">ID:</span> <span className="font-mono text-xs">{result.id}</span></p>
          </div>
          <button onClick={() => { setResult(null); setItems([{ description: '', quantity: '1', unitPrice: '', itbisRate: '18' }]); }}
            className="mt-3 text-sm text-green-600 hover:text-green-800 underline">
            Crear otra factura
          </button>
        </div>
      )}

      {!result && (
        <>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {/* Type & Payment */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h3 className="font-medium text-gray-900 mb-3">Tipo de comprobante</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tipo e-CF</label>
                <select value={ecfType} onChange={e => { setEcfType(e.target.value); setFieldErrors({}); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white">
                  {ecfTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Forma de pago</label>
                <select value={paymentType} onChange={e => setPaymentType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white">
                  {paymentTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Buyer */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h3 className="font-medium text-gray-900 mb-3">Comprador</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Nombre / Razón Social <span className="text-red-400">*</span>
                </label>
                <input value={buyerName}
                  onChange={e => { setBuyerName(e.target.value); setFieldErrors({ ...fieldErrors, buyerName: '' }); }}
                  maxLength={250}
                  className={inputClass('buyerName')} />
                {fieldErrors.buyerName && <p className="text-xs text-red-500 mt-1">{fieldErrors.buyerName}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  RNC / Cédula {ecfTypes.find(t => t.value === ecfType)?.requiresRnc ? <span className="text-red-400">*</span> : '(opcional)'}
                </label>
                <input value={buyerRnc}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '');
                    if (v.length <= 11) { setBuyerRnc(v); setFieldErrors({ ...fieldErrors, buyerRnc: '' }); }
                  }}
                  placeholder="9 u 11 dígitos"
                  maxLength={11}
                  className={inputClass('buyerRnc')} />
                {fieldErrors.buyerRnc && <p className="text-xs text-red-500 mt-1">{fieldErrors.buyerRnc}</p>}
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900">Artículos</h3>
              <button onClick={addItem} className="flex items-center gap-1 text-brand-600 text-sm hover:text-brand-700">
                <Plus className="w-4 h-4" /> Agregar
              </button>
            </div>

            {fieldErrors.items && (
              <div className="mb-3 p-2 bg-red-50 text-red-600 text-xs rounded">{fieldErrors.items}</div>
            )}

            {/* Header */}
            <div className="flex gap-2 mb-2 text-xs font-medium text-gray-400 uppercase">
              <div className="flex-1">Descripción</div>
              <div className="w-20 text-center">Cant.</div>
              <div className="w-28 text-right">Precio</div>
              <div className="w-20 text-center">ITBIS</div>
              <div className="w-8"></div>
            </div>

            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)}
                      placeholder="Descripción del artículo" maxLength={500}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
                  </div>
                  <div className="w-20">
                    <input type="number" value={item.quantity}
                      onChange={e => updateItem(i, 'quantity', e.target.value)}
                      min="0.01" step="any"
                      className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-brand-500 outline-none" />
                  </div>
                  <div className="w-28">
                    <input type="number" value={item.unitPrice}
                      onChange={e => updateItem(i, 'unitPrice', e.target.value)}
                      placeholder="0.00" min="0.01" step="0.01"
                      className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-brand-500 outline-none" />
                  </div>
                  <div className="w-20">
                    <select value={item.itbisRate} onChange={e => updateItem(i, 'itbisRate', e.target.value)}
                      className="w-full px-1 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white">
                      <option value="18">18%</option>
                      <option value="16">16%</option>
                      <option value="0">Exento</option>
                    </select>
                  </div>
                  <button onClick={() => removeItem(i)} disabled={items.length === 1}
                    className="p-2 text-gray-300 hover:text-red-500 disabled:invisible">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
              <div className="text-right space-y-1">
                <p className="text-sm text-gray-500">Subtotal: <span className="font-medium text-gray-900">RD$ {calcSubtotal().toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span></p>
                <p className="text-sm text-gray-500">ITBIS: <span className="font-medium text-gray-900">RD$ {calcITBIS().toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span></p>
                <p className="text-base font-semibold text-gray-900">Total: RD$ {(calcSubtotal() + calcITBIS()).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
                {fieldErrors.total && <p className="text-xs text-red-500">{fieldErrors.total}</p>}
              </div>
            </div>
          </div>

          {/* Submit */}
          <button onClick={handleSend} disabled={sending}
            className="w-full bg-brand-600 text-white py-3 rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {sending ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Procesando...</>
            ) : (
              <><FileText className="w-4 h-4" /> Emitir factura</>
            )}
          </button>
        </>
      )}
    </div>
  );
}
