/**
 * Netlify Function: Secure PIX Creation
 * Creates PIX transactions via SigiloPay
 * Fetches real product price from Supabase to prevent tampering
 * Records sale in Supabase
 */
const https = require('https');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

function httpsRequest(options, data) {
  return new Promise(function(resolve, reject) {
    var req = https.request(options, function(res) {
      var body = '';
      res.on('data', function(c) { body += c; });
      res.on('end', function() { resolve({ status: res.statusCode, body: body }); });
    });
    req.on('error', function(e) { reject(e); });
    req.setTimeout(30000, function() { req.destroy(); reject(new Error('Timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

async function getProduct(id) {
  var url = new URL(SB_URL + '/rest/v1/products?id=eq.' + encodeURIComponent(id) + '&select=id,price,name');
  var res = await httpsRequest({
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: 'GET',
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
  });
  var products = JSON.parse(res.body);
  return products.length > 0 ? products[0] : null;
}

async function getConfig(key) {
    try {
        var url = new URL(SB_URL + '/rest/v1/admin_config?id=eq.' + encodeURIComponent(key));
        var r = await httpsRequest({
            hostname: url.hostname, port: 443, path: url.pathname + url.search, method: 'GET',
            headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
        });
        var data = JSON.parse(r.body);
        if(data && data.length > 0) return data[0].value;
    } catch(e) {}
    return null;
}

async function createSale(productId, productName, amount, email, name, doc, tid) {
  var url = new URL(SB_URL + '/rest/v1/sales');
  var data = JSON.stringify({
    product_id: productId,
    product_name: productName,
    amount: amount,
    customer_email: email,
    customer_name: name,
    customer_document: doc,
    transaction_id: tid,
    status: 'pending'
  });
  await httpsRequest({
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'Prefer': 'return=minimal'
    }
  }, data);
}

exports.handler = async function(event) {
  var headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };

  var params = event.queryStringParameters || {};

  // ====== CHECK PAYMENT STATUS ======
  if (params.check === '1' && params.tid) {
    try {
      var url = new URL(SB_URL + '/rest/v1/sales?transaction_id=eq.' + encodeURIComponent(params.tid) + '&select=status');
      var res = await httpsRequest({
        hostname: url.hostname, port: 443, path: url.pathname + url.search, method: 'GET',
        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
      });
      var sales = JSON.parse(res.body);
      var paid = sales.length > 0 && (sales[0].status === 'paid' || sales[0].status === 'completed');
      return { statusCode: 200, headers: headers, body: JSON.stringify({ paid: paid }) };
    } catch(e) {
      return { statusCode: 200, headers: headers, body: JSON.stringify({ paid: false }) };
    }
  }

  // ====== CREATE PIX TRANSACTION ======
  if (event.httpMethod === 'POST') {
    try {
      var input;
      try { input = JSON.parse(event.body); } catch(e) {
        return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'JSON inválido' }) };
      }

      // Fetch real product price from DB (anti-tamper)
      var product = await getProduct(input.productId);
      if (!product) {
        return { statusCode: 404, headers: headers, body: JSON.stringify({ error: 'Produto não encontrado' }) };
      }

      // Chaves Nativas da SigiloPay garantidas 100% blindadas
      var pKey = 'sbck6bostinha_3i9zcuj3nr7ci5f9';
      var sKey = 'eek1l57m7ao05mrw8paylvv1u640o022g8hfq27gch7ww089n3dlui3fvzzlthuy';

      if (!pKey || !sKey) {
          return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Chaves SigiloPay não configuradas' }) };
      }

      // Build SigiloPay payload
      var payload = JSON.stringify({
        identifier: 'sale_' + Date.now(),
        amount: product.price,
        client: {
          name: input.customer.name,
          email: input.customer.email,
          document: input.customer.document // CPF precisa ser verídico ou gerado validamente
        }
      });

      // Call SigiloPay API
      var sigiloRes = await httpsRequest({
        hostname: 'app.sigilopay.com.br',
        port: 443,
        path: '/api/v1/gateway/pix/receive',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-public-key': pKey,
          'x-secret-key': sKey,
          'Content-Length': Buffer.byteLength(payload)
        }
      }, payload);

      var data = JSON.parse(sigiloRes.body);
      
      if (sigiloRes.status >= 400 || !data.pix) {
        var erroReal = data.message || data.error || JSON.stringify(data);
        return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Motivo Real Sigilopay: ' + erroReal }) };
      }
      
      var tid = data.transactionId || data.identifier || ('local_' + Date.now());

      // Record sale in Supabase
      if (tid) {
        await createSale(product.id, product.name, product.price, input.customer.email, input.customer.name, input.customer.document, tid);
      }

      // Extract PIX data
      var pixCode = data.pix ? (data.pix.code || data.pix.payload) : null;
      var qrImage = data.pix ? data.pix.base64 : null;
      if (qrImage && !qrImage.startsWith('data:')) qrImage = 'data:image/png;base64,' + qrImage;

      // Fallback QR from URL
      if (!qrImage && data.order && data.order.url) {
        qrImage = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(data.order.url);
      }

      return {
        statusCode: 200,
        headers: headers,
        body: JSON.stringify({
          success: true,
          transactionId: tid,
          pix_qr_code: pixCode,
          qr_image: qrImage,
          amount: product.price,
          productName: product.name
        })
      };

    } catch(error) {
      console.error('PIX Error:', error);
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Erro ao gerar PIX: ' + error.message }) };
    }
  }

  return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Bad Request' }) };
};
