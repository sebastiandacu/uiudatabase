const STORAGE_KEY = 'uiu_database_v1';

// ===== CLEARANCE =====
// Level 1 = UNCLASSIFIED only, Level 4 = sees everything
const CLASSIFICATION_LEVEL = {
  'UNCLASSIFIED': 1,
  'CONFIDENTIAL': 2,
  'SECRET': 3,
  'TOP SECRET': 4
};

let sessionClearance = 99; // Default: full access (admin)

export function setSessionClearance(level) {
  sessionClearance = typeof level === 'number' ? level : (parseInt(level) || 99);
}

export function clearSessionClearance() {
  sessionClearance = 99;
}

function canAccess(entry) {
  const required = CLASSIFICATION_LEVEL[entry.classification] ?? 1;
  return required <= sessionClearance;
}

function getStore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function createEmptyStore() {
  return { version: 1, entries: [], adminHash: null, users: [] };
}

// ===== INIT =====
export function initStore() {
  let store = getStore();
  if (!store) {
    store = createEmptyStore();
    saveStore(store);
  }
  return store;
}

export function isFirstRun() {
  const store = getStore() || createEmptyStore();
  return store.adminHash === null;
}

// ===== ADMIN AUTH =====
async function hashPassword(pw) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function setAdminPassword(pw) {
  const store = getStore() || createEmptyStore();
  store.adminHash = await hashPassword(pw);
  saveStore(store);
}

export async function verifyAdmin(pw) {
  const store = getStore();
  if (!store || !store.adminHash) return false;
  const hash = await hashPassword(pw);
  return hash === store.adminHash;
}

// ===== CRUD =====
export function getAll() {
  const store = getStore();
  return store ? store.entries : [];
}

export function getById(id) {
  const entries = getAll();
  const entry = entries.find(e => e.id === id);
  if (!entry || !canAccess(entry)) return null;
  return entry;
}

export function findByTitle(title) {
  const entries = getAll();
  const lower = title.toLowerCase();
  const entry = entries.find(e => e.title.toLowerCase() === lower);
  if (!entry || !canAccess(entry)) return null;
  return entry;
}

export function create(entry) {
  const store = getStore() || createEmptyStore();
  if (!entry.id) {
    entry.id = generateId(entry.type);
  }
  const now = new Date().toISOString();
  entry.created = now;
  entry.modified = now;
  store.entries.push(entry);
  saveStore(store);
  return entry;
}

export function update(id, patch) {
  const store = getStore();
  if (!store) return null;
  const idx = store.entries.findIndex(e => e.id === id);
  if (idx === -1) return null;
  Object.assign(store.entries[idx], patch);
  store.entries[idx].modified = new Date().toISOString();
  saveStore(store);
  return store.entries[idx];
}

export function remove(id) {
  const store = getStore();
  if (!store) return false;
  const idx = store.entries.findIndex(e => e.id === id);
  if (idx === -1) return false;
  store.entries.splice(idx, 1);
  saveStore(store);
  return true;
}

// ===== SEARCH =====
export function search(query) {
  if (!query || query.trim().length < 2) return [];

  const q = query.toLowerCase().trim();
  const entries = getAll().filter(e => !e.hidden && canAccess(e));
  const results = [];

  for (const entry of entries) {
    let score = 0;
    let snippet = '';

    // Title matching
    const titleLower = entry.title.toLowerCase();
    if (titleLower === q) {
      score += 100;
    } else if (titleLower.startsWith(q)) {
      score += 80;
    } else if (titleLower.includes(q)) {
      score += 50;
    }

    // ID matching
    const idLower = entry.id.toLowerCase();
    if (idLower === q) {
      score += 100;
    } else if (idLower.includes(q)) {
      score += 40;
    }

    // Tag matching
    if (entry.tags && entry.tags.some(t => t.toLowerCase().includes(q))) {
      score += 30;
    }

    // Content matching
    if (entry.content) {
      const contentLower = entry.content.toLowerCase();
      const pos = contentLower.indexOf(q);
      if (pos !== -1) {
        score += 20;
        // Extract snippet
        const plainContent = entry.content.replace(/\[\[([^\]]+)\]\]/g, '$1');
        const plainLower = plainContent.toLowerCase();
        const plainPos = plainLower.indexOf(q);
        if (plainPos !== -1) {
          const start = Math.max(0, plainPos - 60);
          const end = Math.min(plainContent.length, plainPos + q.length + 60);
          let snip = plainContent.slice(start, end).trim();
          if (start > 0) snip = '...' + snip;
          if (end < plainContent.length) snip = snip + '...';
          snippet = snip;
        }
      }
    }

    // Meta matching
    if (entry.meta) {
      for (const val of Object.values(entry.meta)) {
        if (String(val).toLowerCase().includes(q)) {
          score += 10;
          break;
        }
      }
    }

    // Type matching
    if (entry.type && entry.type.toLowerCase().includes(q)) {
      score += 10;
    }

    // Date matching
    if (entry.date && entry.date.includes(q)) {
      score += 15;
    }

    if (score > 0) {
      results.push({ entry, score, snippet });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

// ===== SERVER LOADING (Static Deployment) =====
export async function loadFromServer() {
  try {
    const resp = await fetch('database.json', { cache: 'no-store' });
    if (!resp.ok) return false;
    const serverData = await resp.json();
    if (!serverData || !Array.isArray(serverData.entries)) return false;

    const localStore = getStore();
    // Import if local store is empty or server version is different
    if (!localStore || !localStore.deployedAt || localStore.deployedAt !== serverData.deployedAt) {
      saveStore(serverData);
      return true;
    }
    return false;
  } catch {
    return false; // No server database — use localStorage as-is
  }
}

// ===== DEEPSCAN =====
export function deepScan(entryId) {
  const entry = getById(entryId);
  if (!entry) return [];

  const allEntries = getAll();
  const resultIds = new Set();

  // Forward links: entries referenced in [[...]] in this entry's content
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = linkRegex.exec(entry.content || '')) !== null) {
    const raw = match[1];
    const term = (raw.includes('|') ? raw.split('|')[1].trim() : raw).toLowerCase();
    const linked = allEntries.find(e => e.title.toLowerCase() === term);
    if (linked && linked.id !== entryId) {
      resultIds.add(linked.id);
    }
  }

  // Back links: entries whose content references [[this entry's title]]
  const titleLower = entry.title.toLowerCase();
  for (const e of allEntries) {
    if (e.id === entryId) continue;
    const contentLower = (e.content || '').toLowerCase();
    if (contentLower.includes(`[[${titleLower}]]`)) {
      resultIds.add(e.id);
    }
  }

  return Array.from(resultIds).map(id => allEntries.find(e => e.id === id)).filter(e => e && canAccess(e));
}

// ===== GITHUB AUTO-DEPLOY =====
const GH_TOKEN_KEY = 'uiu_gh_token';
const GH_REPO_KEY = 'uiu_gh_repo';

export function setGitHubConfig(token, repo) {
  localStorage.setItem(GH_TOKEN_KEY, token);
  localStorage.setItem(GH_REPO_KEY, repo);
}

export function getGitHubConfig() {
  return {
    token: localStorage.getItem(GH_TOKEN_KEY),
    repo: localStorage.getItem(GH_REPO_KEY)
  };
}

export function clearGitHubConfig() {
  localStorage.removeItem(GH_TOKEN_KEY);
  localStorage.removeItem(GH_REPO_KEY);
}

export async function deployToGitHub() {
  const { token, repo } = getGitHubConfig();
  if (!token || !repo) throw new Error('GitHub not configured');

  const json = exportJSON();
  const content = btoa(unescape(encodeURIComponent(json)));

  // Get current file SHA (needed for updates)
  let sha = null;
  try {
    const existing = await fetch(`https://api.github.com/repos/${repo}/contents/database.json`, {
      headers: { 'Authorization': `token ${token}` }
    });
    if (existing.ok) {
      const data = await existing.json();
      sha = data.sha;
    }
  } catch {}

  const body = {
    message: `Database update — ${new Date().toISOString().split('T')[0]}`,
    content,
    ...(sha ? { sha } : {})
  };

  const resp = await fetch(`https://api.github.com/repos/${repo}/contents/database.json`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.message || 'Deploy failed');
  }

  return true;
}

// ===== IMPORT / EXPORT =====
export function exportJSON() {
  const store = getStore() || createEmptyStore();
  store.deployedAt = new Date().toISOString();
  saveStore(store);
  return JSON.stringify(store, null, 2);
}

export function importJSON(jsonString, mode = 'replace') {
  const imported = JSON.parse(jsonString);
  if (!imported || !Array.isArray(imported.entries)) {
    throw new Error('Invalid database format');
  }

  if (mode === 'replace') {
    saveStore(imported);
  } else if (mode === 'merge') {
    const store = getStore() || createEmptyStore();
    const existingIds = new Set(store.entries.map(e => e.id));
    for (const entry of imported.entries) {
      if (existingIds.has(entry.id)) {
        const idx = store.entries.findIndex(e => e.id === entry.id);
        store.entries[idx] = entry;
      } else {
        store.entries.push(entry);
      }
    }
    // Keep current adminHash unless it's a fresh store
    if (!store.adminHash && imported.adminHash) {
      store.adminHash = imported.adminHash;
    }
    saveStore(store);
  }
}

// ===== USERS =====
export function getUsers() {
  const store = getStore() || createEmptyStore();
  return store.users || [];
}

export function addUser(username, password, displayName, clearance) {
  const store = getStore() || createEmptyStore();
  if (!store.users) store.users = [];
  if (store.users.find(u => u.username === username)) {
    throw new Error('Username already exists');
  }
  store.users.push({ username, password, displayName: displayName || username, clearance: parseInt(clearance) || 1 });
  saveStore(store);
}

export function removeUser(username) {
  const store = getStore();
  if (!store || !store.users) return false;
  const idx = store.users.findIndex(u => u.username === username);
  if (idx === -1) return false;
  store.users.splice(idx, 1);
  saveStore(store);
  return true;
}

export function verifyUser(username, password) {
  const store = getStore();
  if (!store || !store.users) return null;
  const user = store.users.find(u => u.username === username && u.password === password);
  return user || null;
}

// ===== HELPERS =====
function generateId(type) {
  const prefixes = {
    person: 'P', organization: 'ORG', location: 'LOC',
    event: 'EVT', case: 'C', object: 'OBJ',
    document: 'DOC', cart: 'CART', can: 'CAN',
    'can-man': 'CM', other: 'X'
  };
  const prefix = prefixes[type] || 'X';
  const num = String(Math.floor(Math.random() * 9000) + 1000);
  return `UIU-${prefix}-${num}`;
}

export function getEntryCount() {
  return getAll().length;
}

export function getTypeCounts() {
  const entries = getAll();
  const counts = {};
  for (const e of entries) {
    counts[e.type] = (counts[e.type] || 0) + 1;
  }
  return counts;
}
