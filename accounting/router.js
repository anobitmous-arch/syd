const express = require('express');
const router = express.Router();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

function pickCategory(raw, allowed) {
  const norm = String(raw || '').toLowerCase().replace(/[^a-z0-9áéíóúñ]/gi, '').trim();
  const hit = allowed.find(a => a.toLowerCase() === norm);
  return hit || null;
}

// POST /accounting/api/categorize  { concept, categories:[{id,name}] } -> { categoryId|null }
router.post('/categorize', async (req, res) => {
  const { concept, categories } = req.body || {};
  if (!concept || !Array.isArray(categories) || !categories.length) {
    return res.status(400).json({ error: 'concept y categories requeridos' });
  }
  const allowedIds = categories.map(c => c.id);
  const list = categories.map(c => `${c.id} (${c.name})`).join(', ');
  const prompt = `Clasifica este gasto bancario en UNA categoría.\nConcepto: "${concept}"\nCategorías válidas (responde SOLO con el id, sin texto extra): ${list}`;
  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 20,
        messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await r.json();
    const answer = data?.choices?.[0]?.message?.content ?? '';
    return res.json({ categoryId: pickCategory(answer, allowedIds) });
  } catch (e) {
    return res.status(502).json({ error: 'IA no disponible', details: e.message });
  }
});

module.exports = router;
module.exports.pickCategory = pickCategory;
