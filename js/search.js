import * as data from './data.js';
import { createBadgeHtml } from './entry.js';
import { animateResults, animateNoResults } from './animations.js';

let debounceTimer = null;

export function initSearch() {
  const input = document.getElementById('search-input');
  const resultsEl = document.getElementById('search-results');
  const statusEl = document.getElementById('search-status');

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();

    if (query.length === 0) {
      resultsEl.innerHTML = '';
      statusEl.classList.add('hidden');
      return;
    }

    if (query.length < 2) {
      resultsEl.innerHTML = '';
      statusEl.textContent = 'ENTER AT LEAST 2 CHARACTERS';
      statusEl.classList.remove('hidden');
      return;
    }

    // Show searching indicator
    statusEl.innerHTML = '<span class="search-indicator">Searching</span>';
    statusEl.classList.remove('hidden');

    debounceTimer = setTimeout(() => {
      performSearch(query, resultsEl, statusEl);
    }, 250);
  });

  // Allow Enter to search immediately
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      const query = input.value.trim();
      if (query.length >= 2) {
        performSearch(query, resultsEl, statusEl);
      }
    }
  });
}

function performSearch(query, resultsEl, statusEl) {
  const results = data.search(query);

  if (results.length === 0) {
    resultsEl.innerHTML = `
      <div class="no-results animate-in">
        <div class="no-results-title">No Records Found</div>
        <div class="no-results-detail">QUERY: "${escapeHtml(query)}" // 0 RESULTS</div>
      </div>
    `;
    statusEl.classList.add('hidden');
    return;
  }

  statusEl.textContent = `${results.length} RECORD${results.length !== 1 ? 'S' : ''} FOUND`;
  statusEl.classList.remove('hidden');

  resultsEl.innerHTML = results.map(({ entry, snippet }) => {
    const snippetHtml = snippet
      ? highlightMatch(snippet, entry, document.getElementById('search-input').value.trim())
      : truncate(stripLinks(entry.content || ''), 120);

    return `
      <div class="result-card" data-type="${entry.type}" data-entry-id="${entry.id}">
        <div class="result-card-header">
          <span class="result-card-title">${escapeHtml(entry.title)}</span>
          ${createBadgeHtml(entry.type)}
        </div>
        <div class="result-card-snippet">${snippetHtml}</div>
        <div class="result-card-footer">
          <span class="result-card-date">${escapeHtml(entry.id)}</span>
          ${entry.date ? `<span class="result-card-date">${escapeHtml(entry.date)}</span>` : ''}
          ${entry.tags ? entry.tags.slice(0, 3).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('') : ''}
        </div>
      </div>
    `;
  }).join('');

  // Animate cards
  animateResults(resultsEl);

  // Bind click handlers via delegation
  resultsEl.onclick = (e) => {
    const card = e.target.closest('.result-card');
    if (card) {
      const id = card.dataset.entryId;
      window.dispatchEvent(new CustomEvent('navigate-entry', { detail: { id } }));
    }
  };
}

// Set search input value programmatically and trigger search
export function setSearchQuery(term) {
  const input = document.getElementById('search-input');
  const resultsEl = document.getElementById('search-results');
  const statusEl = document.getElementById('search-status');
  input.value = term;
  if (term.length >= 2) {
    performSearch(term, resultsEl, statusEl);
  }
}

// Helpers
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function stripLinks(content) {
  return content.replace(/\[\[([^\]]+)\]\]/g, '$1');
}

function truncate(str, len) {
  if (str.length <= len) return escapeHtml(str);
  return escapeHtml(str.slice(0, len).trim()) + '...';
}

function highlightMatch(snippet, entry, query) {
  const escaped = escapeHtml(snippet);
  const q = escapeHtml(query);
  const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}
