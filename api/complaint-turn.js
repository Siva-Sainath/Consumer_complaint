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
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({error:'AI response service is not configured'});
  const { text, current_fields = {} } = req.body || {};
  if (!text) return res.status(400).json({error:'Text is required'});
  const prompt = `Current extracted fields: ${JSON.stringify(current_fields)}\nCitizen message: ${text}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
      {
        method:'POST',
        headers:{'Content-Type':'application/json', 'x-goog-api-key':process.env.GEMINI_API_KEY},
        body:JSON.stringify({
          systemInstruction:{parts:[{text:SYSTEM_PROMPT}]},
          contents:[{role:'user', parts:[{text:`${prompt}\nRespond with valid JSON only.`}]}],
          generationConfig:{
            temperature:0.2,
            maxOutputTokens:1200,
            responseMimeType:'application/json',
            responseSchema:{
              type:'OBJECT',
              properties:{
                spoken_response:{type:'STRING'},
                extracted_fields:{
                  type:'OBJECT',
                  properties:{
                    what:{type:'STRING'}, category:{type:'STRING'}, product_or_service:{type:'STRING'},
                    who:{type:'STRING'}, when:{type:'STRING'}, location:{type:'STRING'},
                    amount_paid:{type:'STRING'}, order_reference:{type:'STRING'}, relief:{type:'STRING'}, evidence:{type:'STRING'}
                  }
                },
                routing:{type:'STRING'},
                ui_suggestions:{type:'ARRAY', items:{type:'STRING'}}
              },
              required:['spoken_response','extracted_fields','routing','ui_suggestions']
            }
          }
        }),
        signal:controller.signal
      }
    );
    clearTimeout(timeout);
    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('Gemini reasoning error', detail);
      return res.status(502).json({error:'AI response service is unavailable'});
    }
    const payload = await upstream.json();
    const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    let result;
    try {
      result = JSON.parse(jsonStart >= 0 && jsonEnd > jsonStart ? cleaned.slice(jsonStart, jsonEnd + 1) : cleaned);
    } catch {
      console.error('Gemini returned invalid JSON', content);
      return res.status(502).json({error:'AI response was not valid JSON'});
    }
    const allowedFields = new Set(['what', 'category', 'product_or_service', 'who', 'when', 'location', 'amount_paid', 'order_reference', 'relief', 'evidence']);
    const extracted_fields = Object.fromEntries(
      Object.entries(result.extracted_fields || {})
        .filter(([key, value]) => allowedFields.has(key) && typeof value === 'string' && value.trim())
        .map(([key, value]) => [key, value.trim()])
    );
    if (!result.spoken_response || typeof result.spoken_response !== 'string') return res.status(502).json({error:'AI response was incomplete'});
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
