const SYSTEM_PROMPT = `You are Consumer Copilot, a calm intake assistant for an Indian consumer grievance prototype.
Return JSON only with: spoken_response (string), extracted_fields (object), routing (string), ui_suggestions (array).
Extract only facts clearly stated. Valid fields: what, who, when, relief. Keep spoken_response to 1-2 short sentences.
Match the user's language (English, Hindi, or Hinglish). Never request Aadhaar, PAN, OTP, passwords, payment details, or other sensitive secrets.
Routing options: National Consumer Helpline, Legal Metrology, FSSAI, GAMA, DGGI, Cyber Crime.`;

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
        max_tokens: 350,
        response_format: {type:'json_object'},
        messages: [{role:'system', content:SYSTEM_PROMPT}, {role:'user', content:prompt}]
      })
      });
      if (upstream.ok) break;
    }
    if (!upstream.ok) return res.status(204).end();
    const payload = await upstream.json();
    const content = payload.choices?.[0]?.message?.content;
    const result = JSON.parse(content);
    if (!result.spoken_response || typeof result.extracted_fields !== 'object') return res.status(204).end();
    return res.status(200).json({
      spoken_response: String(result.spoken_response),
      extracted_fields: result.extracted_fields,
      routing: result.routing ? String(result.routing) : '',
      ui_suggestions: Array.isArray(result.ui_suggestions) ? result.ui_suggestions : []
    });
  } catch {
    return res.status(204).end();
  }
}
