// Stagger-animate result cards
export function animateResults(container) {
  const cards = container.querySelectorAll('.result-card');
  cards.forEach((card, i) => {
    card.style.animationDelay = `${i * 60}ms`;
    card.classList.add('animate-in');
  });
}

// Entry reveal with declassification effect
export function revealEntry(entryEl) {
  entryEl.classList.add('entry-reveal', 'entry-scanline');

  // Remove animation classes after they finish
  const cleanup = () => {
    entryEl.classList.remove('entry-reveal', 'entry-scanline');
  };
  setTimeout(cleanup, 1200);

  // Stamp animation
  const stamp = entryEl.querySelector('.classification-stamp');
  if (stamp) {
    stamp.classList.add('stamp-animate');
  }

  // Body fade in
  const body = entryEl.querySelector('.entry-body');
  if (body) {
    body.classList.add('entry-body-reveal');
  }
}

// View transition
export function transitionView(fromEl, toEl, direction = 'right') {
  fromEl.classList.add('hidden');
  toEl.classList.remove('hidden');

  const animClass = direction === 'right' ? 'view-enter-right' : 'view-enter-left';
  toEl.classList.add(animClass);

  const onEnd = () => {
    toEl.classList.remove(animClass);
    toEl.removeEventListener('animationend', onEnd);
  };
  toEl.addEventListener('animationend', onEnd);
}

// Animate no-results message
export function animateNoResults(el) {
  el.classList.add('animate-in');
}
