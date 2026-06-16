import { useState, useEffect } from 'react';
import { api } from '../../services/api';

export default function EmailManagement() {
  const [templates, setTemplates] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendToAll, setSendToAll] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchTemplates();
    fetchUsers();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await api.get('/admin/email/templates');
      setTemplates(response.data);
    } catch (error) {
      console.error('Erreur chargement templates:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/admin/users?limit=200');
      setUsers(response.data.users);
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
    }
  };

  const handleTemplateSelect = (templateId) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setMessage(template.message);
      setSelectedTemplate(templateId);
    }
  };

  const handleSendEmail = async () => {
    if (!subject || !message) {
      alert('Veuillez remplir le sujet et le message');
      return;
    }

    if (!sendToAll && selectedUsers.length === 0) {
      alert('Veuillez sélectionner au moins un utilisateur');
      return;
    }

    const count = sendToAll ? users.filter(u => u.is_active).length : selectedUsers.length;
    if (!confirm(`Envoyer l'email à ${count} utilisateur(s) ?`)) {
      return;
    }

    setSending(true);
    try {
      const response = await api.post('/admin/email/send', {
        subject,
        message,
        userIds: selectedUsers,
        sendToAll
      });
      
      alert(`✅ ${response.data.success} emails envoyés avec succès !`);
      setSubject('');
      setMessage('');
      setSelectedUsers([]);
      setSendToAll(false);
      setSelectedTemplate('');
    } catch (error) {
      alert('❌ Erreur lors de l\'envoi des emails');
    } finally {
      setSending(false);
    }
  };

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleAllUsers = () => {
    const filteredUsers = getFilteredUsers();
    const allSelected = filteredUsers.every(u => selectedUsers.includes(u.id));
    if (allSelected) {
      setSelectedUsers(selectedUsers.filter(id => !filteredUsers.some(u => u.id === id)));
    } else {
      setSelectedUsers([...selectedUsers, ...filteredUsers.map(u => u.id)]);
    }
  };

  const getFilteredUsers = () => {
    if (!searchTerm) return users;
    return users.filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase()));
  };

  const filteredUsers = getFilteredUsers();

  return (
    <div className="space-y-6">
      {/* Template selector */}
      <div className="bg-white rounded-lg shadow p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          📝 Modèles prédéfinis
        </label>
        <select
          value={selectedTemplate}
          onChange={(e) => handleTemplateSelect(e.target.value)}
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        >
          <option value="">-- Sélectionner un modèle --</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>

      {/* Email form */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sujet
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="Sujet de l'email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 font-mono text-sm"
              placeholder="Contenu de l'email (utilisez [NOM] pour personnaliser)"
            />
            <p className="mt-1 text-xs text-gray-500">
              💡 Utilisez <code className="bg-gray-100 px-1 py-0.5 rounded">[NOM]</code> pour le nom de l'utilisateur
            </p>
          </div>

          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={sendToAll}
                onChange={(e) => {
                  setSendToAll(e.target.checked);
                  if (e.target.checked) setSelectedUsers([]);
                }}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">📨 Envoyer à tous les utilisateurs actifs</span>
            </label>
          </div>

          {!sendToAll && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Sélectionner les destinataires ({selectedUsers.length} sélectionnés)
                </label>
                <button
                  onClick={toggleAllUsers}
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                >
                  {filteredUsers.every(u => selectedUsers.includes(u.id)) ? 'Désélectionner tout' : 'Sélectionner tout'}
                </button>
              </div>
              
              <div className="mb-2">
                <input
                  type="text"
                  placeholder="🔍 Rechercher un utilisateur..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                />
              </div>
              
              <div className="max-h-60 overflow-y-auto border rounded-md divide-y">
                {filteredUsers.map((user) => (
                  <label key={user.id} className="flex items-center px-3 py-2 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(user.id)}
                      onChange={() => toggleUserSelection(user.id)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mr-3"
                      disabled={!user.is_active}
                    />
                    <span className={`text-sm ${!user.is_active ? 'text-gray-400' : 'text-gray-900'}`}>
                      {user.email}
                    </span>
                    {user.is_admin && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-indigo-100 text-indigo-800 rounded">
                        Admin
                      </span>
                    )}
                    {!user.is_active && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded">
                        Inactif
                      </span>
                    )}
                  </label>
                ))}
                {filteredUsers.length === 0 && (
                  <div className="px-3 py-4 text-center text-gray-500 text-sm">
                    Aucun utilisateur trouvé
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            onClick={handleSendEmail}
            disabled={sending}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {sending ? '⏳ Envoi en cours...' : '📧 Envoyer les emails'}
          </button>
        </div>
      </div>
    </div>
  );
}
