export async function callGroq(prompt, apiKey, model = 'llama-3.1-8b-instant') {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2500,
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Groq API error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Réponse Groq vide ou invalide');
  }
  return text;
}
