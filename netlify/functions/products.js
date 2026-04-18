/**
 * Netlify Function: Products API
 * Handles listing products for the home page and fetching details for product pages.
 */
const https = require('https');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

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
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const q = event.queryStringParameters || {};
    
    // 1. Get single product by slug
    if (q.slug) {
      const result = await sbRequest(`/products?slug=eq.${q.slug}&select=*`);
      const products = JSON.parse(result.body);
      if (products.length === 0) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Produto não encontrado' }) };
      return { statusCode: 200, headers, body: JSON.stringify(products[0]) };
    }

    // 2. Get single product by ID
    if (q.id) {
        const result = await sbRequest(`/products?id=eq.${q.id}&select=*`);
        const products = JSON.parse(result.body);
        if (products.length === 0) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Produto não encontrado' }) };
        return { statusCode: 200, headers, body: JSON.stringify(products[0]) };
    }

    // 3. List all active products
    const result = await sbRequest('/products?active=eq.true&select=id,name,slug,price,images&order=created_at.desc');
    return { statusCode: 200, headers, body: result.body };

  } catch (error) {
    console.error('API Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};
