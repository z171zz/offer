/**
 * Netlify Function: Admin API
 * Protected endpoints for sales tracking and product management
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

async function getConfig(key) {
  try {
    var r = await sbRequest('/admin_config?id=eq.' + encodeURIComponent(key));
    var data = JSON.parse(r.body);
    if(data && data.length > 0) return data[0].value;
  } catch(e) {}
  return null;
}

exports.handler = async function(event) {
  var headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, PATCH, PUT, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };

  var q = event.queryStringParameters || {};
  
  // Auth check
  // Read admin password from config, default 2468
  var adminPassConf = await getConfig('admin_password');
  var ADMIN_PASS = adminPassConf && adminPassConf.password ? adminPassConf.password : '2468';
  
  // Allow login check
  if (event.httpMethod === 'POST' && q.type === 'login') {
      var payload;
      try { payload = JSON.parse(event.body); } catch(e) {}
      if (payload && payload.pass === ADMIN_PASS) {
          return { statusCode: 200, headers: headers, body: JSON.stringify({ success: true }) };
      } else {
          return { statusCode: 401, headers: headers, body: JSON.stringify({ error: 'Senha incorreta' }) };
      }
  }

  if (q.pass !== ADMIN_PASS) {
    return { statusCode: 401, headers: headers, body: JSON.stringify({ error: 'Acesso negado' }) };
  }

  try {
    // ====== GET SALES & STATS ======
    if (event.httpMethod === 'GET' && q.type === 'sales') {
      var result = await sbRequest('/sales?order=created_at.desc&select=*');
      var sales = [];
      try { sales = JSON.parse(result.body); } catch(e) { sales = []; }

      var resultProducts = await sbRequest('/products?select=*');
      var products = [];
      try { products = JSON.parse(resultProducts.body); } catch(e) { products = []; }

      var paidSales = Array.isArray(sales) ? sales.filter(function(s) { return s.status === 'paid' || s.status === 'completed'; }) : [];
      var revenue = paidSales.reduce(function(sum, s) { return sum + parseFloat(s.amount || 0); }, 0);
      var totalPix = sales.length;

      return { 
        statusCode: 200, 
        headers: headers, 
        body: JSON.stringify({ 
          sales: Array.isArray(sales) ? sales : [], 
          revenue: revenue,
          total_paid: paidSales.length,
          total_pix: totalPix,
          total_products: products.length,
          products: products
        }) 
      };
    }

    // ====== GET CONFIG ======
    if (event.httpMethod === 'GET' && q.type === 'config') {
      var sigilo = await getConfig('sigilopay');
      var general = await getConfig('general');
      return { 
          statusCode: 200, 
          headers: headers, 
          body: JSON.stringify({ sigilopay: sigilo || {}, general: general || {} }) 
      };
    }

    // ====== SAVE CONFIG ======
    if (event.httpMethod === 'POST' && q.type === 'config') {
      var payload;
      try { payload = JSON.parse(event.body); } catch(e) {
          return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'JSON inválido' }) };
      }
      
      var configId = payload.id;
      var configValue = payload.value;
      if(!configId || !configValue) return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Faltando id ou value' }) };

      // Upsert
      var upsertData = {
          id: configId,
          value: configValue,
          updated_at: new Date().toISOString()
      };
      
      // Attempt UPSERT using POST with Prefer: resolution=merge-duplicates
      var pUrl = new URL(SB_URL + '/rest/v1/admin_config');
      var pData = JSON.stringify(upsertData);
      var pOptions = {
          hostname: pUrl.hostname, port: 443, path: pUrl.pathname + '?on_conflict=id', method: 'POST',
          headers: {
            'apikey': SB_KEY,
            'Authorization': 'Bearer ' + SB_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=representation',
            'Content-Length': Buffer.byteLength(pData)
          }
      };

      var saveResult = await new Promise((res, rej) => {
        var req = https.request(pOptions, function(r) {
            var chunks = '';
            r.on('data', function(c) { chunks += c; });
            r.on('end', function() { res({ statusCode: r.statusCode, body: chunks }); });
        });
        req.on('error', rej);
        req.write(pData);
        req.end();
      });

      return { statusCode: saveResult.statusCode, headers: headers, body: saveResult.body };
    }

    // ====== CREATE PRODUCT ======
    if (event.httpMethod === 'POST' && !q.type) {
      var payload;
      try { payload = JSON.parse(event.body); } catch(e) {
        return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'JSON inválido' }) };
      }

      if (!payload.name || !payload.price || !payload.slug) {
        return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Campos obrigatórios: name, price, slug' }) };
      }

      var productData = {
        name: payload.name,
        slug: payload.slug,
        price: parseFloat(payload.price),
        old_price: payload.old_price ? parseFloat(payload.old_price) : null,
        stock: parseInt(payload.stock) || 50,
        description: payload.description || '',
        source_html: payload.source_html || null,
        images: payload.images || [],
        features: payload.features || {},
        active: payload.active !== false
      };

      var result2 = await sbRequest('/products', 'POST', productData);
      
      if (result2.statusCode >= 400) {
        var errBody;
        try { errBody = JSON.parse(result2.body); } catch(e) { errBody = { message: result2.body }; }
        var errorMsg = errBody.message || errBody;
        if(typeof errorMsg === 'string' && errorMsg.includes('duplicate key value')) {
            errorMsg = 'Já existe um produto criado com este Slug. O Slug deve ser único para cada produto!';
        }
        return { statusCode: result2.statusCode, headers: headers, body: JSON.stringify({ error: 'Erro ao criar produto', details: errorMsg }) };
      }

      return { statusCode: 201, headers: headers, body: result2.body };
    }

    // ====== DELETE (Hard delete) ======
    if (event.httpMethod === 'DELETE' && q.id) {
      var result3 = await sbRequest('/products?id=eq.' + encodeURIComponent(q.id), 'DELETE');
      
      if(result3.statusCode >= 400) {
         var errStr = result3.body || "";
         if(errStr.includes("foreign key constraint")) {
             return { statusCode: 400, headers: headers, body: JSON.stringify({ error: "Não é possível apagar completamente este produto porque já existem Vendas/PIX atrelados a ele no sistema." }) };
         }
         return { statusCode: 400, headers: headers, body: JSON.stringify({ error: "Erro ao deletar produto." }) };
      }

      return { statusCode: result3.statusCode, headers: headers, body: result3.body };
    }

    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Operação inválida' }) };

  } catch (error) {
    console.error('Admin API Error:', error);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Erro interno', details: error.message }) };
  }
};
