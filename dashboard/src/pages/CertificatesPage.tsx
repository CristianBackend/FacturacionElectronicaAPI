import { useState, useEffect, useRef } from 'react';
import { companies, certificates } from '../lib/api';
import { Shield, Upload, Building2, CheckCircle, AlertCircle, Clock, ChevronDown, FileKey } from 'lucide-react';

export default function CertificatesPage() {
  const [companyList, setCompanyList] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [passphrase, setPassphrase] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileB64, setFileB64] = useState('');

  // Load companies
  useEffect(() => {
    companies.list().then((data) => {
      const list = Array.isArray(data) ? data : (data as any)?.data || [];
      setCompanyList(list);
      if (list.length === 1) setSelectedCompany(list[0].id);
    });
  }, []);

  // Load certificates when company changes
  useEffect(() => {
    if (!selectedCompany) { setList([]); return; }
    setLoading(true);
    setError('');
    certificates.list(selectedCompany)
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [selectedCompany]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.p12') && !file.name.endsWith('.pfx')) {
      setError('Solo se aceptan archivos .p12 o .pfx');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setFileB64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!fileB64) { setError('Selecciona un archivo .p12'); return; }
    if (!passphrase) { setError('Ingresa la contraseña del certificado'); return; }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await certificates.upload(selectedCompany, fileB64, passphrase);
      setSuccess('Certificado subido exitosamente');
      setShowUpload(false);
      setFileB64('');
      setFileName('');
      setPassphrase('');
      // Reload
      const data = await certificates.list(selectedCompany);
      setList(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || 'Error subiendo certificado');
    } finally {
      setSaving(false);
    }
  };

  const isExpiringSoon = (cert: any) => {
    if (!cert.expiresAt) return false;
    const diff = new Date(cert.expiresAt).getTime() - Date.now();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000; // 30 days
  };

  const isExpired = (cert: any) => cert.expiresAt && new Date(cert.expiresAt) < new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-7 h-7 text-blue-600" /> Certificados Digitales
          </h1>
          <p className="text-gray-500 text-sm mt-1">Certificados .p12 para firma digital de e-CF</p>
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
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Selecciona una empresa para ver sus certificados</p>
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

          {/* Actions */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">{list.length} certificado{list.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => { setShowUpload(!showUpload); setError(''); setSuccess(''); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Upload className="w-4 h-4" /> Subir certificado
            </button>
          </div>

          {/* Upload form */}
          {showUpload && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-gray-900">Subir certificado .p12</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Archivo .p12 / .pfx</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                >
                  <FileKey className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  {fileName ? (
                    <p className="text-sm text-blue-600 font-medium">{fileName}</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500">Clic para seleccionar archivo</p>
                      <p className="text-xs text-gray-400 mt-1">Acepta .p12 y .pfx</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".p12,.pfx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña del certificado</label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="••••••••"
                  className="w-full md:w-80 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleUpload}
                  disabled={saving || !fileB64}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Subiendo...' : 'Subir certificado'}
                </button>
                <button
                  onClick={() => { setShowUpload(false); setFileB64(''); setFileName(''); setPassphrase(''); }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Certificates list */}
          {loading ? (
            <div className="text-center py-12 text-gray-400">Cargando certificados...</div>
          ) : list.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <Shield className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-400">No hay certificados</p>
              <p className="text-gray-400 text-sm">Sube tu certificado .p12 para poder firmar e-CF</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {list.map((cert) => {
                const expired = isExpired(cert);
                const expiringSoon = isExpiringSoon(cert);

                return (
                  <div key={cert.id} className={`bg-white rounded-xl border p-5 ${
                    expired ? 'border-red-200 bg-red-50/30' : expiringSoon ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Shield className={`w-5 h-5 ${cert.isActive ? 'text-green-600' : 'text-gray-400'}`} />
                          <span className="font-semibold text-gray-900">{cert.subject || cert.commonName || 'Certificado'}</span>
                          {cert.isActive && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">ACTIVO</span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                          <div>
                            <span className="text-gray-500">Emisor: </span>
                            <span className="text-gray-700">{cert.issuer || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Serial: </span>
                            <span className="font-mono text-xs text-gray-700">{cert.serialNumber || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Subido: </span>
                            <span className="text-gray-700">{new Date(cert.createdAt).toLocaleDateString('es-DO')}</span>
                          </div>
                        </div>

                        {/* Expiration */}
                        <div className="mt-3 flex items-center gap-2 text-sm">
                          <Clock className={`w-4 h-4 ${expired ? 'text-red-500' : expiringSoon ? 'text-amber-500' : 'text-gray-400'}`} />
                          {expired ? (
                            <span className="text-red-600 font-medium">
                              Expirado: {new Date(cert.expiresAt).toLocaleDateString('es-DO')}
                            </span>
                          ) : cert.expiresAt ? (
                            <span className={expiringSoon ? 'text-amber-600 font-medium' : 'text-gray-600'}>
                              Vence: {new Date(cert.expiresAt).toLocaleDateString('es-DO')}
                              {expiringSoon && ' ⚠️ Próximo a vencer'}
                            </span>
                          ) : (
                            <span className="text-gray-400">Sin fecha de vencimiento</span>
                          )}
                        </div>
                      </div>
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
