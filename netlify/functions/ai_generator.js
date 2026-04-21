/**
 * Netlify Function: AI Characteristic Generator
 * Proxies to Google Gemini 2.5 Flash API
 * Generates product characteristics JSON from name/description
 */
const https = require('https');

const GEMINI_KEY = process.env.GEMINI_API_KEY;

function geminiRequest(prompt) {
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3
      }
    });

    var options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: '/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_KEY,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    var req = https.request(options, function(res) {
      var body = '';
      res.on('data', function(c) { body += c; });
      res.on('end', function() { resolve({ statusCode: res.statusCode, body: body }); });
    });

    req.on('error', function(e) { reject(e); });
    req.setTimeout(30000, function() { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

exports.handler = async function(event) {
  var headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!GEMINI_KEY) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'GEMINI_API_KEY não configurada. Adicione nas variáveis do Netlify.' }) };
  }

  try {
    var input;
    try { input = JSON.parse(event.body); } catch(e) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'JSON inválido' }) };
    }

    var name = input.name || '';
    var description = input.description || name;

    if (!name) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Campo "name" é obrigatório' }) };
    }

    var prompt = 'Você é um especialista em e-commerce do Mercado Livre.\n' +
      'Baseado no nome e descrição do produto abaixo, gere um JSON com as "Características Principais" técnicas dele.\n' +
      'Siga este formato estritamente:\n' +
      '{\n' +
      '  "Marca": "...",\n' +
      '  "Linha": "...",\n' +
      '  "Modelo": "...",\n' +
      '  "Material": "...",\n' +
      '  "Cor": "...",\n' +
      '  "Peso": "..."\n' +
      '}\n\n' +
      'Retorne APENAS o JSON, use no máximo 8 características relevantes.\n' +
      'Adapte os nomes das características ao tipo de produto.\n\n' +
      'NOME: ' + name + '\n' +
      'DESCRIÇÃO: ' + description;

    var result = await geminiRequest(prompt);
    
    if (result.statusCode !== 200) {
      var errBody;
      try { errBody = JSON.parse(result.body); } catch(e) { errBody = { error: result.body }; }
      console.error('Gemini API error:', result.statusCode, result.body);
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Erro na API Gemini: ' + (errBody.error && errBody.error.message ? errBody.error.message : 'Status ' + result.statusCode) }) };
    }

    var responseData = JSON.parse(result.body);
    var text = responseData.candidates[0].content.parts[0].text;

    // The response should already be JSON since we set responseMimeType
    var features;
    try {
      features = JSON.parse(text);
    } catch(e) {
      // Try to extract JSON from the response
      var match = text.match(/\{[\s\S]*\}/);
      if (match) features = JSON.parse(match[0]);
      else throw new Error('Resposta da IA não contém JSON válido');
    }

    return { statusCode: 200, headers: headers, body: JSON.stringify(features) };

  } catch (error) {
    console.error('AI Generator Error:', error);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Falha ao gerar características: ' + error.message }) };
  }
};
