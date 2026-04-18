/**
 * Netlify Function: Secure PIX Creation
 * Fetches product price from DB to prevent tampering.
 * All keys stored in environment variables.
 */
const https = require('https');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

const SIGILO_CONFIG = {
  API_BASE: 'https://app.sigilopay.com.br/api/v1',
  PUBLIC_KEY: process.env.SIGILOPAY_PUBLIC_KEY,
  SECRET_KEY: process.env.SIGILOPAY_SECRET_KEY,
};

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

async function getProduct(id) {
  const url = new URL(`${SB_URL}/rest/v1/products?id=eq.${id}&select=id,price,name`);
  const res = await httpsRequest({
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: 'GET',
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
  });
  const products = JSON.parse(res.body);
  return products.length > 0 ? products[0] : null;
}

async function createSale(productId, amount, email, name, doc, tid) {
  const url = new URL(`${SB_URL}/rest/v1/sales`);
  await httpsRequest({
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: 'POST',
    headers: { 
        'apikey': SB_KEY, 
        'Authorization': `Bearer ${SB_KEY}`, 
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    }
  }, JSON.stringify({
    product_id: productId,
    amount: amount,
    customer_email: email,
    customer_name: name,
    customer_document: doc,
    transaction_id: tid,
    status: 'pending'
  }));
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const params = event.queryStringParameters || {};
  
  // === CHECK STATUS ===
  if (params.check === '1' && params.tid) {
    const url = new URL(`${SB_URL}/rest/v1/sales?transaction_id=eq.${params.tid}&select=status`);
    const res = await httpsRequest({
      hostname: url.hostname, port: 443, path: url.pathname + url.search, method: 'GET',
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
    });
    const sales = JSON.parse(res.body);
    const paid = sales.length > 0 && (sales[0].status === 'paid' || sales[0].status === 'completed');
    return { statusCode: 200, headers, body: JSON.stringify({ paid }) };
  }

  // === CREATE PIX ===
  if (event.httpMethod === 'POST') {
    const input = JSON.parse(event.body);
    const product = await getProduct(input.productId);
    
    if (!product) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Produto inválido' }) };

    // SigiloPay Request
    const payload = JSON.stringify({
      identifier: `sale_${Date.now()}`,
      amount: product.price,
      client: {
        name: input.customer.name,
        email: input.customer.email,
        document: input.customer.document
      }
    });

    const sigiloRes = await httpsRequest({
      hostname: 'app.sigilopay.com.br',
      port: 443,
      path: '/api/v1/gateway/pix/receive',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-public-key': SIGILO_CONFIG.PUBLIC_KEY,
        'x-secret-key': SIGILO_CONFIG.SECRET_KEY,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, payload);

    const data = JSON.parse(sigiloRes.body);
    const tid = data.transactionId || data.identifier;

    if (tid) {
      await createSale(product.id, product.price, input.customer.email, input.customer.name, input.customer.document, tid);
    }

    // Extraction logic (Same as before but secure)
    let pixCode = data.pix ? (data.pix.code || data.pix.payload) : null;
    let qrImage = data.pix ? data.pix.base64 : null;
    if (qrImage && !qrImage.startsWith('data:')) qrImage = 'data:image/png;base64,' + qrImage;

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success: true,
        transactionId: tid,
        pix_qr_code: pixCode,
        qr_image: qrImage || `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data.order.url)}`
      })
    };
  }

  return { statusCode: 400, headers, body: 'Bad Request' };
};
