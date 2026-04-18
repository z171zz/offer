/**
 * Netlify Function: Admin API
 * Handles sales tracking, revenue calculation, and product management.
 * Protected by a password check.
 */
const https = require('https');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
const ADMIN_PASS = '2468'; // Hardcoded as requested, but better via env var.

function sbRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SB_URL}/rest/v1${path}`);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });

    req.on('error', (e) => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // AUTH CHECK
  const q = event.queryStringParameters || {};
  if (q.pass !== ADMIN_PASS) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
  }

  try {
    // === GET SALES & STATS ===
    if (event.httpMethod === 'GET' && q.type === 'sales') {
      const result = await sbRequest('/sales?order=created_at.desc');
      const sales = JSON.parse(result.body);
      
      const revenue = sales
        .filter(s => s.status === 'completed' || s.status === 'paid')
        .reduce((acc, s) => acc + parseFloat(s.amount), 0);

      return { statusCode: 200, headers, body: JSON.stringify({ sales, revenue }) };
    }

    // === CREATE PRODUCT ===
    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body);
      if (!payload.name || !payload.price || !payload.slug) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Campos obrigatórios ausentes' }) };
      }
      
      const result = await sbRequest('/products', 'POST', payload);
      return { statusCode: result.statusCode, headers, body: result.body };
    }

    // === DELETE PRODUCT ===
    if (event.httpMethod === 'DELETE' && q.id) {
       // We usually just deactivate instead of hard delete
       const result = await sbRequest(`/products?id=eq.${q.id}`, 'PATCH', { active: false });
       return { statusCode: result.statusCode, headers, body: result.body };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Operação inválida' }) };

  } catch (error) {
    console.error('Admin API Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};
