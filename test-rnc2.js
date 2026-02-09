async function test() {
  // Try DGII contribuyentes API
  const rnc = '131880738';
  
  // Option 1: DGII WCF service
  try {
    const r = await fetch('https://dgii.gov.do/wsMovilDGII/WSMovilDGII.asmx/GetContribuyentes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'value=' + rnc + '&patronBusqueda=0&inicioFilas=1&filaFilas=1&ESSION=VALUE'
    });
    const t = await r.text();
    console.log('WCF:', t.substring(0, 500));
  } catch(e) { console.log('WCF fail:', e.message); }

  // Option 2: DGII Mobile API  
  try {
    const r = await fetch('https://dgii.gov.do/wsMovilDGII/WSMovilDGII.asmx/GetContribuyentes?value=' + rnc + '&patronBusqueda=0&inicioFilas=1&filaFilas=1');
    const t = await r.text();
    console.log('Mobile:', t.substring(0, 500));
  } catch(e) { console.log('Mobile fail:', e.message); }
}
test();
