const SYSTEM_PROMPT = `You are Consumer Copilot, the first-help intake assistant for India's National Consumer Helpline (NCH).
Your job is to calmly turn an everyday account of a product or service problem into a reviewable consumer grievance.
Return one valid JSON object with exactly these keys: spoken_response, extracted_fields, routing, ui_suggestions.
Valid extracted_fields keys: what, category, product_or_service, who, when, location, amount_paid, order_reference, relief, evidence.
Extract only facts clearly stated in the latest citizen message. Never invent, infer, or overwrite a fact with an empty or uncertain value.
Use current_fields as memory. Never ask for a field already present. Ask at most ONE short, plain-language question for the next useful missing detail.
Keep NCH as the default intake and routing. Suggest a specialist route only when the facts clearly indicate it; do not send ordinary consumer complaints elsewhere.
If the request is clearly outside consumer grievance scope (RTI, court/legal representation, religious matter, foreign authority, emergency, or general advice), explain the boundary calmly and give the next best action. Do not abandon the user.
Start with brief empathy when the person sounds angry or distressed. Do not argue, blame, promise a refund, give legal conclusions, or mirror abusive language.
Match English, Hindi, or Hinglish naturally. Use short spoken sentences suitable for voice.
Never ask for Aadhaar, PAN, OTP, passwords, card numbers, UPI PINs, or other secrets. If the citizen shares one, tell them not to share it and continue without repeating it.
Use only these routing values: National Consumer Helpline, Legal Metrology, FSSAI, GAMA, DGGI, Cyber Crime. For ordinary complaints use National Consumer Helpline.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if (!process.env.GROQ_API_KEY) return res.status(503).json({error:'AI response service is not configured'});
  const { text, current_fields = {} } = req.body || {};
  if (!text) return res.status(400).json({error:'Text is required'});
  const prompt = `Current extracted fields: ${JSON.stringify(current_fields)}\nCitizen message: ${text}`;
  try {
    let upstream;
    for (const model of ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']) {
      upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type':'application/json'},
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 800,
        response_format: {type:'json_object'},
        messages: [{role:'system', content:SYSTEM_PROMPT}, {role:'user', content:prompt}]
      })
      });
      if (upstream.status === 400) {
        upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type':'application/json'},
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: 800,
            messages: [{role:'system', content:SYSTEM_PROMPT}, {role:'user', content:prompt + '\nRespond with valid JSON only.'}]
          })
        });
      }
      if (upstream.ok) break;
    }
    if (!upstream.ok) return res.status(502).json({error:'AI response service is unavailable'});
    const payload = await upstream.json();
    const content = payload.choices?.[0]?.message?.content || '';
    const result = JSON.parse(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim());
    const allowedFields = new Set(['what', 'category', 'product_or_service', 'who', 'when', 'location', 'amount_paid', 'order_reference', 'relief', 'evidence']);
    const extracted_fields = Object.fromEntries(
      Object.entries(result.extracted_fields || {})
        .filter(([key, value]) => allowedFields.has(key) && typeof value === 'string' && value.trim())
        .map(([key, value]) => [key, value.trim()])
    );
    if (!result.spoken_response || typeof result.spoken_response !== 'string') return res.status(204).end();
    return res.status(200).json({
      spoken_response: String(result.spoken_response),
      extracted_fields,
      routing: ['National Consumer Helpline', 'Legal Metrology', 'FSSAI', 'GAMA', 'DGGI', 'Cyber Crime'].includes(result.routing)
        ? result.routing : 'National Consumer Helpline',
      ui_suggestions: Array.isArray(result.ui_suggestions) ? result.ui_suggestions : []
    });
  } catch {
    return res.status(502).json({error:'AI response could not be completed'});
  }
}
