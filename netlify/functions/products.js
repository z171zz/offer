/**
 * Netlify Function: Products API
 * GET: List all active products or fetch by slug/id
 * Uses native https (0 dependencies) to call Supabase REST API
 */
const https = require('https');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

function sbRequest(path, method, body) {
  method = method || 'GET';
  return new Promise(function(resolve, reject) {
    var url = new URL(SB_URL + '/rest/v1' + path);
    var data = body ? JSON.stringify(body) : null;
    var options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

    var req = https.request(options, function(res) {
      var chunks = '';
      res.on('data', function(c) { chunks += c; });
      res.on('end', function() { resolve({ statusCode: res.statusCode, body: chunks }); });
    });
    req.on('error', function(e) { reject(e); });
    if (data) req.write(data);
    req.end();
  });
}

exports.handler = async function(event) {
  var headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };

  try {
    var q = event.queryStringParameters || {};

    // Single product by slug
    if (q.slug) {
      var result = await sbRequest('/products?slug=eq.' + encodeURIComponent(q.slug) + '&select=*');
      var products = JSON.parse(result.body);
      if (!products.length) return { statusCode: 404, headers: headers, body: JSON.stringify({ error: 'Produto não encontrado' }) };
      return { statusCode: 200, headers: headers, body: JSON.stringify(products[0]) };
    }

    // Single product by ID
    if (q.id) {
      var result2 = await sbRequest('/products?id=eq.' + encodeURIComponent(q.id) + '&select=*');
      var products2 = JSON.parse(result2.body);
      if (!products2.length) return { statusCode: 404, headers: headers, body: JSON.stringify({ error: 'Produto não encontrado' }) };
      return { statusCode: 200, headers: headers, body: JSON.stringify(products2[0]) };
    }

    // List all active products
    var result3 = await sbRequest('/products?active=eq.true&select=id,name,slug,price,old_price,stock,images,features&order=created_at.desc');
    return { statusCode: 200, headers: headers, body: result3.body };

  } catch (error) {
    console.error('Products API Error:', error);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Erro interno do servidor', details: error.message }) };
  }
};
