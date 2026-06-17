import { useState, useEffect } from 'react';
import { api } from '../services/api';

const PROVIDER_INFO = {
  claude: {
    name: 'Claude (Anthropic)',
    icon: '🧠',
    models: ['claude-3-sonnet-20240229'],
    free: false,
    requiresKey: true,
    docs: 'https://console.anthropic.com/'
  },
  gemini: {
    name: 'Google Gemini',
    icon: '🌟',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    free: true,
    requiresKey: true,
    docs: 'https://ai.google.dev/'
  },
  groq: {
    name: 'Groq',
    icon: '⚡',
    models: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],
    free: true,
    requiresKey: true,
    docs: 'https://console.groq.com/'
  },
  mistral: {
    name: 'Mistral AI',
    icon: '🌀',
    models: ['mistral-small-latest', 'mistral-large-latest', 'codestral-latest'],
    free: true,
    requiresKey: true,
    docs: 'https://console.mistral.ai/'
  }
};

export default function AiProviderSelector({ 
  selectedProvider = 'gemini',
  selectedModel = null,
  onProviderChange,
  onModelChange,
  onKeysChange,
  apiKeys = {},
  autoFallback = true,
  onFallbackChange
}) {
  const [providersWithKeys, setProvidersWithKeys] = useState({});
  const [expanded, setExpanded] = useState({});
  const [tempKeys, setTempKeys] = useState({});
  const [saving, setSaving] = useState({});

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    try {
      const response = await api.get('/documents/provider-keys');
      setTempKeys(response.data.keys || {});
      setProvidersWithKeys(response.data.keys || {});
    } catch (error) {
      console.error('Erreur chargement clés:', error);
    }
  };

  const handleSaveKey = async (provider) => {
    const key = tempKeys[provider];
    if (!key || key.trim() === '') {
      alert('Veuillez entrer une clé API valide');
      return;
    }

    setSaving(prev => ({ ...prev, [provider]: true }));
    try {
      await api.post('/documents/provider-keys', { provider, apiKey: key });
      setProvidersWithKeys(prev => ({ ...prev, [provider]: key }));
      if (onKeysChange) onKeysChange({ ...providersWithKeys, [provider]: key });
      alert(`✅ Clé pour ${PROVIDER_INFO[provider].name} sauvegardée`);
    } catch (error) {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(prev => ({ ...prev, [provider]: false }));
    }
  };

  const toggleExpand = (provider) => {
    setExpanded(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  const handleKeyChange = (provider, value) => {
    setTempKeys(prev => ({ ...prev, [provider]: value }));
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">⚙️ Configuration IA</h3>
        <label className="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={autoFallback}
            onChange={(e) => onFallbackChange && onFallbackChange(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-gray-600">Fallback automatique</span>
        </label>
      </div>

      {/* Sélecteur de provider */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {Object.entries(PROVIDER_INFO).map(([id, info]) => {
          const hasKey = !!providersWithKeys[id];
          const isSelected = selectedProvider === id;
          return (
            <button
              key={id}
              onClick={() => onProviderChange && onProviderChange(id)}
              className={`p-2 rounded-lg border text-center transition-all ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 hover:border-gray-300'
              } ${hasKey ? 'border-l-4 border-l-green-500' : ''}`}
            >
              <div className="text-lg">{info.icon}</div>
              <div className="text-xs font-medium truncate">{info.name}</div>
              {hasKey && <div className="text-[10px] text-green-600">✅</div>}
            </button>
          );
        })}
      </div>

      {/* Modèles pour le provider sélectionné */}
      {selectedProvider && PROVIDER_INFO[selectedProvider] && (
        <div className="mt-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">Modèle</label>
          <select
            value={selectedModel || PROVIDER_INFO[selectedProvider].models[0]}
            onChange={(e) => onModelChange && onModelChange(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
          >
            {PROVIDER_INFO[selectedProvider].models.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </div>
      )}

      {/* Gestion des clés API */}
      <div className="border-t pt-3 mt-2">
        <button
          onClick={() => toggleExpand('keys')}
          className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
        >
          {expanded.keys ? '▼' : '▶'} Gérer les clés API
        </button>

        {expanded.keys && (
          <div className="mt-2 space-y-3">
            {Object.entries(PROVIDER_INFO).map(([id, info]) => {
              const hasKey = !!providersWithKeys[id];
              const keyValue = tempKeys[id] || '';
              return (
                <div key={id} className="flex flex-wrap items-center gap-2 bg-gray-50 p-2 rounded">
                  <span className="text-sm font-medium w-28">{info.icon} {info.name}</span>
                  <input
                    type="password"
                    value={keyValue}
                    onChange={(e) => handleKeyChange(id, e.target.value)}
                    placeholder={hasKey ? '••••••••' : 'Entrez votre clé API'}
                    className="flex-1 min-w-[150px] rounded border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                  <button
                    onClick={() => handleSaveKey(id)}
                    disabled={saving[id]}
                    className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving[id] ? '⏳' : hasKey ? '🔄 Mettre à jour' : '💾 Sauvegarder'}
                  </button>
                  {info.free && (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">Gratuit</span>
                  )}
                  <a
                    href={info.docs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline"
                  >
                    🔗
                  </a>
                </div>
              );
            })}
            <p className="text-xs text-gray-500 mt-1">
              💡 Les clés sont chiffrées et stockées de manière sécurisée.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
