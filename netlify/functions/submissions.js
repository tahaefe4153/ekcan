// Netlify Function: securely fetches (and can delete) real "arac-talebi" form
// submissions via Netlify's API, and stores per-submission admin metadata
// (durum, verilenFiyat) in Netlify Blobs so it syncs across every device.
//
// GET  /.netlify/functions/submissions?pass=XXXX
//   -> list submissions, each with a merged "meta" object { durum, verilenFiyat }
// POST /.netlify/functions/submissions  { pass, id, action: 'delete' }
//   -> delete one submission (and its stored meta)
// POST /.netlify/functions/submissions  { pass, id, action: 'setMeta', durum?, verilenFiyat? }
//   -> update stored meta for one submission (shared across all devices)

const { getStore } = require('@netlify/blobs');

const FORM_NAME = 'arac-talebi';
const STORE_NAME = 'ekcan-admin-meta';

exports.handler = async function (event) {
  const token = process.env.NETLIFY_API_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const adminPass = process.env.ADMIN_PASSWORD;

  if (!token || !siteId || !adminPass) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Sunucu ayarları eksik: NETLIFY_API_TOKEN, NETLIFY_SITE_ID veya ADMIN_PASSWORD ortam değişkeni tanımlı değil.' })
    };
  }

  let body = {};
  if (event.httpMethod === 'POST') {
    try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
  }

  const providedPass = event.httpMethod === 'GET'
    ? (event.queryStringParameters && event.queryStringParameters.pass)
    : body.pass;

  if (providedPass !== adminPass) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Yetkisiz.' }) };
  }

  const headers = { Authorization: `Bearer ${token}` };
  const store = getStore({ name: STORE_NAME, siteID: siteId, token: token });

  try {
    if (event.httpMethod === 'POST') {
      if (body.action === 'delete' && body.id) {
        const res = await fetch(`https://api.netlify.com/api/v1/submissions/${body.id}`, {
          method: 'DELETE',
          headers
        });
        if (!res.ok) {
          const t = await res.text();
          return { statusCode: res.status, body: JSON.stringify({ error: t }) };
        }
        await store.delete(body.id);
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
      }

      if (body.action === 'setMeta' && body.id) {
        const existing = (await store.get(body.id, { type: 'json' })) || {};
        const updated = { ...existing };
        if (body.durum !== undefined) updated.durum = body.durum;
        if (body.verilenFiyat !== undefined) updated.verilenFiyat = body.verilenFiyat;
        await store.setJSON(body.id, updated);
        return { statusCode: 200, body: JSON.stringify({ ok: true, meta: updated }) };
      }

      return { statusCode: 400, body: JSON.stringify({ error: 'Geçersiz istek.' }) };
    }

    // GET: list submissions for our form, merged with stored meta
    const formsRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/forms`, { headers });
    if (!formsRes.ok) {
      const t = await formsRes.text();
      return { statusCode: formsRes.status, body: JSON.stringify({ error: t }) };
    }
    const forms = await formsRes.json();
    const form = forms.find(f => f.name === FORM_NAME);
    if (!form) {
      return { statusCode: 200, body: JSON.stringify([]) };
    }

    const subsRes = await fetch(`https://api.netlify.com/api/v1/forms/${form.id}/submissions`, { headers });
    if (!subsRes.ok) {
      const t = await subsRes.text();
      return { statusCode: subsRes.status, body: JSON.stringify({ error: t }) };
    }
    const subs = await subsRes.json();

    const withMeta = await Promise.all(subs.map(async (s) => {
      const meta = (await store.get(s.id, { type: 'json' })) || {};
      return { ...s, meta };
    }));

    return { statusCode: 200, body: JSON.stringify(withMeta) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
