import * as data from './data.js';
import { previewContent } from './entry.js';

let isAuthenticated = false;
let editingId = null;

export function initAdmin() {
  // Login
  document.getElementById('admin-login-btn').addEventListener('click', handleLogin);
  document.getElementById('admin-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  // Logout
  document.getElementById('admin-logout-btn').addEventListener('click', () => {
    isAuthenticated = false;
    sessionStorage.removeItem('uiu_admin_auth');
    document.getElementById('admin-dashboard').classList.add('hidden');
    document.getElementById('admin-login').classList.remove('hidden');
    document.getElementById('admin-password').value = '';
  });

  // New entry
  document.getElementById('admin-new-btn').addEventListener('click', () => {
    editingId = null;
    clearEditor();
    document.getElementById('editor-title').textContent = 'New Entry';
    document.getElementById('admin-editor').classList.remove('hidden');
    document.getElementById('editor-entry-title').focus();
  });

  // Editor form
  document.getElementById('editor-form').addEventListener('submit', handleSave);
  document.getElementById('editor-cancel').addEventListener('click', () => {
    document.getElementById('admin-editor').classList.add('hidden');
    editingId = null;
  });

  // Editor tabs (write/preview)
  document.querySelectorAll('.editor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.tab;
      document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const textarea = document.getElementById('editor-content');
      const preview = document.getElementById('editor-preview');

      if (mode === 'write') {
        textarea.classList.remove('hidden');
        preview.classList.add('hidden');
      } else {
        textarea.classList.add('hidden');
        preview.classList.remove('hidden');
        preview.innerHTML = previewContent(textarea.value);
      }
    });
  });

  // Export
  document.getElementById('admin-export-btn').addEventListener('click', handleExport);

  // Import
  document.getElementById('admin-import-btn').addEventListener('click', () => {
    document.getElementById('admin-import-file').click();
  });
  document.getElementById('admin-import-file').addEventListener('change', handleImport);

  // Filter
  document.getElementById('admin-filter-input').addEventListener('input', renderEntryList);

  // Format toggle for email fields
  document.getElementById('editor-format').addEventListener('change', () => {
    const fmt = document.getElementById('editor-format').value;
    document.getElementById('email-fields').classList.toggle('hidden', fmt !== 'email');
  });

  // User management
  document.getElementById('add-user-btn').addEventListener('click', handleAddUser);

  // Password setup modal
  document.getElementById('setup-save-btn').addEventListener('click', handlePasswordSetup);
  document.getElementById('setup-password-confirm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handlePasswordSetup();
  });

  // GitHub deploy
  document.getElementById('gh-save-config').addEventListener('click', () => {
    const token = document.getElementById('gh-token').value.trim();
    const repo = document.getElementById('gh-repo').value.trim();
    if (!token || !repo) { alert('Token and repo are required'); return; }
    data.setGitHubConfig(token, repo);
    updateGHStatus();
  });

  document.getElementById('gh-deploy-btn').addEventListener('click', handleDeploy);

  // Check if already authenticated this session
  if (sessionStorage.getItem('uiu_admin_auth') === 'true') {
    isAuthenticated = true;
  }
}

export function showAdmin() {
  if (data.isFirstRun()) {
    document.getElementById('password-setup-modal').classList.remove('hidden');
    return;
  }

  if (isAuthenticated) {
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    renderEntryList();
    renderStats();
    renderUsers();
    updateGHStatus();
  } else {
    document.getElementById('admin-login').classList.remove('hidden');
    document.getElementById('admin-dashboard').classList.add('hidden');
    document.getElementById('admin-password').value = '';
    setTimeout(() => document.getElementById('admin-password').focus(), 100);
  }
}

async function handleLogin() {
  const pw = document.getElementById('admin-password').value;
  const errorEl = document.getElementById('admin-login-error');

  if (!pw) {
    errorEl.textContent = 'PASSWORD REQUIRED';
    errorEl.classList.remove('hidden');
    return;
  }

  const valid = await data.verifyAdmin(pw);
  if (valid) {
    isAuthenticated = true;
    sessionStorage.setItem('uiu_admin_auth', 'true');
    errorEl.classList.add('hidden');
    showAdmin();
  } else {
    errorEl.textContent = 'ACCESS DENIED — INVALID CREDENTIALS';
    errorEl.classList.remove('hidden');
    document.getElementById('admin-password').value = '';
  }
}

async function handlePasswordSetup() {
  const pw = document.getElementById('setup-password').value;
  const confirm = document.getElementById('setup-password-confirm').value;
  const errorEl = document.getElementById('setup-error');

  if (!pw || pw.length < 3) {
    errorEl.textContent = 'Password must be at least 3 characters';
    errorEl.classList.remove('hidden');
    return;
  }

  if (pw !== confirm) {
    errorEl.textContent = 'Passwords do not match';
    errorEl.classList.remove('hidden');
    return;
  }

  await data.setAdminPassword(pw);
  isAuthenticated = true;
  sessionStorage.setItem('uiu_admin_auth', 'true');

  document.getElementById('password-setup-modal').classList.add('hidden');
  showAdmin();
}

function handleSave(e) {
  e.preventDefault();

  const entryData = {
    id: document.getElementById('editor-id').value.trim(),
    title: document.getElementById('editor-entry-title').value.trim(),
    type: document.getElementById('editor-type').value,
    format: document.getElementById('editor-format').value,
    classification: document.getElementById('editor-classification').value,
    date: document.getElementById('editor-date').value,
    tags: document.getElementById('editor-tags').value
      .split(',')
      .map(t => t.trim())
      .filter(Boolean),
    content: document.getElementById('editor-content').value,
    image: document.getElementById('editor-image').value.trim() || undefined,
    hidden: document.getElementById('editor-hidden').checked || undefined,
    meta: {
      status: document.getElementById('editor-status').value.trim(),
      handler: document.getElementById('editor-handler').value.trim(),
      from: document.getElementById('editor-from').value.trim(),
      to: document.getElementById('editor-to').value.trim(),
      cc: document.getElementById('editor-cc').value.trim()
    }
  };

  // Clean empty meta
  if (!entryData.meta.status) delete entryData.meta.status;
  if (!entryData.meta.handler) delete entryData.meta.handler;
  if (!entryData.meta.from) delete entryData.meta.from;
  if (!entryData.meta.to) delete entryData.meta.to;
  if (!entryData.meta.cc) delete entryData.meta.cc;
  if (Object.keys(entryData.meta).length === 0) delete entryData.meta;

  if (!entryData.title) {
    alert('Title is required');
    return;
  }

  if (editingId) {
    data.update(editingId, entryData);
  } else {
    data.create(entryData);
  }

  document.getElementById('admin-editor').classList.add('hidden');
  editingId = null;
  renderEntryList();
  renderStats();
}

function editEntry(id) {
  const entry = data.getById(id);
  if (!entry) return;

  editingId = id;
  document.getElementById('editor-title').textContent = 'Edit Entry';
  document.getElementById('editor-id').value = entry.id;
  document.getElementById('editor-entry-title').value = entry.title;
  document.getElementById('editor-type').value = entry.type;
  document.getElementById('editor-format').value = entry.format || 'dossier';
  document.getElementById('editor-classification').value = entry.classification;
  document.getElementById('editor-date').value = entry.date || '';
  document.getElementById('editor-tags').value = (entry.tags || []).join(', ');
  document.getElementById('editor-content').value = entry.content || '';
  document.getElementById('editor-status').value = entry.meta?.status || '';
  document.getElementById('editor-handler').value = entry.meta?.handler || '';
  document.getElementById('editor-image').value = entry.image || '';
  document.getElementById('editor-hidden').checked = !!entry.hidden;
  document.getElementById('editor-from').value = entry.meta?.from || '';
  document.getElementById('editor-to').value = entry.meta?.to || '';
  document.getElementById('editor-cc').value = entry.meta?.cc || '';

  // Show/hide email fields
  document.getElementById('email-fields').classList.toggle('hidden', (entry.format || 'dossier') !== 'email');

  // Reset to write tab
  document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.editor-tab[data-tab="write"]').classList.add('active');
  document.getElementById('editor-content').classList.remove('hidden');
  document.getElementById('editor-preview').classList.add('hidden');

  document.getElementById('admin-editor').classList.remove('hidden');
  document.getElementById('editor-entry-title').focus();
}

function deleteEntry(id) {
  const entry = data.getById(id);
  if (!entry) return;

  // Create confirmation overlay
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <p>Delete entry <strong>"${escapeHtml(entry.title)}"</strong>?<br>This action cannot be undone.</p>
      <div class="confirm-actions">
        <button class="btn btn-secondary" id="confirm-no">Cancel</button>
        <button class="btn btn-danger" id="confirm-yes">Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#confirm-no').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#confirm-yes').addEventListener('click', () => {
    data.remove(id);
    overlay.remove();
    if (editingId === id) {
      document.getElementById('admin-editor').classList.add('hidden');
      editingId = null;
    }
    renderEntryList();
    renderStats();
  });
}

function renderEntryList() {
  const filter = document.getElementById('admin-filter-input').value.toLowerCase().trim();
  let entries = data.getAll();

  if (filter) {
    entries = entries.filter(e =>
      e.title.toLowerCase().includes(filter) ||
      e.id.toLowerCase().includes(filter) ||
      e.type.toLowerCase().includes(filter) ||
      (e.tags && e.tags.some(t => t.toLowerCase().includes(filter)))
    );
  }

  // Sort by modified date, newest first
  entries.sort((a, b) => (b.modified || '').localeCompare(a.modified || ''));

  const list = document.getElementById('admin-entry-list');
  if (entries.length === 0) {
    list.innerHTML = `<div class="no-results"><div class="no-results-title">${filter ? 'No matching entries' : 'No entries yet'}</div></div>`;
    return;
  }

  list.innerHTML = entries.map(e => `
    <div class="admin-entry-item">
      <span class="admin-entry-id">${escapeHtml(e.id)}</span>
      <span class="admin-entry-title">${escapeHtml(e.title)}</span>
      <span class="badge badge-${e.type}">${e.type}</span>
      ${e.hidden ? '<span class="badge-hidden">HIDDEN</span>' : ''}
      <div class="admin-entry-actions">
        <button class="btn btn-sm btn-secondary admin-edit-btn" data-id="${e.id}">Edit</button>
        <button class="btn btn-sm btn-danger admin-delete-btn" data-id="${e.id}">Del</button>
      </div>
    </div>
  `).join('');

  // Bind actions
  list.querySelectorAll('.admin-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => editEntry(btn.dataset.id));
  });
  list.querySelectorAll('.admin-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteEntry(btn.dataset.id));
  });
}

function renderStats() {
  const counts = data.getTypeCounts();
  const total = data.getEntryCount();
  const statsEl = document.getElementById('admin-stats');

  let html = `<span>Total: <span class="admin-stat-value">${total}</span></span>`;
  for (const [type, count] of Object.entries(counts)) {
    html += `<span>${type}: <span class="admin-stat-value">${count}</span></span>`;
  }
  statsEl.innerHTML = html;
}

function handleExport() {
  const json = data.exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().split('T')[0];
  a.download = 'database.json';
  a.click();
  URL.revokeObjectURL(url);
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      data.importJSON(reader.result, 'replace');
      renderEntryList();
      renderStats();
      alert('Database imported successfully.');
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);

  // Reset file input
  e.target.value = '';
}

function handleAddUser() {
  const username = document.getElementById('new-username').value.trim();
  const password = document.getElementById('new-user-password').value.trim();
  const displayName = document.getElementById('new-displayname').value.trim();
  const clearance = document.getElementById('new-user-clearance').value;

  if (!username || !password) {
    alert('Username and password are required');
    return;
  }

  try {
    data.addUser(username, password, displayName, clearance);
    document.getElementById('new-username').value = '';
    document.getElementById('new-user-password').value = '';
    document.getElementById('new-displayname').value = '';
    document.getElementById('new-user-clearance').value = '2';
    renderUsers();
  } catch (err) {
    alert(err.message);
  }
}

function renderUsers() {
  const users = data.getUsers();
  const list = document.getElementById('user-list');

  if (users.length === 0) {
    list.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted); padding:8px 0;">No users created yet. Players won\'t be able to log in.</div>';
    return;
  }

  list.innerHTML = users.map(u => `
    <div class="user-item">
      <span class="user-item-name">${escapeHtml(u.username)}</span>
      <span class="user-item-pass">${escapeHtml(u.password)}</span>
      <span class="user-item-display">${escapeHtml(u.displayName || '')}</span>
      <span class="user-item-clearance">LVL ${u.clearance || 1}</span>
      <button class="btn btn-sm btn-danger user-delete-btn" data-username="${escapeHtml(u.username)}">Del</button>
    </div>
  `).join('');

  list.querySelectorAll('.user-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      data.removeUser(btn.dataset.username);
      renderUsers();
    });
  });
}

function updateGHStatus() {
  const { token, repo } = data.getGitHubConfig();
  const statusEl = document.getElementById('gh-status');
  if (token && repo) {
    statusEl.innerHTML = `Connected to <strong>${escapeHtml(repo)}</strong>`;
    statusEl.style.color = 'var(--accent-green)';
    document.getElementById('gh-token').value = '••••••••';
    document.getElementById('gh-repo').value = repo;
  } else {
    statusEl.textContent = 'Not configured';
    statusEl.style.color = 'var(--text-muted)';
  }
}

async function handleDeploy() {
  const btn = document.getElementById('gh-deploy-btn');
  const statusEl = document.getElementById('gh-status');
  const { token, repo } = data.getGitHubConfig();

  if (!token || !repo) {
    alert('Configure GitHub token and repo first');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Deploying...';
  statusEl.textContent = 'Pushing to GitHub...';
  statusEl.style.color = 'var(--accent-gold)';

  try {
    await data.deployToGitHub();
    statusEl.innerHTML = `Deployed to <strong>${escapeHtml(repo)}</strong> — ${new Date().toLocaleTimeString()}`;
    statusEl.style.color = 'var(--accent-green)';
    btn.textContent = 'Deployed!';
    setTimeout(() => { btn.textContent = 'Deploy to GitHub'; btn.disabled = false; }, 2000);
  } catch (err) {
    statusEl.textContent = 'Deploy failed: ' + err.message;
    statusEl.style.color = 'var(--accent-red)';
    btn.textContent = 'Deploy to GitHub';
    btn.disabled = false;
  }
}

function clearEditor() {
  document.getElementById('editor-id').value = '';
  document.getElementById('editor-entry-title').value = '';
  document.getElementById('editor-type').value = 'person';
  document.getElementById('editor-format').value = 'dossier';
  document.getElementById('editor-classification').value = 'CONFIDENTIAL';
  document.getElementById('editor-date').value = '';
  document.getElementById('editor-tags').value = '';
  document.getElementById('editor-content').value = '';
  document.getElementById('editor-status').value = '';
  document.getElementById('editor-handler').value = '';
  document.getElementById('editor-image').value = '';
  document.getElementById('editor-hidden').checked = false;
  document.getElementById('editor-from').value = '';
  document.getElementById('editor-to').value = '';
  document.getElementById('editor-cc').value = '';
  document.getElementById('email-fields').classList.add('hidden');

  // Reset to write tab
  document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.editor-tab[data-tab="write"]').classList.add('active');
  document.getElementById('editor-content').classList.remove('hidden');
  document.getElementById('editor-preview').classList.add('hidden');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
