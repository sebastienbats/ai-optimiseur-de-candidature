import { useState, useEffect } from 'react';
import { api } from '../../services/api';

export default function SmtpConfig() {
  const [config, setConfig] = useState({
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    from: ''
  });
  const [testEmail, setTestEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [hasConfig, setHasConfig] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await api.get('/admin/smtp/config');
      const { pass, ...configData } = response.data;
      setConfig({ ...configData, pass: '' });
      setHasConfig(true);
      setMessage({ type: 'success', text: 'Configuration chargée' });
    } catch (error) {
      if (error.response?.status === 404) {
        setHasConfig(false);
        setMessage({ type: 'info', text: 'Aucune configuration SMTP trouvée' });
      } else {
        console.error('Erreur chargement config:', error);
        setMessage({ type: 'error', text: 'Erreur lors du chargement' });
      }
    }
  };

  const handleSave = async () => {
    const { host, port, secure, user, pass, from } = config;
    
    if (!host || !port || !user || !pass || !from) {
      setMessage({ type: 'error', text: 'Tous les champs sont requis' });
      return;
    }

    setSaving(true);
    try {
      await api.post('/admin/smtp/config', { host, port, secure, user, pass, from });
      setHasConfig(true);
      setMessage({ type: 'success', text: '✅ Configuration sauvegardée avec succès' });
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Erreur lors de la sauvegarde' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const { host, port, secure, user, pass, from } = config;
    
    if (!host || !port || !user || !pass || !from) {
      setMessage({ type: 'error', text: 'Veuillez configurer tous les champs avant de tester' });
      return;
    }

    setTesting(true);
    try {
      await api.post('/admin/smtp/test', {
        host,
        port,
        secure,
        user,
        pass,
        from,
        testEmail: testEmail || undefined
      });
      
      const testMsg = testEmail 
        ? `✅ Email de test envoyé à ${testEmail}` 
        : '✅ Connexion SMTP réussie';
      setMessage({ type: 'success', text: testMsg });
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || '❌ Erreur de connexion SMTP' 
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('⚠️ Supprimer la configuration SMTP ? Cette action est irréversible.')) return;
    
    try {
      await api.delete('/admin/smtp/config');
      setHasConfig(false);
      setConfig({ host: '', port: 587, secure: false, user: '', pass: '', from: '' });
      setMessage({ type: 'success', text: 'Configuration supprimée' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Erreur lors de la suppression' });
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    setMessage({ type: '', text: '' });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            📧 Configuration SMTP
          </h2>
          <div className="flex items-center gap-2">
            {hasConfig && (
              <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                ✅ Configuré
              </span>
            )}
          </div>
        </div>

        {message.text && (
          <div className={`mb-4 px-4 py-3 rounded ${
            message.type === 'success' ? 'bg-green-50 border border-green-400 text-green-700' :
            message.type === 'error' ? 'bg-red-50 border border-red-400 text-red-700' :
            'bg-blue-50 border border-blue-400 text-blue-700'
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Serveur SMTP
            </label>
            <input
              type="text"
              name="host"
              value={config.host}
              onChange={handleChange}
              placeholder="smtp.gmail.com"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Port
            </label>
            <input
              type="number"
              name="port"
              value={config.port}
              onChange={handleChange}
              placeholder="587"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Utilisateur
            </label>
            <input
              type="email"
              name="user"
              value={config.user}
              onChange={handleChange}
              placeholder="votre.email@gmail.com"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mot de passe / Token d'application
            </label>
            <div className="flex gap-2">
              <input
                type={showPassword ? 'text' : 'password'}
                name="pass"
                value={config.pass}
                onChange={handleChange}
                placeholder="••••••••"
                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email d'envoi (From)
            </label>
            <input
              type="email"
              name="from"
              value={config.from}
              onChange={handleChange}
              placeholder="noreply@votredomaine.com"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                name="secure"
                checked={config.secure}
                onChange={handleChange}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">
                Utiliser SSL/TLS (port 465 généralement)
              </span>
            </label>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email de test (optionnel)
            </label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="receveur@test.com (pour envoyer un email de test)"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? '⏳ Sauvegarde...' : '💾 Sauvegarder'}
          </button>
          
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {testing ? '⏳ Test...' : '🔍 Tester la connexion'}
          </button>

          {hasConfig && (
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              🗑️ Supprimer la configuration
            </button>
          )}
        </div>

        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-700 mb-2">📖 Configuration pour les services courants :</h4>
          <div className="space-y-1 text-xs text-gray-600">
            <p><strong>Gmail :</strong> smtp.gmail.com, port 587, STARTTLS</p>
            <p><strong>Outlook :</strong> smtp.office365.com, port 587, STARTTLS</p>
            <p><strong>SendGrid :</strong> smtp.sendgrid.net, port 587, STARTTLS</p>
            <p><strong>Mailgun :</strong> smtp.mailgun.org, port 587, STARTTLS</p>
            <p className="mt-2 text-yellow-600">
              ⚠️ Pour Gmail, utilisez un "Mot de passe d'application" (Paramètres > Sécurité > Mots de passe d'application)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
