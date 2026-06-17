/**
 * Service Claude (Anthropic)
 * 
 * Provider: Claude (Anthropic)
 * Modèles disponibles: claude-3-sonnet-20240229
 * Documentation: https://docs.anthropic.com/claude/reference
 * 
 * Ce service est utilisé par le système de fallback automatique
 * pour fournir une alternative aux providers gratuits.
 */

export async function callClaude(prompt, apiKey, model = 'claude-3-sonnet-20240229') {
  try {
    // Validation des paramètres
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Le prompt est requis et doit être une chaîne de caractères');
    }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new Error('Clé API Claude requise');
    }

    // Validation du modèle
    const validModels = ['claude-3-sonnet-20240229', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'];
    if (!validModels.includes(model)) {
      console.warn(`⚠️ Modèle ${model} non reconnu, utilisation du modèle par défaut`);
      model = 'claude-3-sonnet-20240229';
    }

    console.log(`🔄 Appel à Claude avec modèle ${model}...`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 2500,
        temperature: 0.7,
        messages: [{ 
          role: 'user', 
          content: prompt 
        }]
      })
    });

    // Gestion des erreurs HTTP
    if (!response.ok) {
      let errorMessage = `Claude API error (HTTP ${response.status})`;
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
        
        // Messages d'erreur spécifiques
        if (response.status === 401) {
          errorMessage = 'Clé API Claude invalide ou expirée. Vérifiez votre clé.';
        } else if (response.status === 429) {
          errorMessage = 'Limite de requêtes Claude atteinte. Veuillez réessayer plus tard.';
        } else if (response.status === 403) {
          errorMessage = 'Accès Claude refusé. Vérifiez vos permissions.';
        } else if (response.status === 402) {
          errorMessage = 'Crédits Claude insuffisants. Veuillez recharger votre compte.';
        } else if (response.status === 500) {
          errorMessage = 'Erreur serveur Claude. Veuillez réessayer.';
        }
      } catch (parseError) {
        // Si le corps de la réponse n'est pas du JSON
        const text = await response.text();
        errorMessage = `Claude API error: ${text || response.statusText}`;
      }
      
      throw new Error(errorMessage);
    }

    // Parsing de la réponse
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      throw new Error('Erreur lors du parsing de la réponse Claude');
    }

    // Validation de la structure de la réponse
    if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
      throw new Error('Réponse Claude invalide: contenu manquant');
    }

    const text = data.content[0]?.text;
    if (!text || typeof text !== 'string') {
      throw new Error('Réponse Claude invalide: texte manquant');
    }

    console.log(`✅ Claude a répondu avec ${text.length} caractères`);

    // Log des métadonnées si disponibles
    if (data.usage) {
      console.log(`📊 Claude usage: ${data.usage.input_tokens} tokens input, ${data.usage.output_tokens} tokens output`);
    }

    return text;
  } catch (error) {
    console.error('❌ Erreur Claude API:', error.message);
    
    // Re-throw avec un message plus clair pour le système de fallback
    if (error.message.includes('Clé API')) {
      throw new Error(`CLAUDE_AUTH_ERROR: ${error.message}`);
    } else if (error.message.includes('Limite')) {
      throw new Error(`CLAUDE_RATE_LIMIT: ${error.message}`);
    } else if (error.message.includes('Crédits')) {
      throw new Error(`CLAUDE_QUOTA_ERROR: ${error.message}`);
    } else {
      throw new Error(`CLAUDE_ERROR: ${error.message}`);
    }
  }
}

/**
 * Fonction utilitaire pour vérifier la disponibilité du service Claude
 * Peut être utilisée par le système de fallback pour tester un provider
 */
export async function checkClaudeAvailability(apiKey) {
  try {
    // Envoyer un prompt très court pour tester
    await callClaude('Hello, respond with "ok" only.', apiKey, 'claude-3-haiku-20240307');
    return { available: true };
  } catch (error) {
    return { 
      available: false, 
      error: error.message 
    };
  }
}

/**
 * Obtenir la liste des modèles Claude disponibles
 */
export function getClaudeModels() {
  return [
    {
      id: 'claude-3-sonnet-20240229',
      name: 'Claude 3 Sonnet',
      description: 'Modèle équilibré, idéal pour la plupart des tâches',
      maxTokens: 200000,
      cost: 'payant'
    },
    {
      id: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      description: 'Modèle le plus puissant, pour les tâches complexes',
      maxTokens: 200000,
      cost: 'payant'
    },
    {
      id: 'claude-3-haiku-20240307',
      name: 'Claude 3 Haiku',
      description: 'Modèle rapide et économique',
      maxTokens: 200000,
      cost: 'payant'
    }
  ];
}

/**
 * Informations de configuration pour le frontend
 */
export const claudeConfig = {
  id: 'claude',
  name: 'Claude (Anthropic)',
  icon: '🧠',
  free: false,
  requiresApiKey: true,
  models: getClaudeModels(),
  defaultModel: 'claude-3-sonnet-20240229',
  docs: 'https://console.anthropic.com/',
  rateLimit: {
    requestsPerMinute: 5,
    tokensPerMinute: 10000
  },
  features: {
    streaming: false,
    vision: false,
    functionCalling: false,
    systemPrompt: true,
    jsonMode: false
  }
};

// Export par défaut pour compatibilité
export default callClaude;
