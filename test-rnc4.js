async function test() {
  const rnc = '131880738';
  
  // indexa con param correcto
  try {
    const r = await fetch('https://api.indexa.do/api/rnc?rnc=' + rnc);
    console.log('indexa1:', r.status, await r.text().then(t=>t.substring(0,400)));
  } catch(e) { console.log('indexa1 fail:', e.message); }

  // indexa search
  try {
    const r = await fetch('https://api.indexa.do/api/rnc/search?q=' + rnc);
    console.log('indexa2:', r.status, await r.text().then(t=>t.substring(0,400)));
  } catch(e) { console.log('indexa2 fail:', e.message); }

  // dgii consulta directa
  try {
    const r = await fetch('https://www.dgii.gov.do/herramientas/consultas/Paginas/RNC.aspx');
    console.log('dgii page:', r.status);
  } catch(e) { console.log('dgii fail:', e.message); }

  // megaplus con otro RNC conocido
  try {
    const r = await fetch('https://rnc.megaplus.com.do/api/consulta?rnc=101010232');
    const d = await r.json();
    console.log('megaplus:', JSON.stringify(d).substring(0,400));
  } catch(e) { console.log('megaplus fail:', e.message); }
}
test();
