/**
 * Netlify Function: AI Characterisic Generator
 * Uses Gemini API to generate technical features based on product name/description.
 */
const https = require('https');

const GEMINI_KEY = process.env.GEMINI_API_KEY;

function geminiRequest(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ body }));
    });

    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (!GEMINI_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Gemini API Key não configurada no Netlify' }) };
  }

  try {
    const { name, description } = JSON.parse(event.body);
    
    const prompt = `Você é um especialista em e-commerce do Mercado Livre.
    Baseado no nome e descrição do produto abaixo, gere um JSON com as "Características Principais" técnicas dele.
    Siga este formato estritamente: {"Marca": "...", "Linha": "...", "Modelo": "...", "Característica 4": "..."}.
    Retorne APENAS o JSON, no máximo 6 características.
    
    NOME: ${name}
    DESCRIÇÃO: ${description}`;

    const result = await geminiRequest(prompt);
    const jsonStr = JSON.parse(result.body).candidates[0].content.parts[0].text;
    
    return { statusCode: 200, headers, body: jsonStr };

  } catch (error) {
    console.error('AI Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Falha ao processar característica com IA' }) };
  }
};
