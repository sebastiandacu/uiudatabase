import * as data from './data.js';
import { initSearch, setSearchQuery } from './search.js';
import { renderEntry } from './entry.js';
import { initAdmin, showAdmin } from './admin.js';
import { transitionView } from './animations.js';

// ===== LOGIN GATE =====
const loginGate = document.getElementById('login-gate');
const appEl = document.getElementById('app');
let currentUser = null;

function initLogin() {
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('login-password-field').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('login-username').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('login-password-field').focus();
  });

  // Check existing session
  const session = sessionStorage.getItem('uiu_session');
  if (session) {
    try {
      currentUser = JSON.parse(session);
      showApp();
      return;
    } catch {}
  }

  // Show login gate
  loginGate.classList.remove('hidden');
  appEl.classList.add('hidden');
  setTimeout(() => document.getElementById('login-username').focus(), 100);
}

async function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const pw = document.getElementById('login-password-field').value;
  const errorEl = document.getElementById('login-error');

  if (!username || !pw) {
    errorEl.textContent = 'CREDENTIALS REQUIRED';
    errorEl.classList.remove('hidden');
    return;
  }

  // First-run: no admin password set yet — allow admin login to set one up
  if (data.isFirstRun() && username.toLowerCase() === 'admin') {
    currentUser = { username: 'admin', displayName: 'Administrator', isAdmin: true };
    sessionStorage.setItem('uiu_session', JSON.stringify(currentUser));
    sessionStorage.setItem('uiu_admin_auth', 'true');
    errorEl.classList.add('hidden');
    showApp();
    // Immediately show admin panel with password setup
    showView('admin');
    showAdmin();
    return;
  }

  // Check admin login
  if (username.toLowerCase() === 'admin') {
    const isAdmin = await data.verifyAdmin(pw);
    if (isAdmin) {
      currentUser = { username: 'admin', displayName: 'Administrator', isAdmin: true };
      sessionStorage.setItem('uiu_session', JSON.stringify(currentUser));
      sessionStorage.setItem('uiu_admin_auth', 'true');
      errorEl.classList.add('hidden');
      showApp();
      return;
    }
  }

  // Check user login
  const user = data.verifyUser(username, pw);
  if (user) {
    currentUser = { username: user.username, displayName: user.displayName, isAdmin: false };
    sessionStorage.setItem('uiu_session', JSON.stringify(currentUser));
    errorEl.classList.add('hidden');
    showApp();
    return;
  }

  errorEl.textContent = 'ACCESS DENIED — INVALID CREDENTIALS';
  errorEl.classList.remove('hidden');
  document.getElementById('login-password-field').value = '';
}

function showApp() {
  loginGate.classList.add('hidden');
  appEl.classList.remove('hidden');

  // Show user in footer
  const footerUser = document.getElementById('footer-user');
  if (currentUser) {
    footerUser.textContent = `AGENT: ${currentUser.displayName || currentUser.username}`;
  }

  handleHash();

  if (currentView === 'search') {
    document.getElementById('search-input').focus();
  }
}

function logout() {
  currentUser = null;
  sessionStorage.removeItem('uiu_session');
  sessionStorage.removeItem('uiu_admin_auth');
  appEl.classList.add('hidden');
  loginGate.classList.remove('hidden');
  document.getElementById('login-username').value = '';
  document.getElementById('login-password-field').value = '';
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('login-username').focus();
}

// ===== VIEWS =====
const views = {
  search: document.getElementById('search-view'),
  entry: document.getElementById('entry-view'),
  admin: document.getElementById('admin-view')
};
const header = document.getElementById('app-header');
const footer = document.getElementById('app-footer');
let currentView = 'search';

function showView(name, options = {}) {
  const prev = currentView;
  currentView = name;

  // Determine animation direction
  const direction = (name === 'entry') ? 'right' : 'left';

  for (const [key, el] of Object.entries(views)) {
    if (key === name) {
      if (prev !== name) {
        transitionView(views[prev], el, direction);
      } else {
        el.classList.remove('hidden');
      }
    } else {
      el.classList.add('hidden');
    }
  }

  // Show/hide header & footer based on view
  header.classList.toggle('hidden', name === 'admin');
  footer.classList.toggle('hidden', name === 'admin');

  // Update URL hash
  if (options.updateHash !== false) {
    if (name === 'entry' && options.id) {
      history.pushState(null, '', `#entry/${options.id}`);
    } else if (name === 'admin') {
      history.pushState(null, '', '#admin');
    } else {
      history.pushState(null, '', '#');
    }
  }
}

// ===== ENTRY NAVIGATION =====
function navigateToEntry(id) {
  const entry = data.getById(id);
  if (!entry) {
    showView('search');
    return;
  }

  const container = document.getElementById('entry-content');
  renderEntry(entry, container);

  // Reset deepscan
  const deepscanBtn = document.getElementById('deepscan-btn');
  const deepscanResults = document.getElementById('deepscan-results');
  deepscanBtn.classList.remove('deepscan-scanning', 'deepscan-complete');
  deepscanBtn.disabled = false;
  deepscanBtn.dataset.entryId = id;
  deepscanResults.classList.add('hidden');
  deepscanResults.innerHTML = '';

  showView('entry', { id });
}

// ===== EVENT HANDLERS =====
// Custom events from entry links and search results
window.addEventListener('navigate-entry', (e) => {
  navigateToEntry(e.detail.id);
});

window.addEventListener('navigate-search', (e) => {
  showView('search');
  setSearchQuery(e.detail.term);
});

// Deepscan
document.getElementById('deepscan-btn').addEventListener('click', async () => {
  const btn = document.getElementById('deepscan-btn');
  const resultsEl = document.getElementById('deepscan-results');
  const entryId = btn.dataset.entryId;

  if (btn.classList.contains('deepscan-complete') || btn.classList.contains('deepscan-scanning')) return;

  // Scanning animation
  btn.classList.add('deepscan-scanning');
  btn.innerHTML = '<span class="deepscan-icon">&#9783;</span> SCANNING CROSS-REFERENCE INDEX...';
  btn.disabled = true;

  await new Promise(r => setTimeout(r, 1800));

  const results = data.deepScan(entryId);

  btn.classList.remove('deepscan-scanning');
  btn.classList.add('deepscan-complete');
  btn.innerHTML = `<span class="deepscan-icon">&#9783;</span> SCAN COMPLETE — ${results.length} REFERENCE${results.length !== 1 ? 'S' : ''} FOUND`;

  if (results.length === 0) {
    resultsEl.innerHTML = '<div class="deepscan-empty">NO CROSS-REFERENCES LOCATED IN INDEX</div>';
  } else {
    resultsEl.innerHTML = results.map((entry, i) => `
      <div class="deepscan-card" style="animation-delay: ${i * 0.1}s" data-id="${entry.id}">
        <div class="deepscan-card-header">
          <span class="deepscan-card-id">${escapeText(entry.id)}</span>
          <span class="badge badge-${entry.type}">${entry.type.charAt(0).toUpperCase() + entry.type.slice(1)}</span>
          ${entry.hidden ? '<span class="deepscan-classified-badge">DEEP INDEX</span>' : ''}
          ${entry.classification ? `<span class="deepscan-card-cls">${escapeText(entry.classification)}</span>` : ''}
        </div>
        <div class="deepscan-card-title">${escapeText(entry.title)}</div>
      </div>
    `).join('');

    resultsEl.onclick = (e) => {
      const card = e.target.closest('.deepscan-card');
      if (card) navigateToEntry(card.dataset.id);
    };
  }

  resultsEl.classList.remove('hidden');
});

// Back button
document.getElementById('back-btn').addEventListener('click', () => {
  showView('search');
  document.getElementById('search-input').focus();
});

// Footer admin link
document.getElementById('footer-admin').addEventListener('click', () => {
  showView('admin');
  showAdmin();
});

// Footer logout
document.getElementById('footer-logout').addEventListener('click', logout);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl+Shift+A → admin
  if (e.ctrlKey && e.shiftKey && e.key === 'A') {
    e.preventDefault();
    showView('admin');
    showAdmin();
    return;
  }

  // Escape → back to search (if not in admin)
  if (e.key === 'Escape' && currentView === 'entry') {
    showView('search');
    document.getElementById('search-input').focus();
    return;
  }

  // '/' → focus search (if in search view and not already focused)
  if (e.key === '/' && currentView === 'search' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    document.getElementById('search-input').focus();
  }
});

// Browser back/forward
window.addEventListener('popstate', () => {
  handleHash();
});

// ===== HASH ROUTING =====
function handleHash() {
  const hash = location.hash;

  if (hash.startsWith('#entry/')) {
    const id = decodeURIComponent(hash.slice(7));
    navigateToEntry(id);
  } else if (hash === '#admin') {
    showView('admin', { updateHash: false });
    showAdmin();
  } else {
    showView('search', { updateHash: false });
  }
}

// ===== HELPERS =====
function escapeText(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ===== INIT =====
async function init() {
  data.initStore();
  await data.loadFromServer();
  initSearch();
  initAdmin();
  initLogin();
}

init();
