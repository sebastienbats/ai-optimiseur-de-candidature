export default function CVForm({ cvText, setCvText, offerText, setOfferText }) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-md p-5">
        <label className="block text-lg font-semibold text-gray-800 mb-2">
          📄 Votre CV (texte brut)
        </label>
        <textarea
          rows={12}
          value={cvText}
          onChange={(e) => setCvText(e.target.value)}
          placeholder="Collez ici le contenu de votre CV (expériences, compétences, formation...)"
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 font-mono text-sm"
        />
      </div>

      <div className="bg-white rounded-xl shadow-md p-5">
        <label className="block text-lg font-semibold text-gray-800 mb-2">
          💼 Offre d'emploi
        </label>
        <textarea
          rows={8}
          value={offerText}
          onChange={(e) => setOfferText(e.target.value)}
          placeholder="Collez la description du poste, les missions, exigences..."
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 font-mono text-sm"
        />
      </div>
    </div>
  );
}
