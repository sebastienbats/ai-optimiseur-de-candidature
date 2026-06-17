export async function callMistral(prompt, apiKey, model = 'mistral-small-latest') {
  const url = 'https://api.mistral.ai/v1/chat/completions';
  
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
    throw new Error(`Mistral API error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Réponse Mistral vide ou invalide');
  }
  return text;
}
