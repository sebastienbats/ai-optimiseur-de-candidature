import { useState } from 'react';
import { api } from '../services/api';

const tools = [
  { id: 'alarm', name: '🚨 Détecteur de signaux d\'alarme', type: 'alarm' },
  { id: 'rewrite', name: '✍️ Réécriture complète du CV', type: 'full' },
  { id: 'ats', name: '🤖 Anti-ATS & score', type: 'full' },
  { id: 'keywords', name: '🔑 Correcteur de mots-clés', type: 'full' },
  { id: 'motivation', name: '📨 Lettre de motivation (250 mots max)', type: 'full' },
  { id: 'interview', name: '🎤 Préparation à l\'entretien (10 questions)', type: 'full' }
];

const fullToolPrompts = {
  rewrite: (cv, offer) => `Offre d'emploi :\n${offer}\n\nMon CV actuel :\n${cv}\n\nRéécris l'intégralité de mon CV pour ce poste précis. Utilise le vocabulaire de l'offre, mets en avant l'expérience la plus pertinente pour ce poste, et fais en sorte que chaque ligne prouve que je peux faire le job. Une page. Que ça sonne comme moi, pas comme une IA.`,
  ats: (cv, offer) => `Offre d'emploi :\n${offer}\n\nMon CV :\n${cv}\n\nNote mon CV par rapport à cette offre comme le ferait un système ATS. Donne-moi mon pourcentage de correspondance, tous les mots-clés manquants, et tout problème de mise en forme qui entraînerait un rejet automatique. Corrige tout ça pour qu'il passe le filtre et arrive jusqu'à une vraie personne.`,
  keywords: (cv, offer) => `Offre d'emploi :\n${offer}\n\nMon CV :\n${cv}\n\nExtrais chaque mot-clé, compétence et qualification demandés dans l'offre. Vérifie mon CV par rapport à cette liste. Dis-moi lesquels me manquent, lesquels j'ai mais mal formulés, et réécris uniquement ces sections pour qu'elles correspondent.`,
  motivation: (cv, offer) => `Offre d'emploi :\n${offer}\n\nMon CV :\n${cv}\n\nÉcris-moi une lettre de motivation pour ce poste. Commence par pourquoi je veux ce poste précis, pas par des éloges génériques sur l'entreprise. Relie mon expérience la plus forte à leur besoin principal. Moins de 250 mots. Que ça sonne confiant, pas formaté.`,
  interview: (cv, offer) => `Offre d'emploi :\n${offer}\n\nMon CV :\n${cv}\n\nDonne-moi les 10 questions qu'ils sont le plus susceptibles de poser en entretien. Pour chacune, rédige la réponse en utilisant ma véritable expérience tirée de mon CV. Inclus la question piège conçue pour me déstabiliser et comment y répondre.`
};

export default function ToolsPanel({ 
  cvText, 
  offerText, 
  results, 
  setResults,
  selectedProvider = 'gemini',
  selectedModel = null,
  autoFallback = true
}) {
  const [loading, setLoading] = useState(null);

  const handleToolClick = async (tool) => {
    if (!cvText.trim()) {
      alert('Veuillez coller votre CV.');
      return;
    }

    if (tool.type === 'full' && !offerText.trim()) {
      alert('Veuillez coller l\'offre d\'emploi.');
      return;
    }

    setLoading(tool.id);
    
    let prompt;
    if (tool.id === 'alarm') {
      prompt = `Tu as examiné 500 CV aujourd'hui. Tu as 10 secondes pour le mien. Voici mon CV :\n\n${cvText}\n\nDis-moi les 5 choses qui te feraient le zapper immédiatement. Descriptions vagues, résultats manquants, mauvaise mise en forme, tout ce qui crie non. Sois brutal et dis-moi comment corriger chaque point.`;
    } else {
      prompt = fullToolPrompts[tool.id](cvText, offerText);
    }

    try {
      // Utiliser la nouvelle route unifiée
      const response = await api.post('/documents/ai/call', {
        prompt,
        preferredProvider: selectedProvider,
        model: selectedModel || undefined,
        autoFallback
      });
      setResults(prev => ({ ...prev, [tool.name]: response.data.response }));
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.error || 'Erreur lors de l\'appel IA. Vérifiez vos clés API.';
      alert(msg);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-5">
      <h2 className="text-xl font-bold text-gray-800 mb-4">🛠️ Outils d'optimisation</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => handleToolClick(tool)}
            disabled={loading !== null}
            className={`px-4 py-2 rounded-lg text-left font-medium transition-all ${
              loading === tool.id
                ? 'bg-gray-300 cursor-wait'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow'
            }`}
          >
            {loading === tool.id ? (
              <span className="flex items-center gap-2">⏳ Génération...</span>
            ) : (
              tool.name
            )}
          </button>
        ))}
      </div>
      {loading === null && Object.keys(results).length === 0 && (
        <p className="text-sm text-gray-500 mt-4 text-center">
          Cliquez sur un outil – les résultats apparaîtront ci-dessous.
        </p>
      )}
    </div>
  );
}
