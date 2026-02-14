# AUDITORÍA DE CUMPLIMIENTO DGII — Instrucciones para Claude Code

Revisa TODO el código del proyecto ecf-api contra la documentación oficial de DGII.
Compila primero: `npm run build` para confirmar el estado base.

## DOCUMENTACIÓN OFICIAL DE REFERENCIA

### Descripción Técnica de Facturación Electrónica v1.6 (Junio 2023)
URL: https://dgii.gov.do/.../Descripcion-tecnica-de-facturacion-electronica.pdf

### Informe Técnico e-CF v1.0
URL: https://dgii.gov.do/.../Informe%20Técnico%20e-CF%20v1.0.pdf

---

## PUNTOS CRÍTICOS A VERIFICAR

### 1. URLS DE SERVICIOS DGII (Descripción Técnica, sección "Descripción de Servicios Web")

Verifica que `src/xml-builder/ecf-types.ts` y `src/dgii/dgii.service.ts` usen las URLs correctas:

**Ambientes base:**
- TesteCF: `https://ecf.dgii.gov.do/testecf/` (pre-certificación)
- CerteCF: `https://ecf.dgii.gov.do/certecf/` (certificación)
- eCF: `https://ecf.dgii.gov.do/ecf/` (producción)
- FC TesteCF: `https://fc.dgii.gov.do/testecf/` (FC pre-certificación)
- FC eCF: `https://fc.dgii.gov.do/ecf/` (FC producción)

**Endpoints DGII (recursos dentro de cada servicio):**
- Autenticación semilla: `GET /api/autenticacion/semilla` dentro del servicio `autenticacion`
- Validar semilla: `POST /api/autenticacion/validarsemilla` dentro de `autenticacion`
- Recepción e-CF: `POST /api/facturaselectronicas` dentro de `recepcion`
- Recepción FC (<250K): `POST /api/recepcion/ecf` dentro de `recepcionfc`
- Consulta resultado (trackId): `GET /api/consultas/estado?trackid={trackid}` dentro de `consultaresultado`
- Consulta estado e-CF: `GET /api/consultas/estado?rncemisor=...&ncfelectronico=...` dentro de `consultaestado`
- Consulta TrackIds: `GET /api/trackids/consulta?rncemisor=...&encf=...` dentro de `consultatrackids`
- Aprobación comercial: `POST /api/aprobacioncomercial` dentro de `aprobacioncomercial`
- Anulación rangos: `POST /api/operaciones/anularrango` dentro de `anulacionrangos`
- Consulta directorio: `GET /api/consultas/listado` dentro de `consultadirectorio`
- Consulta directorio por RNC: `GET /api/consultas/obtenerdirectorioporrnc?RNC=...`
- Consulta timbre QR: dentro de `consultatimbre`
- Consulta timbre FC QR: dentro de `consultatimbrefc`
- Estatus servicios: `GET /api/estatusservicios/obtenerestatus` en `https://statusecf.dgii.gov.do/`

Verifica que las URL se construyan como: `https://ecf.dgii.gov.do/{ambiente}/{servicio}/api/...`
Ejemplo completo: `https://ecf.dgii.gov.do/testecf/recepcion/api/facturaselectronicas`

**IMPORTANTE:** El endpoint de anulación es `/api/operaciones/anularrango` dentro del servicio `anulacionrangos`, NO `/api/anulacion`.
Verifica que DGII_SERVICES.VOID apunte correctamente.

### 2. AUTENTICACIÓN (Descripción Técnica p.8-10)

Flujo correcto:
1. GET semilla → retorna XML `<SemillaModel><valor>...</valor><fecha>...</fecha></SemillaModel>`
2. Firmar ese XML con certificado digital
3. POST validarsemilla → enviar semilla firmada como multipart/form-data con campo `xml`
4. Respuesta: `{ "token": "...", "expira": "yyyy-MM-ddTHH:mm:ssZ", "expedido": "yyyy-MM-ddTHH:mm:ssZ" }`
5. Token dura 1 hora, usar como `Authorization: Bearer {token}`

Verifica en `src/dgii/dgii.service.ts`:
- Que la semilla se firme (no se envíe sin firmar)
- Que el POST sea multipart/form-data con campo `xml`
- Que el token se parsee correctamente del JSON response
- Que el cache sea menor a 1 hora (55 min es correcto)

### 3. ENVÍO DE e-CF (Descripción Técnica p.11-13)

- Envío estándar: `POST /api/facturaselectronicas` con multipart/form-data campo `xml`
- Respuesta: `{ "trackId": "string", "error": "string", "mensaje": "string" }`
- FC < 250K: `POST /api/recepcion/ecf` en dominio `fc.dgii.gov.do` (NO en `ecf.dgii.gov.do`)
- Respuesta FC: `{ "codigo": 1, "estado": "string", "mensajes": [...], "encf": "string", "secuenciaUtilizada": true }`

Verifica que el servicio use el dominio correcto para FC (fc.dgii.gov.do vs ecf.dgii.gov.do).

### 4. ESTADOS DE RESPUESTA DGII (Descripción Técnica p.20)

- No encontrado: 0
- Aceptado: 1
- Rechazado: 2
- En Proceso: 3
- Aceptado Condicional: 4

Verifica que `DGII_STATUS` en ecf-types.ts tenga estos valores exactos.
Verifica que el mapeo a InvoiceStatus sea correcto en todos los processors y servicios.

### 5. FORMATO XML (Informe Técnico sección 11)

Secciones obligatorias del e-CF:
- A. Encabezado (Obligatorio - todos)
- B. Detalle de bienes o servicios (Obligatorio - todos)
- C. Subtotales informativos (Opcional)
- D. Descuentos o Recargos (Condicional)
- E. Paginación (Opcional)
- F. Información de Referencia (Obligatorio para NC/ND, condicional para otros)
- H. Fecha y Hora de la firma digital (Obligatorio - todos)
- I. Firma Digital (Obligatorio - todos)

Etiquetas madre XML:
- ECF → formato e-CF
- ACECF → Aprobación Comercial
- ARECF → Acuse de Recibo
- ANECF → Anulación de secuencias
- RFCE → Resumen Factura Consumo

Verifica que xml-builder.service.ts use la etiqueta raíz `ECF` (no `<ECF>` con namespace).
Verifica que response-xml-builder.ts use `ARECF` y `ACECF` correctamente.

### 6. ARECF - Acuse de Recibo (Descripción Técnica p.55-56)

Según la documentación, cuando un receptor recibe un e-CF, debe retornar un ARECF firmado.
Formato esperado (de la Descripción Técnica ejemplo p.56):

```xml
<?xml version="1.0" encoding="utf-8"?>
<ARECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <DetalleAcusedeRecibo>
    <Version>1.0</Version>
    <RNCEmisor>131880600</RNCEmisor>
    <RNCComprador>132880600</RNCComprador>
    <eNCF>E310000000001</eNCF>
    <Estado>0</Estado>
    <FechaHoraAcuseRecibo>17-12-2020 11:19:06</FechaHoraAcuseRecibo>
  </DetalleAcusedeRecibo>
</ARECF>
```

De la librería dgii-ecf de GitHub:
- Estado: 0 = "e-CF Recibido", 1 = "e-CF No Recibido"
- Si no recibido, hay códigos: 1=Error especificación, 2=Error Firma Digital, 3=Envío duplicado, 4=RNC Comprador no corresponde

**IMPORTANTE**: El formato de FechaHoraAcuseRecibo es `dd-MM-yyyy HH:mm:ss` según el ejemplo oficial.

Verifica en `src/xml-builder/response-xml-builder.ts`:
- Que use los namespaces xsi y xsd como en el ejemplo
- Que el formato de fecha sea `dd-MM-yyyy HH:mm:ss` (NO ISO)
- Que el campo sea `FechaHoraAcuseRecibo` (exacto)
- Que Estado sea numérico (0 o 1)
- Que NO tenga campo `DetalleValidacion` (no aparece en el ejemplo oficial)

### 7. ACECF - Aprobación Comercial (Descripción Técnica p.28-29, 57-58)

Se envía a DGII vía `POST /api/aprobacioncomercial` con multipart/form-data.
Respuesta DGII: `{ "mensaje": ["string"], "estado": "string", "codigo": "string" }`

Estados:
- Aprobación comercial aprobada: 1
- Aprobación comercial rechazada: 2

Tipos que NO aplican aprobación comercial: 32, 41, 43, 46, 47

Verifica que el ACECF XML siga el formato XSD oficial de DGII.
Verifica que no se permita enviar ACECF para tipos 32, 41, 43, 46, 47.

### 8. ANECF - Anulación Rangos (Descripción Técnica p.30-32)

Endpoint: `POST /api/operaciones/anularrango` dentro de servicio `anulacionrangos`
URL completa: `https://ecf.dgii.gov.do/{ambiente}/anulacionrangos/api/operaciones/anularrango`

Respuesta: `{ "rnc": "string", "codigo": "string", "nombre": "string", "mensajes": ["string"] }`

Verifica que en ecf-types.ts el VOID endpoint apunte a `/api/operaciones/anularrango` y
que la URL base del servicio sea `anulacionrangos` (NO solo `anulacion`).

### 9. FIRMADO XML (Descripción Técnica p.60)

- Protocolo: SHA-256
- Campo "SN" del certificado = RNC/Cédula/Pasaporte del propietario
- preserveWhitespace = false
- Una vez firmado, NO puede alterarse

Verifica en `src/signing/signing.service.ts`:
- Que use SHA-256 (no SHA-1)
- Que la firma no preserve whitespace

### 10. NOMBRE DE ARCHIVOS XML (Descripción Técnica p.59)

Estándar:
- e-CF: `{RNCEmisor}{eNCF}.xml` → ej: `101672919E3100000001.xml`
- ACECF: `{RNCComprador}{eNCF}.xml`
- ARECF: `{RNCComprador}{eNCF}.xml`
- RFCE: `{RNCEmisor}{eNCF}.xml`

Verifica que cuando se envían archivos a DGII, el nombre del archivo siga esta convención.

### 11. ESTRUCTURA e-NCF (Informe Técnico sección 7)

- 13 posiciones alfanuméricas
- E + 2 dígitos tipo + 10 dígitos secuencial
- Vigencia: desde autorización hasta 31 diciembre del año siguiente
- No puede usarse después de vencimiento

Verifica validación de formato en validation.service.ts.

### 12. REGLA DE TOLERANCIA (Informe Técnico sección 12)

- Por línea: ±1 del valor (precio × cantidad)
- Global: ±(número de líneas de detalle)
- Si supera tolerancia → Aceptado Condicional

### 13. REGLA DE REDONDEO (Informe Técnico sección 13)

- Campos estándar: 2 decimales
- PrecioUnitarioItem: hasta 4 decimales
- TipoCambio: hasta 4 decimales
- Subcantidad: hasta 3 decimales
- Tercer decimal >= 5 → redondea arriba, < 5 → mantiene

### 14. CONTINGENCIA (Informe Técnico sección 18)

- Cuando DGII no está disponible, el emisor puede seguir emitiendo
- Debe enviar dentro de 72 horas cuando se restablezca
- Verificar que contingency.service.ts respete el límite de 72 horas

### 15. COMUNICACIÓN EMISOR-RECEPTOR (Descripción Técnica p.52-58)

Los contribuyentes deben exponer estos servicios REST:
- `/fe/autenticacion/api/semilla` (GET) - Retorna semilla XML
- `/fe/autenticacion/api/validacioncertificado` (POST) - Valida semilla firmada
- `/fe/recepcion/api/ecf` (POST) - Recibe e-CF, retorna ARECF firmado
- `/fe/aprobacioncomercial/api/ecf` (POST) - Recibe ACECF

Requisitos generales:
- HTTPS obligatorio
- REST API
- Puertos de red tradicionales
- Servicios no sensitivos a mayúsculas/minúsculas
- Servicios alcanzables por internet, siempre disponibles

Verifica si el proyecto expone estos endpoints de receptor. Si no existen, reportar como gap.

### 16. QR / TIMBRE ELECTRÓNICO (Descripción Técnica p.37-39)

URL QR para e-CF:
```
https://ecf.dgii.gov.do/{ambiente}/consultatimbre?rncemisor={}&rnccomprador={}&encf={}&fechaemision={dd-MM-yyyy}&montototal={}&fechafirma={dd-MM-yyyy HH:mm:ss}&codigoseguridad={}
```

URL QR para FC <250K:
```
https://fc.dgii.gov.do/{ambiente}/consultatimbrefc?rncemisor={}&encf={}&montototal={}&codigoseguridad={}
```

- Código de seguridad = primeros 6 dígitos del hash del SignatureValue
- Versión QR: 8

Verifica que el PDF/RI generator construya el QR con estos parámetros exactos.

### 17. CARACTERES ESPECIALES EN XML (Descripción Técnica p.58-59)

Los siguientes caracteres DEBEN escaparse:
- `"` → `&#34;` o `&#x22;`
- `&` → `&#38;` o `&#x26;` o `&amp;`
- `'` → `&#39;` o `&#x27;` o `&apos;`
- `<` → `&#60;` o `&#x3C;` o `&lt;`
- `>` → `&#62;` o `&#x3E;` o `&gt;`

NO incluir tags vacíos en los XML (provocará rechazo).

Verifica que xml-builder.service.ts escape estos caracteres.
Verifica que no genere tags vacíos.

---

## INSTRUCCIONES DE EJECUCIÓN

1. Primero `npm run build` para confirmar estado base
2. Lee CADA archivo mencionado y compara con la documentación
3. Reporta TODO lo que no coincida con la documentación oficial
4. Clasifica hallazgos como:
   - **CRÍTICO**: Causa rechazo de DGII o falla de certificación
   - **IMPORTANTE**: Podría causar Aceptado Condicional o problemas intermitentes
   - **MENOR**: Buenas prácticas, no bloqueante
5. Para cada hallazgo indica: archivo, línea, qué dice el código vs qué dice DGII
6. NO corrijas nada, solo reporta. Yo decido qué corregir.
