async function q() {
  const u = 'https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx';
  const r1 = await fetch(u);
  const h = await r1.text();
  const vs = h.match(/id="__VIEWSTATE"[^v]*value="([^"]*)"/);
  const vg = h.match(/id="__VIEWSTATEGENERATOR"[^v]*value="([^"]*)"/);
  const ev = h.match(/id="__EVENTVALIDATION"[^v]*value="([^"]*)"/);
  if (!vs) return console.log('No ViewState found');
  const ck = r1.headers.get('set-cookie') || '';
  const body = new URLSearchParams({
    '__VIEWSTATE': vs[1],
    '__VIEWSTATEGENERATOR': vg ? vg[1] : '',
    '__EVENTVALIDATION': ev ? ev[1] : '',
    'txtRncCed': '131880738',
    'btnBuscarPorRNC': 'Buscar'
  });
  const r2 = await fetch(u, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': ck },
    body: body.toString()
  });
  const h2 = await r2.text();
  const tds = h2.match(/<td[^>]*>([^<]{2,})<\/td>/g);
  if (tds) tds.slice(0, 10).forEach(m => console.log(m.replace(/<[^>]+>/g, '').trim()));
  else console.log('No results. Page length:', h2.length);
}
q().catch(e => console.log('Err:', e.message));
