require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.static('public'));

function cleanLabel(text) {
  if (!text) return null;
  return text.replace(/^(Purpose|Warnings|Uses|Side effects|Adverse reactions)\s*/i, '').trim();
}

function truncateText(text, sentenceCount = 2) {
  const cleaned = cleanLabel(text);
  if (!cleaned) return 'None listed';
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
  return sentences.slice(0, sentenceCount).join(' ').trim();
}

async function getAIFallback(name) {
  const prompt = `Give brief factual information about the medicine "${name}" in this exact JSON format only, no extra text, no markdown code fences, no explanation:
{"genericName": "...", "purpose": "...", "sideEffects": "...", "warnings": "...", "isPrescription": true}
Keep each field to 1-2 short sentences. If you don't recognize this medicine at all, set genericName to "Unknown".`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const cleaned = text.replace(/```json|```/g, '').trim();

    return JSON.parse(cleaned);
  } catch (e) {
    console.error('AI fallback error:', e.message);
    return null;
  }
}

app.get('/api/medicine/:name', async (req, res) => {
  const name = req.params.name;
  const url = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${name}"&limit=1`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const drug = data.results[0];

      let sideEffects = truncateText(drug.adverse_reactions?.[0], 2);
      let sideEffectsSupplemented = false;

      if (sideEffects === 'None listed') {
        const aiSupplement = await getAIFallback(drug.openfda.generic_name?.[0] || name);
        if (aiSupplement && aiSupplement.sideEffects && aiSupplement.genericName !== 'Unknown') {
          sideEffects = aiSupplement.sideEffects;
          sideEffectsSupplemented = true;
        }
      }

      return res.json({
        found: true,
        source: 'FDA',
        name: drug.openfda.brand_name?.[0] || name,
        genericName: drug.openfda.generic_name?.[0] || 'N/A',
        purpose: truncateText(drug.purpose?.[0], 1),
        warnings: truncateText(drug.warnings?.[0], 2),
        sideEffects: sideEffects,
        sideEffectsSupplemented: sideEffectsSupplemented,
        isPrescription: drug.openfda.product_type?.[0]?.includes('HUMAN PRESCRIPTION') || false
      });
    }

    // Not in FDA at all — full AI fallback
    const aiResult = await getAIFallback(name);

    if (!aiResult || aiResult.genericName === 'Unknown') {
      return res.json({ found: false });
    }

    return res.json({
      found: true,
      source: 'AI',
      name: name,
      genericName: aiResult.genericName,
      purpose: aiResult.purpose,
      sideEffects: aiResult.sideEffects,
      warnings: aiResult.warnings,
      isPrescription: aiResult.isPrescription
    });

  } catch (err) {
    console.error('Main route error:', err.message);
    res.status(500).json({ error: 'Failed to fetch medicine data' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));