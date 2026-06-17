import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import CVForm from './CVForm';
import ToolsPanel from './ToolsPanel';
import AiProviderSelector from './AiProviderSelector';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [cvText, setCvText] = useState('');
  const [offerText, setOfferText] = useState('');
  const [results, setResults] = useState({});
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [selectedModel, setSelectedModel] = useState(null);
  const [autoFallback, setAutoFallback] = useState(true);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* En-tête avec titre et boutons */}
        <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
          <header>
            <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              🤖 AI - Optimiseur de candidature
            </h1>
            <p className="mt-2 text-gray-600">
              Connecté en tant que {user?.email}
            </p>
          </header>
          <div className="flex gap-2">
            {user?.is_admin && (
              <button
                onClick={() => navigate('/admin')}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                🔐 Administration
              </button>
            )}
            <button
              onClick={logout}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
            >
              Déconnexion
            </button>
          </div>
        </div>

        {/* Sélecteur de provider IA (remplace ApiKeyInput) */}
        <div className="mb-6">
          <AiProviderSelector
            selectedProvider={selectedProvider}
            selectedModel={selectedModel}
            onProviderChange={setSelectedProvider}
            onModelChange={setSelectedModel}
            autoFallback={autoFallback}
            onFallbackChange={setAutoFallback}
          />
        </div>

        {/* Grille principale : CV + Offre et Outils */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Colonne gauche : Formulaires CV et Offre */}
          <div>
            <CVForm
              cvText={cvText}
              setCvText={setCvText}
              offerText={offerText}
              setOfferText={setOfferText}
            />
          </div>

          {/* Colonne droite : Panneau des outils */}
          <div>
            <ToolsPanel
              cvText={cvText}
              offerText={offerText}
              results={results}
              setResults={setResults}
              selectedProvider={selectedProvider}
              selectedModel={selectedModel}
              autoFallback={autoFallback}
            />
          </div>
        </div>

        {/* Section des résultats générés */}
        {Object.keys(results).length > 0 && (
          <div className="mt-10 bg-white rounded-xl shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              📋 Résultats générés
            </h2>
            <div className="space-y-6">
              {Object.entries(results).map(([tool, content]) => (
                <div key={tool} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                  <h3 className="text-lg font-medium text-indigo-700 mb-2">{tool}</h3>
                  <div className="prose max-w-none whitespace-pre-wrap text-gray-700">
                    {content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message d'aide si aucun résultat */}
        {Object.keys(results).length === 0 && (
          <div className="mt-10 text-center text-gray-500">
            <p className="text-sm">
              💡 Collez votre CV et une offre d'emploi, puis cliquez sur un outil pour générer des résultats.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
