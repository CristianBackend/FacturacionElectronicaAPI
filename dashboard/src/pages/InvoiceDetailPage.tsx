import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { invoices, getApiKey } from '../lib/api';
import { ArrowLeft, Download, Eye, FileText, File, XCircle, RefreshCw } from 'lucide-react';

const statusColors: Record<string, string> = {
  ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  PROCESSING: 'bg-yellow-100 text-yellow-700',
  ERROR: 'bg-red-100 text-red-700',
  CONTINGENCY: 'bg-amber-100 text-amber-700',
  DRAFT: 'bg-gray-100 text-gray-700',
  VOIDED: 'bg-gray-100 text-gray-500',
  SENT: 'bg-blue-100 text-blue-700',
  CONDITIONAL: 'bg-yellow-100 text-yellow-700',
};

const VOIDABLE = ['DRAFT', 'ERROR', 'CONTINGENCY', 'REJECTED'];
const POLLABLE = ['SENT', 'PROCESSING', 'CONTINGENCY'];

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [voiding, setVoiding] = useState(false);
  const [polling, setPolling] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (id) {
      invoices.get(id).then(setInvoice).finally(() => setLoading(false));
    }
  }, [id]);

  const handleVoid = async () => {
    if (!id) return;
    setVoiding(true);
    setActionError('');
    try {
      const updated = await invoices.void(id, voidReason || undefined);
      setInvoice(updated);
      setShowVoidConfirm(false);
      setVoidReason('');
    } catch (e: any) {
      setActionError(e.message || 'Error anulando factura');
    } finally {
      setVoiding(false);
    }
  };

  const handlePoll = async () => {
    if (!id) return;
    setPolling(true);
    setActionError('');
    try {
      const updated = await invoices.poll(id);
      setInvoice(updated);
    } catch (e: any) {
      setActionError(e.message || 'Error consultando estado');
    } finally {
      setPolling(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;
  if (!invoice) return <div className="text-center py-12 text-gray-400">Factura no encontrada</div>;

  const previewUrl = `/api/v1/invoices/${id}/preview`;

  return (
    <div>
      <Link to="/invoices" className="flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 mb-4">
        <ArrowLeft className="w-4 h-4" /> Volver a facturas
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{invoice.encf || 'BORRADOR'}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {invoice.ecfType} · {invoice.company?.businessName} · RNC {invoice.company?.rnc}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[invoice.status] || 'bg-gray-100'}`}>
            {invoice.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-5">
          {/* Buyer */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Comprador</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Nombre:</span> <span className="font-medium">{invoice.buyerName || 'CONSUMIDOR FINAL'}</span></div>
              {invoice.buyerRnc && <div><span className="text-gray-500">RNC:</span> <span className="font-medium">{invoice.buyerRnc}</span></div>}
              {invoice.buyerEmail && <div><span className="text-gray-500">Email:</span> <span className="font-medium">{invoice.buyerEmail}</span></div>}
            </div>
          </div>

          {/* Items */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Items</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">#</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Descripción</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Cant.</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Precio</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">ITBIS</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.lines || []).map((line: any) => (
                  <tr key={line.id} className="border-b border-gray-50">
                    <td className="px-4 py-2.5 text-sm text-gray-400">{line.lineNumber}</td>
                    <td className="px-4 py-2.5 text-sm">{line.description}</td>
                    <td className="px-4 py-2.5 text-sm text-right">{Number(line.quantity)}</td>
                    <td className="px-4 py-2.5 text-sm text-right font-mono">RD${Number(line.unitPrice).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2.5 text-sm text-right font-mono">RD${Number(line.itbisAmount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2.5 text-sm text-right font-mono font-medium">RD${Number(line.subtotal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Totals */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Totales</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-mono">RD${Number(invoice.subtotal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span></div>
              {Number(invoice.totalDiscount) > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Descuento</span><span className="font-mono text-red-600">-RD${Number(invoice.totalDiscount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span></div>
              )}
              <div className="flex justify-between"><span className="text-gray-500">ITBIS</span><span className="font-mono">RD${Number(invoice.totalItbis).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span className="font-bold text-gray-900">Total</span>
                <span className="font-mono font-bold text-brand-600 text-lg">RD${Number(invoice.totalAmount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Detalles</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Moneda</span><span>{invoice.currency}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Pago</span><span>Tipo {invoice.paymentType}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Creada</span><span>{new Date(invoice.createdAt).toLocaleString('es-DO')}</span></div>
              {invoice.trackId && <div className="flex justify-between"><span className="text-gray-500">Track ID</span><span className="font-mono text-xs">{invoice.trackId}</span></div>}
              {invoice.dgiiMessage && <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-600">{invoice.dgiiMessage}</div>}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <h2 className="font-semibold text-gray-900 mb-3">Acciones</h2>

            {/* Error message */}
            {actionError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700 mb-2">
                {actionError}
              </div>
            )}

            {/* PDF */}
            <a
              href={`/api/v1/invoices/${id}/pdf?auth=${getApiKey()}`}
              target="_blank"
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium ${
                invoice.status === 'ACCEPTED' 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              <File className="w-4 h-4" /> 
              {invoice.status === 'ACCEPTED' ? 'Descargar PDF' : 'Ver Borrador (sin validez fiscal)'}
            </a>

            {/* XML */}
            {invoice.hasXml && (
              <a
                href={`/api/v1/invoices/${id}/xml`}
                target="_blank"
                className="flex items-center gap-2 w-full px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
              >
                <Download className="w-4 h-4" /> Descargar XML
              </a>
            )}

            {/* HTML Preview */}
            <a
              href={`${previewUrl}?auth=${getApiKey()}`}
              target="_blank"
              className="flex items-center gap-2 w-full px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
            >
              <Eye className="w-4 h-4" /> Ver HTML Preview
            </a>

            {/* Poll Status */}
            {POLLABLE.includes(invoice.status) && (
              <button
                onClick={handlePoll}
                disabled={polling}
                className="flex items-center gap-2 w-full px-3 py-2 bg-blue-50 rounded-lg text-sm text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${polling ? 'animate-spin' : ''}`} /> 
                {polling ? 'Consultando...' : 'Consultar Estado DGII'}
              </button>
            )}

            {/* Void Invoice */}
            {VOIDABLE.includes(invoice.status) && !showVoidConfirm && (
              <button
                onClick={() => setShowVoidConfirm(true)}
                className="flex items-center gap-2 w-full px-3 py-2 bg-red-50 rounded-lg text-sm text-red-600 hover:bg-red-100"
              >
                <XCircle className="w-4 h-4" /> Anular Factura
              </button>
            )}

            {/* Void Confirmation */}
            {showVoidConfirm && (
              <div className="border border-red-200 rounded-lg p-3 space-y-2 bg-red-50">
                <p className="text-sm font-medium text-red-700">¿Confirmar anulación?</p>
                <input
                  type="text"
                  placeholder="Razón (opcional)"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  className="w-full text-sm border border-red-200 rounded px-2 py-1.5 bg-white"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleVoid}
                    disabled={voiding}
                    className="flex-1 px-3 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    {voiding ? 'Anulando...' : 'Confirmar'}
                  </button>
                  <button
                    onClick={() => { setShowVoidConfirm(false); setVoidReason(''); setActionError(''); }}
                    className="flex-1 px-3 py-1.5 bg-white text-gray-600 rounded text-sm border hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Info for ACCEPTED invoices */}
            {invoice.status === 'ACCEPTED' && (
              <p className="text-xs text-gray-400 px-1">
                Para anular una factura aceptada, emita una Nota de Crédito (E34).
              </p>
            )}

            {invoice.status === 'VOIDED' && (
              <div className="bg-gray-100 rounded-lg p-3 text-xs text-gray-500">
                <XCircle className="w-4 h-4 inline mr-1" /> Esta factura fue anulada
                {invoice.metadata?.voidReason && <span> — {invoice.metadata.voidReason}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
