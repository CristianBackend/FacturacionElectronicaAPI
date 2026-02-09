async function test() {
  const rnc = '131880738';
  
  // Option 1: indexa.do API
  try {
    const r = await fetch('https://api.indexa.do/api/rnc/' + rnc);
    console.log('indexa status:', r.status);
    const t = await r.text();
    console.log('indexa:', t.substring(0, 300));
  } catch(e) { console.log('indexa fail:', e.message); }

  // Option 2: rnc.do
  try {
    const r = await fetch('https://api.rnc.do/' + rnc);
    console.log('rnc.do status:', r.status);
    const t = await r.text();
    console.log('rnc.do:', t.substring(0, 300));
  } catch(e) { console.log('rnc.do fail:', e.message); }

  // Option 3: datos.gob.do
  try {
    const r = await fetch('https://datos.gob.do/api/3/action/datastore_search?resource_id=4f6c11ea-b398-414b-9c42-f012c84a0ce1&q=' + rnc);
    console.log('datos status:', r.status);
    const t = await r.text();
    console.log('datos:', t.substring(0, 400));
  } catch(e) { console.log('datos fail:', e.message); }
}
test();
