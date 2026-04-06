import * as data from './data.js';
import { revealEntry } from './animations.js';

// ===== SPEAKER COLORS (for dialogue) =====
const SPEAKER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#e67e22', '#9b59b6',
  '#1abc9c', '#f39c12', '#e84393', '#00cec9', '#6c5ce7',
  '#fd79a8', '#00b894', '#d63031', '#0984e3', '#fdcb6e'
];

function speakerColor(name, colorMap) {
  if (!colorMap[name]) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
    colorMap[name] = SPEAKER_COLORS[Math.abs(hash) % SPEAKER_COLORS.length];
  }
  return colorMap[name];
}

// ===== UNIFIED CONTENT PARSER =====
// Works across ALL formats: dossier, document, email, folder
function parseUnifiedContent(content) {
  // Step 1: Extract blocks (ADDENDUM, LOG, INTERVIEW) with placeholders
  const blocks = [];
  let processed = content.replace(
    /\[(ADDENDUM|LOG|INTERVIEW)(?::([^\]]*))?\]([\s\S]*?)\[\/\1\]/g,
    (match, type, title, body) => {
      const idx = blocks.length;
      blocks.push({ type, title: title?.trim() || type, body });
      return `%%BLOCK_${idx}%%`;
    }
  );

  // Step 2: Escape HTML on non-block content
  const parts = processed.split(/(%%BLOCK_\d+%%)/);
  let html = parts.map(part => {
    const blockMatch = part.match(/^%%BLOCK_(\d+)%%$/);
    if (blockMatch) {
      const block = blocks[parseInt(blockMatch[1])];
      return renderBlock(block);
    }
    return parseInlineContent(part);
  }).join('');

  return html;
}

function parseInlineContent(text) {
  let html = escapeHtml(text);

  // [[Term]] or [[Display|Target]] links
  html = html.replace(/\[\[([^\]]+)\]\]/g, (match, inner) => {
    let display, target;
    if (inner.includes('|')) {
      const parts = inner.split('|');
      display = parts[0].trim();
      target = parts[1].trim();
    } else {
      display = inner;
      target = inner;
    }
    const linked = data.findByTitle(target);
    if (linked) {
      return `<a class="entry-link" data-entry-id="${escapeAttr(linked.id)}" title="View: ${escapeAttr(linked.title)}">${escapeHtml(display)}</a>`;
    }
    return `<a class="entry-link dead-link" data-search-term="${escapeAttr(target)}" title="Search: ${escapeHtml(target)}">${escapeHtml(display)}</a>`;
  });

  // [REDACTED] or [REDACTED: text]
  html = html.replace(/\[REDACTED(?::([^\]]*))?\]/g, (m, inner) => {
    return `<span class="redacted">${inner?.trim() || 'REDACTED'}</span>`;
  });

  // [IMG: url] inline images
  html = html.replace(/\[IMG:\s*([^\]]+)\]/g, (m, url) => {
    return `<div class="inline-image"><img src="${escapeAttr(url.trim())}" alt="Attached image" loading="lazy"></div>`;
  });

  // **bold**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // __underline__
  html = html.replace(/__([^_]+)__/g, '<span class="doc-underline">$1</span>');

  // --- horizontal rules
  html = html.replace(/^---$/gm, '</p><hr><p>');

  // Paragraphs
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs.map(p => {
    const trimmed = p.trim();
    if (!trimmed) return '';
    if (trimmed === '<hr>' || trimmed === '</p><hr><p>') return '<hr>';
    return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
  }).filter(Boolean).join('');

  return html;
}

// ===== BLOCK RENDERERS =====
function renderBlock(block) {
  if (block.type === 'INTERVIEW') {
    return renderInterviewBlock(block.title, block.body);
  }
  return renderCollapsibleBlock(block.type.toLowerCase(), block.title, block.body);
}

function renderCollapsibleBlock(type, title, body) {
  const icon = type === 'addendum' ? '&#9654;' : '&#9776;';
  const parsedBody = parseInlineContent(body);
  return `
    <details class="collapsible-block collapsible-${type}">
      <summary class="collapsible-header">
        <span class="collapsible-icon">${icon}</span>
        <span class="collapsible-type">${type.toUpperCase()}</span>
        <span class="collapsible-title">${escapeHtml(title)}</span>
      </summary>
      <div class="collapsible-body">${parsedBody}</div>
    </details>`;
}

function renderInterviewBlock(title, body) {
  const lines = body.trim().split('\n');
  const colorMap = {};

  let linesHtml = '';
  for (const line of lines) {
    const dialogMatch = line.match(/^@([^:]+):\s*(.*)/);
    if (dialogMatch) {
      const speaker = dialogMatch[1].trim();
      const text = dialogMatch[2];
      const color = speakerColor(speaker, colorMap);
      linesHtml += `
        <div class="dialogue-line">
          <span class="dialogue-speaker" style="color:${color}">${escapeHtml(speaker)}:</span>
          <span class="dialogue-text">${parseInlineSimple(text)}</span>
        </div>`;
    } else if (line.trim()) {
      // Narration / stage direction
      linesHtml += `<div class="dialogue-narration">${parseInlineSimple(line.trim())}</div>`;
    }
  }

  return `
    <details class="collapsible-block collapsible-interview" open>
      <summary class="collapsible-header">
        <span class="collapsible-icon">&#9654;</span>
        <span class="collapsible-type">INTERVIEW</span>
        <span class="collapsible-title">${escapeHtml(title)}</span>
      </summary>
      <div class="interview-body">${linesHtml}</div>
    </details>`;
}

// Simple inline parse (for dialogue lines — no paragraphs)
function parseInlineSimple(text) {
  let html = escapeHtml(text);
  html = html.replace(/\[\[([^\]]+)\]\]/g, (m, inner) => {
    let display, target;
    if (inner.includes('|')) { display = inner.split('|')[0].trim(); target = inner.split('|')[1].trim(); }
    else { display = inner; target = inner; }
    const linked = data.findByTitle(target);
    if (linked) return `<a class="entry-link" data-entry-id="${escapeAttr(linked.id)}">${escapeHtml(display)}</a>`;
    return `<a class="entry-link dead-link" data-search-term="${escapeAttr(target)}">${escapeHtml(display)}</a>`;
  });
  html = html.replace(/\[REDACTED(?::([^\]]*))?\]/g, (m, inner) => `<span class="redacted">${inner?.trim() || 'REDACTED'}</span>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<span class="doc-underline">$1</span>');
  return html;
}

// ===== IMAGE HTML =====
function entryImageHtml(entry, style) {
  if (!entry.image) return '';
  if (style === 'portrait') {
    return `<div class="entry-portrait"><img src="${escapeAttr(entry.image)}" alt="${escapeAttr(entry.title)}"></div>`;
  }
  if (style === 'banner') {
    return `<div class="entry-banner"><img src="${escapeAttr(entry.image)}" alt="${escapeAttr(entry.title)}"></div>`;
  }
  return `<div class="entry-image"><img src="${escapeAttr(entry.image)}" alt="${escapeAttr(entry.title)}"></div>`;
}

function imageStyle(type) {
  if (type === 'person') return 'portrait';
  if (type === 'location' || type === 'event') return 'banner';
  return 'image';
}

// ===== FORMAT RENDERERS =====
export function renderEntry(entry, container) {
  container.className = '';
  container.id = 'entry-content';

  switch (entry.format) {
    case 'document': renderDocumentEntry(entry, container); break;
    case 'email':    renderEmailEntry(entry, container); break;
    case 'folder':   renderFolderEntry(entry, container); break;
    default:         renderDossierEntry(entry, container); break;
  }
  bindEntryLinks(container);
}

// --- DOSSIER (default) ---
function renderDossierEntry(entry, container) {
  const clsClass = classificationClass(entry.classification);
  const typeLabel = capitalize(entry.type);

  let metaHtml = '';
  if (entry.meta) {
    for (const [key, val] of Object.entries(entry.meta)) {
      if (val) metaHtml += `<div class="entry-meta-item"><span class="entry-meta-label">${escapeHtml(key)}:</span><span>${escapeHtml(String(val))}</span></div>`;
    }
  }

  const tagsHtml = renderTags(entry.tags);
  const imgHtml = entryImageHtml(entry, imageStyle(entry.type));

  container.innerHTML = `
    <div class="entry-header">
      <div class="entry-header-top">
        <div style="flex:1">
          <div class="entry-id">${escapeHtml(entry.id)}</div>
          <h1 class="entry-title">${escapeHtml(entry.title)}</h1>
        </div>
        ${imgHtml}
        <div class="classification-stamp ${clsClass}">${escapeHtml(entry.classification)}</div>
      </div>
      <div class="entry-meta">
        <div class="entry-meta-item"><span class="badge badge-${entry.type}">${typeLabel}</span></div>
        ${entry.date ? `<div class="entry-meta-item"><span class="entry-meta-label">Date:</span><span>${escapeHtml(entry.date)}</span></div>` : ''}
        ${metaHtml}
      </div>
    </div>
    <div class="entry-body">${parseUnifiedContent(entry.content || '')}</div>
    ${tagsHtml}
  `;
  revealEntry(container);
}

// --- DOCUMENT (paper) ---
function renderDocumentEntry(entry, container) {
  const clsClass = classificationClass(entry.classification);
  const metaRow = buildDocMeta(entry);
  const tagsHtml = renderDocTags(entry.tags);
  const imgHtml = entryImageHtml(entry, imageStyle(entry.type));

  container.innerHTML = `
    <div class="entry-document">
      <div class="doc-header">
        <div class="doc-classification ${clsClass}">${escapeHtml(entry.classification)}</div>
        <div class="doc-org">Federal Bureau of Investigation — Unusual Incidents Unit</div>
        ${imgHtml}
        <div class="doc-title">${escapeHtml(entry.title)}</div>
        ${metaRow}
      </div>
      <div class="doc-body">${parseUnifiedContent(entry.content || '')}</div>
      ${tagsHtml}
      <div class="doc-footer">UIU CLASSIFIED DOCUMENT — UNAUTHORIZED DISTRIBUTION IS A FEDERAL OFFENSE</div>
    </div>
  `;
  revealEntry(container);
}

// --- EMAIL ---
function renderEmailEntry(entry, container) {
  // Parse email headers from meta fields
  const from = entry.meta?.from || entry.meta?.handler || 'Unknown Sender';
  const to = entry.meta?.to || 'Undisclosed Recipients';
  const cc = entry.meta?.cc || '';
  const subject = entry.title;
  const date = entry.date || '';

  container.innerHTML = `
    <div class="entry-email">
      <div class="email-toolbar">
        <span class="email-toolbar-label">SECURE EMAIL — ENCRYPTED CHANNEL</span>
      </div>
      <div class="email-header">
        <div class="email-field"><span class="email-label">From:</span><span class="email-value">${escapeHtml(from)}</span></div>
        <div class="email-field"><span class="email-label">To:</span><span class="email-value">${escapeHtml(to)}</span></div>
        ${cc ? `<div class="email-field"><span class="email-label">Cc:</span><span class="email-value">${escapeHtml(cc)}</span></div>` : ''}
        <div class="email-field"><span class="email-label">Date:</span><span class="email-value">${escapeHtml(date)}</span></div>
        <div class="email-field email-subject"><span class="email-label">Subject:</span><span class="email-value">${escapeHtml(subject)}</span></div>
      </div>
      <div class="email-body">${parseUnifiedContent(entry.content || '')}</div>
      <div class="email-footer">
        This email and any attachments are classified. Unauthorized forwarding is prohibited.
      </div>
    </div>
  `;
  revealEntry(container);
}

// --- FOLDER (case file) ---
function renderFolderEntry(entry, container) {
  const clsClass = classificationClass(entry.classification);
  const typeLabel = capitalize(entry.type);
  const tagsHtml = renderTags(entry.tags);
  const imgHtml = entryImageHtml(entry, imageStyle(entry.type));

  let metaHtml = '';
  if (entry.meta) {
    for (const [key, val] of Object.entries(entry.meta)) {
      if (val) metaHtml += `<div class="folder-meta-item"><span class="folder-meta-label">${escapeHtml(key)}:</span> ${escapeHtml(String(val))}</div>`;
    }
  }

  container.innerHTML = `
    <div class="entry-folder">
      <div class="folder-tab">
        <span class="folder-tab-label">${escapeHtml(entry.id)}</span>
        <span class="classification-stamp ${clsClass}" style="transform:rotate(0);font-size:0.55rem;padding:2px 8px;">${escapeHtml(entry.classification)}</span>
      </div>
      <div class="folder-body">
        <div class="folder-header">
          ${imgHtml}
          <div class="folder-title">${escapeHtml(entry.title)}</div>
          <div class="folder-subtitle">
            <span class="badge badge-${entry.type}">${typeLabel}</span>
            ${entry.date ? `<span class="folder-date">${escapeHtml(entry.date)}</span>` : ''}
          </div>
          ${metaHtml ? `<div class="folder-meta">${metaHtml}</div>` : ''}
        </div>
        <div class="folder-content">${parseUnifiedContent(entry.content || '')}</div>
        ${tagsHtml ? `<div class="folder-tags">${tagsHtml}</div>` : ''}
      </div>
    </div>
  `;
  revealEntry(container);
}

// ===== SHARED HELPERS =====
function buildDocMeta(entry) {
  const parts = [];
  if (entry.id) parts.push(`FILE: ${escapeHtml(entry.id)}`);
  if (entry.date) parts.push(`DATE: ${escapeHtml(entry.date)}`);
  if (entry.meta?.status) parts.push(`STATUS: ${escapeHtml(entry.meta.status)}`);
  if (entry.meta?.handler) parts.push(`HANDLER: ${escapeHtml(entry.meta.handler)}`);
  if (parts.length === 0) return '';
  return `<div class="doc-meta-row">${parts.map(p => `<span>${p}</span>`).join('')}</div>`;
}

function renderTags(tags) {
  if (!tags || tags.length === 0) return '';
  return `<div class="entry-tags">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`;
}

function renderDocTags(tags) {
  if (!tags || tags.length === 0) return '';
  return `<div class="doc-tags">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`;
}

function bindEntryLinks(container) {
  container.querySelectorAll('.entry-link[data-entry-id]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('navigate-entry', { detail: { id: link.dataset.entryId } }));
    });
  });
  container.querySelectorAll('.entry-link[data-search-term]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('navigate-search', { detail: { term: link.dataset.searchTerm } }));
    });
  });
}

// Preview for admin editor
export function previewContent(content) {
  return parseUnifiedContent(content);
}

// Helpers
function classificationClass(cls) {
  return { 'UNCLASSIFIED': 'cls-unclassified', 'CONFIDENTIAL': 'cls-confidential', 'SECRET': 'cls-secret', 'TOP SECRET': 'cls-topsecret' }[cls] || 'cls-unclassified';
}
function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str) { return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

export function createBadgeHtml(type) {
  return `<span class="badge badge-${type}">${capitalize(type)}</span>`;
}
export function createStampHtml(classification) {
  return `<span class="classification-stamp ${classificationClass(classification)}">${escapeHtml(classification)}</span>`;
}
