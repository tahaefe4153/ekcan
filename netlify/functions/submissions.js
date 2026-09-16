// Netlify Function: securely fetches (and can delete) real "arac-talebi" form
// submissions via Netlify's own API, using a token that stays server-side
// (set as an environment variable, never exposed to visitors).
//
// GET  /.netlify/functions/submissions?pass=XXXX            -> list submissions
// POST /.netlify/functions/submissions  { pass, id, action: 'delete' } -> delete one

const FORM_NAME = 'arac-talebi';

exports.handler = async function (event) {
  const token = process.env.NETLIFY_API_TOKEN;
  const siteId = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const adminPass = process.env.ADMIN_PASSWORD;

  if (!token || !siteId || !adminPass) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Sunucu ayarları eksik: NETLIFY_API_TOKEN, SITE_ID veya ADMIN_PASSWORD ortam değişkeni tanımlı değil.' })
    };
  }

  const providedPass = event.httpMethod === 'GET'
    ? (event.queryStringParameters && event.queryStringParameters.pass)
    : (JSON.parse(event.body || '{}').pass);

  if (providedPass !== adminPass) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Yetkisiz.' }) };
  }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    if (event.httpMethod === 'POST') {
      const { id, action } = JSON.parse(event.body || '{}');
      if (action === 'delete' && id) {
        const res = await fetch(`https://api.netlify.com/api/v1/submissions/${id}`, {
          method: 'DELETE',
          headers
        });
        if (!res.ok) {
          const t = await res.text();
          return { statusCode: res.status, body: JSON.stringify({ error: t }) };
        }
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
      }
      return { statusCode: 400, body: JSON.stringify({ error: 'Geçersiz istek.' }) };
    }

    // GET: list submissions for our form
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
    return { statusCode: 200, body: JSON.stringify(subs) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
