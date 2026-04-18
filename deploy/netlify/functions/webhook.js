/**
 * Netlify Function: SigiloPay Webhook
 * Updates sale status in Supabase when payment is confirmed.
 */
const https = require('https');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

function httpsRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', (e) => reject(e));
    if (data) req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

  try {
    const data = JSON.parse(event.body);
    const transaction = data.transaction || {};
    const tid = transaction.id || data.identifier;
    const status = transaction.status;

    // Se o status for pago (COMPLETED ou PAID)
    if (status === 'COMPLETED' || status === 'PAID') {
        const url = new URL(`${SB_URL}/rest/v1/sales?transaction_id=eq.${tid}`);
        await httpsRequest({
            hostname: url.hostname,
            port: 443,
            path: url.pathname + url.search,
            method: 'PATCH',
            headers: { 
                'apikey': SB_KEY, 
                'Authorization': `Bearer ${SB_KEY}`,
                'Content-Type': 'application/json'
            }
        }, JSON.stringify({ status: 'paid' }));
        
        console.log(`Sale ${tid} updated to paid`);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };

  } catch (err) {
    console.error('Webhook Error:', err);
    return { statusCode: 500, headers, body: 'Error' };
  }
};
