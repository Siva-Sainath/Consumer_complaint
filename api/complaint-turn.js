const SYSTEM_PROMPT = `You are Consumer Copilot, a calm intake assistant for an Indian consumer grievance prototype.
Return a JSON object with exactly these keys: spoken_response, extracted_fields, routing, ui_suggestions.
Extract only facts clearly stated in the citizen message. Valid extracted_fields keys are only: what, who, when, relief.
Use current_fields as memory. Never clear an existing field and never ask for a field that is already present.
Ask at most one short question for the next missing field. Acknowledge frustration without blaming anyone. Stay focused on the consumer complaint.
Match English, Hindi, or Hinglish. Never ask for Aadhaar, PAN, OTP, passwords, payment details, or other secrets.
Use only these routing values: National Consumer Helpline, Legal Metrology, FSSAI, GAMA, DGGI, Cyber Crime.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if (!process.env.GROQ_API_KEY) return res.status(204).end();
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
    if (!upstream.ok) return res.status(204).end();
    const payload = await upstream.json();
    const content = payload.choices?.[0]?.message?.content || '';
    const result = JSON.parse(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim());
    const allowedFields = new Set(['what', 'who', 'when', 'relief']);
    const extracted_fields = Object.fromEntries(
      Object.entries(result.extracted_fields || {})
        .filter(([key, value]) => allowedFields.has(key) && typeof value === 'string' && value.trim())
        .map(([key, value]) => [key, value.trim()])
    );
    if (!result.spoken_response || typeof result.spoken_response !== 'string') return res.status(204).end();
    return res.status(200).json({
      spoken_response: String(result.spoken_response),
      extracted_fields,
      routing: result.routing ? String(result.routing) : '',
      ui_suggestions: Array.isArray(result.ui_suggestions) ? result.ui_suggestions : []
    });
  } catch {
    return res.status(204).end();
  }
}
