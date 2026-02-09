import { DgiiTaxpayerInfo } from '../common/services/rnc-validation.service';

/**
 * ═══════════════════════════════════════════════════════════════
 * ECF TYPE RESOLVER
 * ═══════════════════════════════════════════════════════════════
 *
 * Reglas de detección automática del tipo de e-CF:
 *
 *   Prioridad (primera que coincida gana):
 *   1. Gobierno (RNC con 4 o nombre gobierno)     → E45
 *   2. Régimen Especial (categoría DGII)          → E44
 *   3. Contribuyente activo (default si tiene RNC) → E31
 *
 *   Casos manejados por el emisor (no auto-detectables):
 *   - Consumidor Final (sin RNC)                  → E32
 *   - Exportaciones (comprador extranjero)        → E46
 *   - Pagos al Exterior (servicios no residente)  → E47
 *   - Compras informales (sin RNC proveedor)      → E41
 *   - Gastos menores                              → E43
 *   - Nota de Débito                              → E33
 *   - Nota de Crédito                             → E34
 */

export interface EcfTypeResolution {
  buyerType: string;
  ecfType: string;
  reason: string;
}

interface DetectionRule {
  name: string;
  test: (rnc: string, dgii: DgiiTaxpayerInfo) => boolean;
  result: EcfTypeResolution;
}

// ═══ Keywords gobierno ═══
const GOV_KEYWORDS = [
  'ministerio', 'ayuntamiento', 'gobierno', 'senado',
  'camara de diputados', 'poder judicial', 'poder ejecutivo',
  'procuraduria', 'contraloria', 'tesoreria nacional',
  'superintendencia', 'tribunal', 'policia nacional',
  'fuerzas armadas', 'direccion general', 'instituto nacional',
  'junta central', 'consejo nacional', 'oficina nacional',
  'cuerpo de bomberos', 'defensa civil', 'banco central',
  'junta de aviacion', 'autoridad portuaria',
];

// ═══ Categorías régimen especial ═══
const SPECIAL_CATEGORIES = [
  'zona franca', 'desarrollo fronterizo', 'turismo',
  'proindustria', 'energia renovable', 'cinematografica',
  'exportacion', 'cadena textil', 'sin fines de lucro',
  'educacion', 'salud', 'zona franca industrial',
  'zona franca comercial', 'zona franca especial',
];

const normalize = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ═══════════════════════════════════════
// DETECTION RULES (priority order)
// ═══════════════════════════════════════

const DETECTION_RULES: DetectionRule[] = [
  // ── 1. Gobierno por RNC ──
  // RNC gubernamentales tienen 9 dígitos y empiezan con 4
  {
    name: 'gobierno_by_rnc',
    test: (rnc) => rnc.length === 9 && rnc.startsWith('4'),
    result: {
      buyerType: 'GOBIERNO',
      ecfType: 'E45',
      reason: 'RNC inicia con 4 → Entidad gubernamental',
    },
  },

  // ── 2. Gobierno por nombre ──
  {
    name: 'gobierno_by_name',
    test: (_rnc, dgii) => {
      const name = normalize(dgii.name);
      return GOV_KEYWORDS.some(kw => name.includes(kw));
    },
    result: {
      buyerType: 'GOBIERNO',
      ecfType: 'E45',
      reason: 'Nombre coincide con entidad gubernamental',
    },
  },

  // ── 3. Régimen Especial por categoría DGII ──
  {
    name: 'regimen_especial',
    test: (_rnc, dgii) => {
      const cat = normalize(dgii.category);
      return cat.length > 0 && SPECIAL_CATEGORIES.some(c => cat.includes(c));
    },
    result: {
      buyerType: 'REGIMEN_ESPECIAL',
      ecfType: 'E44',
      reason: 'Categoría DGII indica régimen especial',
    },
  },
];

// ═══════════════════════════════════════
// MAIN RESOLVER
// ═══════════════════════════════════════

/**
 * Auto-detect e-CF type from DGII data.
 * Called when registering a client (buyer) with RNC.
 *
 * Priority: Gobierno > Régimen Especial > Contribuyente
 */
export function resolveEcfType(rnc: string, dgii: DgiiTaxpayerInfo): EcfTypeResolution {
  for (const rule of DETECTION_RULES) {
    if (rule.test(rnc, dgii)) {
      return rule.result;
    }
  }

  // Default: contribuyente activo → E31
  return {
    buyerType: 'CONTRIBUYENTE',
    ecfType: 'E31',
    reason: 'Contribuyente activo → Crédito Fiscal',
  };
}

/**
 * Resolve for consumidor final (no RNC).
 */
export function resolveConsumidorFinal(): EcfTypeResolution {
  return {
    buyerType: 'CONSUMIDOR_FINAL',
    ecfType: 'E32',
    reason: 'Sin RNC → Factura de Consumo',
  };
}

/**
 * All e-CF types with descriptions for frontend display.
 */
export const ECF_TYPE_INFO: Record<string, { label: string; description: string; requiresRnc: boolean; autoDetect: boolean }> = {
  E31: { label: 'Crédito Fiscal', description: 'Contribuyente activo con RNC', requiresRnc: true, autoDetect: true },
  E32: { label: 'Consumo', description: 'Consumidor final, sin datos requeridos', requiresRnc: false, autoDetect: true },
  E33: { label: 'Nota de Débito', description: 'Corrección que aumenta monto original', requiresRnc: true, autoDetect: false },
  E34: { label: 'Nota de Crédito', description: 'Corrección que reduce monto original', requiresRnc: true, autoDetect: false },
  E41: { label: 'Compras', description: 'Comprobante de compras a proveedores informales', requiresRnc: false, autoDetect: false },
  E43: { label: 'Gastos Menores', description: 'Gastos menores no sujetos a retención', requiresRnc: false, autoDetect: false },
  E44: { label: 'Régimen Especial', description: 'Zona franca, exentos, sin fines de lucro', requiresRnc: true, autoDetect: true },
  E45: { label: 'Gubernamental', description: 'Entidades del gobierno', requiresRnc: true, autoDetect: true },
  E46: { label: 'Exportaciones', description: 'Ventas a compradores extranjeros', requiresRnc: false, autoDetect: false },
  E47: { label: 'Pagos al Exterior', description: 'Servicios a no residentes', requiresRnc: false, autoDetect: false },
};
