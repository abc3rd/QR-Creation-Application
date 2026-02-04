import React, { useState, useEffect } from 'react';
import { Upload, Database, Download, Trash2, Search, Filter, Clock, Code, Calendar, Tag, Star, ExternalLink, Copy, X, LogOut, User as UserIcon } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

const App = () => {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [backups, setBackups] = useState([]);
  const [projects, setProjects] = useState([]);
  const [view, setView] = useState('timeline');
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadStatus, setUploadStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [showAuth, setShowAuth] = useState(!token);
  const [authMode, setAuthMode] = useState('login');

  useEffect(() => {
    if (token) {
      loadData();
      loadUser();
    }
  }, [token]);

  const loadUser = async () => {
    try {
      const response = await fetch(`${API_URL}/api/user`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  const loadData = async () => {
    await Promise.all([loadBackups(), loadProjects()]);
  };

  const loadBackups = async () => {
    try {
      const response = await fetch(`${API_URL}/api/backups`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setBackups(data || []);
      }
    } catch (error) {
      console.error('Error loading backups:', error);
    }
  };

  const loadProjects = async () => {
    try {
      const response = await fetch(`${API_URL}/api/projects`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setProjects(data || []);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');

    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
          setToken(data.token);
          setShowAuth(false);
        }
      } else {
        setErrorMessage('Authentication failed');
      }
    } catch (error) {
      setErrorMessage('Network error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setShowAuth(true);
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploadStatus('uploading');
    setErrorMessage('');
    let successCount = 0;

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(`${API_URL}/api/backups`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        if (response.ok) {
          successCount++;
        }
      } catch (error) {
        console.error('Upload error:', error);
      }
    }

    e.target.value = '';
    setUploadStatus('success');
    setErrorMessage(`Uploaded ${successCount} file(s)`);
    setTimeout(() => {
      setUploadStatus(null);
      setErrorMessage('');
    }, 3000);
    
    await loadData();
  };

  const toggleStar = async (projectId) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      project.starred = !project.starred;
      
      try {
        await fetch(`${API_URL}/api/projects/${projectId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(project)
        });
        await loadProjects();
      } catch (error) {
        console.error('Error starring project:', error);
      }
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setErrorMessage('Code copied!');
    setTimeout(() => setErrorMessage(''), 2000);
  };

  const deleteProject = async (projectId) => {
    if (!confirm('Delete this project?')) return;
    
    try {
      await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      await loadProjects();
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const deleteBackup = async (backupId) => {
    if (!confirm('Delete backup and projects?')) return;
    
    try {
      await fetch(`${API_URL}/api/backups/${backupId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      await loadData();
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  };

  const formatDate = (isoString) => {
    try {
      return new Date(isoString).toLocaleString('en-US', { 
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return 'Unknown';
    }
  };

  const groupByDate = (items) => {
    const grouped = {};
    items.forEach(item => {
      const date = new Date(item.timestamp || item.created_at);
      const key = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });
    return grouped;
  };

  const filteredProjects = projects.filter(p => {
    const matchesFilter = filter === 'all' || p.source === filter || p.type === filter;
    const matchesSearch = !searchTerm || 
      (p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const filteredBackups = backups.filter(b => {
    const matchesFilter = filter === 'all' || b.source === filter;
    const matchesSearch = !searchTerm || 
      (b.name && b.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const sources = ['all', ...new Set([...backups.map(b => b.source), ...projects.map(p => p.source)])];
  const projectTypes = [...new Set(projects.map(p => p.type))];
  
  const stats = {
    projectCount: projects.length,
    total: backups.length,
    size: backups.reduce((sum, b) => sum + (b.size || 0), 0),
    sourceCount: new Set(backups.map(b => b.source)).size
  };

  if (showAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-slate-800/50 backdrop-blur rounded-lg border border-slate-700 p-8 max-w-md w-full">
          <div className="flex items-center gap-3 mb-6">
            <Database className="w-8 h-8 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">Cloud Connect</h1>
          </div>
          <h2 className="text-xl text-white mb-6">{authMode === 'login' ? 'Sign In' : 'Create Account'}</h2>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-slate-400 text-sm mb-2">Email</label>
              <input
                type="email"
                name="email"
                required
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-2">Password</label>
              <input
                type="password"
                name="password"
                required
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-400"
              />
            </div>
            {errorMessage && (
              <div className="text-red-400 text-sm">{errorMessage}</div>
            )}
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white font-semibold transition-colors"
            >
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
          <button
            onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
            className="w-full mt-4 text-slate-400 hover:text-white text-sm transition-colors"
          >
            {authMode === 'login' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Code className="w-10 h-10 text-blue-400" />
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Development Archive
              </h1>
            </div>
            <p className="text-slate-400">Cloud Connect Backup Manager</p>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-2 text-slate-400">
                <UserIcon className="w-5 h-5" />
                <span>{user.email}</span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Projects</p>
                <p className="text-2xl font-bold text-white">{stats.projectCount}</p>
              </div>
              <Code className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Backups</p>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
              </div>
              <Database className="w-8 h-8 text-cyan-400" />
            </div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Size</p>
                <p className="text-2xl font-bold text-white">{formatSize(stats.size)}</p>
              </div>
              <Database className="w-8 h-8 text-purple-400" />
            </div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Sources</p>
                <p className="text-2xl font-bold text-white">{stats.sourceCount}</p>
              </div>
              <Tag className="w-8 h-8 text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700 mb-6">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-600 rounded-lg p-8 cursor-pointer hover:border-blue-400 transition-colors">
            <Upload className="w-12 h-12 text-slate-400 mb-3" />
            <span className="text-slate-300 mb-1">Upload AI Development Exports</span>
            <span className="text-slate-500 text-sm text-center">
              Encrypted storage • Claude, ChatGPT, Grok, Gemini, Base64
            </span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={handleFileUpload}
              accept=".txt,.json,.csv,.sql,.md,.xml"
            />
          </label>
          
          {uploadStatus && (
            <div className={`mt-4 flex items-center gap-2 ${uploadStatus === 'success' ? 'text-green-400' : 'text-blue-400'}`}>
              {uploadStatus === 'uploading' ? <Clock className="w-5 h-5 animate-spin" /> : <span className="text-lg">✓</span>}
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <div className="bg-slate-800/50 backdrop-blur rounded-lg border border-slate-700 mb-6">
          <div className="flex gap-2 p-2">
            <button onClick={() => setView('timeline')} className={`flex-1 px-4 py-2 rounded-lg transition-colors ${view === 'timeline' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'}`}>
              <Calendar className="w-4 h-4 inline mr-2" />Timeline
            </button>
            <button onClick={() => setView('projects')} className={`flex-1 px-4 py-2 rounded-lg transition-colors ${view === 'projects' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'}`}>
              <Code className="w-4 h-4 inline mr-2" />Projects ({stats.projectCount})
            </button>
            <button onClick={() => setView('backups')} className={`flex-1 px-4 py-2 rounded-lg transition-colors ${view === 'backups' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'}`}>
              <Database className="w-4 h-4 inline mr-2" />Backups ({stats.total})
            </button>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur rounded-lg p-4 border border-slate-700 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search projects or backups..."
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-400"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All Sources</option>
              {sources.filter(s => s !== 'all').map(s => <option key={s} value={s}>{s}</option>)}
              {projectTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {view === 'timeline' && (
          <div className="space-y-6">
            {Object.entries(groupByDate(filteredProjects)).length === 0 ? (
              <div className="bg-slate-800/50 backdrop-blur rounded-lg p-12 border border-slate-700 text-center">
                <Calendar className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">Upload backups to start your timeline</p>
              </div>
            ) : (
              Object.entries(groupByDate(filteredProjects)).map(([date, dateProjects]) => (
                <div key={date}>
                  <div className="flex items-center gap-3 mb-4">
                    <Calendar className="w-5 h-5 text-blue-400" />
                    <h2 className="text-xl font-bold text-white">{date}</h2>
                    <div className="flex-1 h-px bg-slate-700"></div>
                  </div>
                  <div className="space-y-3 ml-8">
                    {dateProjects.map((project) => (
                      <div key={project.id} className="bg-slate-800/50 backdrop-blur rounded-lg p-4 border border-slate-700 hover:border-blue-500 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-semibold text-white">{project.name}</h3>
                              <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">{project.type}</span>
                              <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs">{project.source}</span>
                            </div>
                            <p className="text-slate-400 text-sm mb-2">{project.description}</p>
                            <div className="flex gap-2 text-xs text-slate-500">
                              <span>{project.lines_of_code} lines</span>
                              <span>•</span>
                              <span>{project.language}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => toggleStar(project.id)} className={`p-2 rounded-lg ${project.starred ? 'bg-yellow-500' : 'bg-slate-700'}`}>
                              <Star className="w-4 h-4" fill={project.starred ? "currentColor" : "none"} />
                            </button>
                            <button onClick={() => setSelectedProject(project)} className="p-2 bg-blue-500 hover:bg-blue-600 rounded-lg">
                              <ExternalLink className="w-4 h-4" />
                            </button>
                            <button onClick={() => copyCode(project.code)} className="p-2 bg-green-500 hover:bg-green-600 rounded-lg">
                              <Copy className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteProject(project.id)} className="p-2 bg-red-500 hover:bg-red-600 rounded-lg">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {view === 'projects' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProjects.map((project) => (
              <div key={project.id} className="bg-slate-800/50 backdrop-blur rounded-lg p-4 border border-slate-700 hover:border-blue-500 transition-colors">
                <div className="flex justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">{project.name}</h3>
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">{project.type}</span>
                      <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs">{project.source}</span>
                    </div>
                  </div>
                  <button onClick={() => toggleStar(project.id)} className={`p-2 rounded-lg ${project.starred ? 'bg-yellow-500' : 'bg-slate-700'}`}>
                    <Star className="w-4 h-4" fill={project.starred ? "currentColor" : "none"} />
                  </button>
                </div>
                <p className="text-slate-400 text-sm mb-3">{project.description}</p>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedProject(project)} className="flex-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm">
                    View Code
                  </button>
                  <button onClick={() => copyCode(project.code)} className="px-3 py-2 bg-green-500 hover:bg-green-600 rounded-lg">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'backups' && (
          <div className="space-y-3">
            {filteredBackups.map((backup) => (
              <div key={backup.id} className="bg-slate-800/50 backdrop-blur rounded-lg p-4 border border-slate-700">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">{backup.name}</h3>
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">{backup.source}</span>
                    </div>
                    <div className="flex gap-4 text-sm text-slate-400">
                      <span>Size: {formatSize(backup.size)}</span>
                      <span>{formatDate(backup.created_at)}</span>
                    </div>
                  </div>
                  <button onClick={() => deleteBackup(backup.id)} className="p-2 bg-red-500 hover:bg-red-600 rounded-lg">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedProject && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50" onClick={() => setSelectedProject(null)}>
          <div className="bg-slate-900 rounded-lg border border-slate-700 max-w-5xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div>
                <h3 className="text-xl font-bold text-white">{selectedProject.name}</h3>
                <p className="text-sm text-slate-400">{selectedProject.type} • {selectedProject.source}</p>
              </div>
              <button onClick={() => setSelectedProject(null)} className="p-2 hover:bg-slate-800 rounded-lg">
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-120px)]">
              <pre className="bg-slate-950 text-slate-300 p-4 rounded-lg overflow-x-auto text-sm">
                <code>{selectedProject.code}</code>
              </pre>
            </div>
            <div className="flex gap-2 p-4 border-t border-slate-700">
              <button onClick={() => copyCode(selectedProject.code)} className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg">
                <Copy className="w-4 h-4 inline mr-2" />Copy Code
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
