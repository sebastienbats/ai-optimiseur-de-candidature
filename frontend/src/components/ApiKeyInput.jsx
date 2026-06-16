import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function ApiKeyInput() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    loadApiKey();
  }, []);

  const loadApiKey = async () => {
    try {
      const response = await api.get('/documents/api-key');
      setApiKey(response.data.apiKey);
      setHasKey(true);
      setMessage({ type: 'success', text: 'Clé API chargée' });
    } catch (error) {
      if (error.response?.status === 404) {
        setHasKey(false);
        setMessage({ type: 'info', text: 'Aucune clé API enregistrée' });
      } else {
        console.error('Erreur chargement clé API:', error);
      }
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setMessage({ type: 'error', text: 'Veuillez entrer une clé API' });
      return;
    }

    setSaving(true);
    try {
      await api.post('/documents/api-key', { apiKey });
      setHasKey(true);
      setMessage({ type: 'success', text: 'Clé API sauvegardée avec succès' });
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Erreur lors de la sauvegarde' 
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        🔑 Clé API Anthropic (Claude) – Personnelle et chiffrée
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          type={showKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
          className="flex-1 min-w-[200px] rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={() => setShowKey(!showKey)}
          className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          {showKey ? '🙈' : '👁️'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? '⏳ Sauvegarde...' : '💾 Sauvegarder'}
        </button>
      </div>
      {message.text && (
        <p className={`mt-1 text-sm ${
          message.type === 'error' ? 'text-red-600' : 
          message.type === 'success' ? 'text-green-600' : 
          'text-gray-600'
        }`}>
          {message.text}
        </p>
      )}
      <p className="text-xs text-gray-500 mt-1">
        {hasKey 
          ? '✅ Votre clé est enregistrée et chiffrée' 
          : '⚡ Entrez votre clé pour utiliser les outils Claude'}
      </p>
    </div>
  );
}
