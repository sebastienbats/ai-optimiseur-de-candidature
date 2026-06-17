// Service unifié pour les providers IA avec fallback
import { callClaude } from './claudeService.js';
import { callGemini } from './geminiService.js';
import { callGroq } from './groqService.js';
import { callMistral } from './mistralService.js';

// Configuration des providers avec leurs modèles
const PROVIDER_CONFIG = {
  claude: {
    name: 'Claude (Anthropic)',
    models: ['claude-3-sonnet-20240229'],
    defaultModel: 'claude-3-sonnet-20240229',
    free: false,
    requiresApiKey: true
  },
  gemini: {
    name: 'Google Gemini',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    defaultModel: 'gemini-2.5-flash',
    free: true,
    requiresApiKey: true
  },
  groq: {
    name: 'Groq',
    models: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],
    defaultModel: 'llama-3.1-8b-instant',
    free: true,
    requiresApiKey: true
  },
  mistral: {
    name: 'Mistral AI',
    models: ['mistral-small-latest', 'mistral-large-latest', 'codestral-latest'],
    defaultModel: 'mistral-small-latest',
    free: true,
    requiresApiKey: true
  }
};

// Map des fonctions d'appel
const providerCallMap = {
  claude: callClaude,
  gemini: callGemini,
  groq: callGroq,
  mistral: callMistral
};

/**
 * Appelle un provider spécifique avec fallback automatique
 * @param {string} prompt - Le prompt à envoyer
 * @param {string} preferredProvider - Provider préféré (ex: 'gemini')
 * @param {string} model - Modèle spécifique (ex: 'gemini-2.5-flash')
 * @param {object} apiKeys - Objet contenant les clés API par provider
 * @param {boolean} autoFallback - Si true, tente les autres providers en cas d'erreur
 * @returns {Promise<string>} - Réponse du premier provider réussi
 */
export async function callAIWithFallback({
  prompt,
  preferredProvider = 'gemini',
  model = null,
  apiKeys = {},
  autoFallback = true
}) {
  // Liste des providers à essayer (ordre de priorité)
  let providers = [preferredProvider];
  
  if (autoFallback) {
    // Ajouter les autres providers dans un ordre défini (en excluant ceux sans clé)
    const allProviders = ['gemini', 'groq', 'mistral', 'claude'];
    const available = allProviders.filter(p => 
      p !== preferredProvider && apiKeys[p] && apiKeys[p].trim() !== ''
    );
    providers = [...providers, ...available];
  }

  let lastError = null;

  for (const provider of providers) {
    try {
      const callFn = providerCallMap[provider];
      if (!callFn) {
        throw new Error(`Provider ${provider} non supporté`);
      }

      // Récupérer la clé API
      const apiKey = apiKeys[provider];
      if (!apiKey || apiKey.trim() === '') {
        throw new Error(`Clé API manquante pour ${provider}`);
      }

      // Déterminer le modèle à utiliser
      let modelToUse = model;
      if (!modelToUse || !PROVIDER_CONFIG[provider].models.includes(modelToUse)) {
        modelToUse = PROVIDER_CONFIG[provider].defaultModel;
      }

      console.log(`🔄 Appel à ${provider} avec modèle ${modelToUse}`);
      const response = await callFn(prompt, apiKey, modelToUse);
      return response;
    } catch (error) {
      console.warn(`⚠️ Échec du provider ${provider}:`, error.message);
      lastError = error;
      // Continuer vers le prochain provider
    }
  }

  // Si tous les providers ont échoué
  throw new Error(`Tous les providers ont échoué. Dernière erreur: ${lastError?.message || 'Inconnue'}`);
}

// Exporter la configuration pour le frontend
export function getProviderConfig() {
  return PROVIDER_CONFIG;
}

// Exporter la liste des providers disponibles
export function getAvailableProviders() {
  return Object.keys(PROVIDER_CONFIG);
}
