/* Scrollytelling stepper for Quarto stories.
   Each direct child of #scrolly-story becomes a "scene", except a heading is
   always grouped with the paragraph that opens its section (never shown
   alone); one scene is shown at a time and a single scroll gesture / arrow
   key / swipe advances or rewinds one scene.

   GSAP is a kept dependency (animated transitions are planned): visibility is
   driven by autoAlpha (opacity + visibility together, so they never desync) and
   the input cooldown uses gsap.delayedCall. Set DURATION > 0 to get fades. */
(function () {
  // The template's inline pre-script hides every scene but the first via a
  // `scrolly-preload` class on <html> so nothing flashes unstyled before this
  // runs. Every exit path below must drop that class, or a scene that never
  // gets converted (GSAP missing, no story, too few scenes) stays hidden forever.
  const reveal = () => document.documentElement.classList.remove('scrolly-preload');

  // Graceful no-op if the GSAP CDN is unavailable: leave a normal scrollable page.
  if (typeof gsap === 'undefined') { reveal(); return; }

  const story = document.getElementById('scrolly-story');
  if (!story) { reveal(); return; }

  const DURATION = 0.5;   // fade length per scene (s)
  const GAP = 0.0;       // pause between the old leaving and the new arriving (s)
  const OFFSET = 40;      // px the scenes travel as they fade
  const SLIDE = 0.6;      // end-card slide-up length (s)
  const TOTAL = DURATION * 2 + GAP;   // full transition length

  const content = [...story.children].filter(el =>
    el.nodeType === 1 &&
    !el.matches('style, script, link') &&
    el.textContent.trim() !== ''
  );
  if (content.length < 2) { reveal(); return; }

  const isHeading = el => el.matches('h1, h2, h3, header') || el.id === 'title-block-header';

  // A heading is never its own scene: it's grouped with the paragraph that
  // opens its section, so readers always see "Heading + first sentence"
  // together rather than the heading alone as a scroll stop.
  const groups = [];
  for (let i = 0; i < content.length; i++) {
    const el = content[i];
    if (isHeading(el)) {
      const group = [el];
      const next = content[i + 1];
      if (next && !isHeading(next) && !next.matches('.scrolly-end')) {
        group.push(next);
        i++;
      }
      groups.push(group);
    } else {
      groups.push([el]);
    }
  }

  // Wrap each group in its own centering container rather than turning the
  // element itself into a flex column — flexing a <p> would stack its inline
  // children (<strong>, <span>, text) onto separate lines.
  const scenes = groups.map(group => {
    const scene = document.createElement('div');
    // Figure scenes get a wider reading column (the Plotly map needs more room
    // than the 720px prose column); end scene is the full-bleed footer card.
    const isFig = group.some(el => el.querySelector('[id^="fig-"]') || /^fig-/.test(el.id || ''));
    const isEnd = group.some(el => el.matches('.scrolly-end'));
    scene.className = 'scrolly-scene' +
      (isEnd ? ' scrolly-scene--end' : isFig ? ' scrolly-scene--fig' : '');
    story.insertBefore(scene, group[0]);
    group.forEach(el => scene.appendChild(el));
    return scene;
  });

  // Section model for the nav aids: the title header, headings, and figures.
  const items = [];
  scenes.forEach((scene, i) => {
    const el = scene.firstElementChild;
    if (!el) return;
    // The Quarto title block (title + subtitle + author + date).
    if (el.matches('header') || el.id === 'title-block-header') {
      const h1 = el.querySelector('h1, .title');
      items.push({
        index: i,
        level: 'header',
        id: el.id || 'top',
        title: h1 ? h1.textContent.trim() : 'Introduction',
      });
      return;
    }
    if (el.matches('h2, h3')) {
      items.push({
        index: i,
        level: el.tagName === 'H2' ? 2 : 3,
        id: el.id,
        title: el.textContent.trim(),
      });
      return;
    }
    // Quarto figures: <div id="fig-N" data-fig-scap="…"> … <figcaption>…</figcaption>.
    // Nav title prefers the figure's short caption (fig-scap in the .qmd) —
    // written specifically to be a short name — and falls back to the full
    // caption, then the id slug, if a figure has no fig-scap set.
    const fig = scene.querySelector('[id^="fig-"]');
    if (fig) {
      const scap = fig.getAttribute('data-fig-scap');
      const caption = fig.querySelector('figcaption');
      // Quarto's own caption text is pre-numbered ("Figure 1: …") — strip
      // that so it isn't doubled under our own "Figure: " label.
      const captionText = caption
        ? caption.textContent.trim().replace(/^Figure\s+\S+:\s*/, '')
        : '';
      const label = scap || captionText || fig.id.replace(/^fig-/, '');
      items.push({
        index: i,
        level: 'fig',
        id: fig.id,
        title: 'Figure: ' + label,
      });
    }
  });
  // One ordered nav list drives the contents drawer. It's flat (for index
  // math and the search filter) but also grouped into a parent/child tree:
  // each header or H2 is a parent, and the H3s/figures that follow it (until
  // the next parent) are its children — mirrors the story's own section
  // hierarchy.
  const navItems = items.sort((a, b) => a.index - b.index);
  const navTree = [];
  navItems.forEach(item => {
    if (item.level === 'header' || item.level === 2) {
      navTree.push({ ...item, children: [] });
    } else if (navTree.length) {
      navTree[navTree.length - 1].children.push(item);
    } else {
      navTree.push({ ...item, children: [] });
    }
  });

  document.body.classList.add('scrolly-active');

  // Show only the first scene. autoAlpha = opacity + visibility.
  gsap.set(scenes, { autoAlpha: 0 });
  gsap.set(scenes[0], { autoAlpha: 1 });
  reveal();

  let current = 0;
  let locked = false;
  let overlayOpen = false;

  // Nav DOM, populated by buildOverlay().
  const overlayEntries = [];
  const overlayGroups = [];
  let overlay, overlayBtn, searchInput;

  function goTo(index) {
    index = Math.max(0, Math.min(index, scenes.length - 1));
    if (index === current) return;

    // dir = 1 forward → everything travels upward (old exits up, new rises from
    // below); dir = -1 backward mirrors it (old exits down, new drops from above).
    const dir = index > current ? 1 : -1;
    const leaving = scenes[current];
    const entering = scenes[index];
    entering.scrollTop = 0;   // always start a scene at its top
    current = index;

    const tl = gsap.timeline({
      // Plotly figures laid out while hidden render at width 0 — nudge a reflow.
      onStart: () => window.dispatchEvent(new Event('resize')),
    });

    if (entering.classList.contains('scrolly-scene--end')) {
      // Footer slides up from the bottom, over the current scene (no fade).
      tl.set(leaving, { autoAlpha: 1, y: 0 })
        .fromTo(entering,
          { autoAlpha: 1, yPercent: 100 },
          { autoAlpha: 1, yPercent: 0, duration: SLIDE, ease: 'power2.out' }, 0);
    } else if (leaving.classList.contains('scrolly-scene--end')) {
      // Footer slides back down out of view, revealing the previous scene.
      tl.set(entering, { autoAlpha: 1, y: 0 })
        .to(leaving, { yPercent: 100, duration: SLIDE, ease: 'power2.in' }, 0)
        .set(leaving, { autoAlpha: 0, yPercent: 0 });
    } else {
      tl.to(leaving, { autoAlpha: 0, y: -OFFSET * dir, duration: DURATION }, 0)
        .fromTo(entering,
          { autoAlpha: 0, y: OFFSET * dir },
          { autoAlpha: 1, y: 0, duration: DURATION }, DURATION + GAP);
    }

    updateNav();
  }

  // ---- Navigation aid (searchable contents drawer) ----

  // Index of the latest reached item in a list (-1 while still on the
  // pre-section header scene).
  function activeIn(list) {
    let s = -1;
    list.forEach((sec, k) => { if (current >= sec.index) s = k; });
    return s;
  }

  function updateNav() {
    const aEntry = activeIn(navItems);
    overlayEntries.forEach((e, k) => e.classList.toggle('is-active', k === aEntry));
  }

  // Lock-respecting jump so a click can't overlap an in-flight transition.
  function jumpTo(index) {
    if (!locked && index !== current) {
      goTo(index);
      locked = true;
      gsap.delayedCall(Math.max(TOTAL, 0.7), () => { locked = false; });
    }
    closeOverlay();
  }

  function buildOverlay() {
    overlayBtn = document.createElement('button');
    overlayBtn.type = 'button';
    overlayBtn.className = 'scrolly-contents-btn';
    overlayBtn.setAttribute('aria-label', 'Contents');
    overlayBtn.setAttribute('aria-expanded', 'false');
    overlayBtn.setAttribute('aria-controls', 'scrolly-contents');
    // Icon-only round button — identical on desktop and mobile, so it never
    // competes with the reading column for width. It's the sole nav
    // affordance on both, opening the same drawer.
    overlayBtn.innerHTML =
      '<svg class="scrolly-contents-icon" width="16" height="16" viewBox="0 0 16 16" ' +
      'fill="none" aria-hidden="true"><circle cx="2.5" cy="4" r="1.5" fill="currentColor"/>' +
      '<circle cx="2.5" cy="12" r="1.5" fill="currentColor"/>' +
      '<rect x="6" y="3" width="9" height="2" rx="1" fill="currentColor"/>' +
      '<rect x="6" y="11" width="9" height="2" rx="1" fill="currentColor"/></svg>';
    overlayBtn.addEventListener('click', openOverlay);
    document.body.appendChild(overlayBtn);

    overlay = document.createElement('div');
    overlay.className = 'scrolly-overlay';
    overlay.id = 'scrolly-contents';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Contents');

    const backdrop = document.createElement('div');
    backdrop.className = 'scrolly-overlay-backdrop';
    backdrop.addEventListener('click', closeOverlay);

    const panel = document.createElement('div');
    panel.className = 'scrolly-overlay-panel';

    searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'scrolly-overlay-search';
    searchInput.placeholder = 'Filter sections…';
    searchInput.addEventListener('input', filterEntries);

    // Groups mirror navTree: a parent entry followed by its own indented list
    // of child entries, so the DOM structure itself carries the hierarchy.
    const list = document.createElement('div');
    list.className = 'scrolly-overlay-list';
    navTree.forEach(node => {
      const group = document.createElement('div');
      group.className = 'scrolly-overlay-group';

      const entry = document.createElement('button');
      entry.type = 'button';
      entry.className = 'scrolly-overlay-entry' +
        (node.level === 'header' ? ' scrolly-overlay-entry--header' : '');
      entry.textContent = node.title;
      entry.addEventListener('click', () => jumpTo(node.index));
      group.appendChild(entry);
      overlayEntries.push(entry);
      const groupEntries = [entry];

      if (node.children.length) {
        const childList = document.createElement('div');
        childList.className = 'scrolly-overlay-children';
        node.children.forEach(item => {
          const childEntry = document.createElement('button');
          childEntry.type = 'button';
          childEntry.className = 'scrolly-overlay-entry' +
            (item.level === 3 ? ' scrolly-overlay-entry--h3' : '') +
            (item.level === 'fig' ? ' scrolly-overlay-entry--fig' : '');
          childEntry.textContent = item.title;
          childEntry.addEventListener('click', () => jumpTo(item.index));
          childList.appendChild(childEntry);
          overlayEntries.push(childEntry);
          groupEntries.push(childEntry);
        });
        group.appendChild(childList);
      }
      overlayGroups.push({ group, entries: groupEntries });
      list.appendChild(group);
    });

    panel.appendChild(searchInput);
    panel.appendChild(list);
    overlay.appendChild(backdrop);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  function filterEntries() {
    const q = searchInput.value.trim().toLowerCase();
    overlayEntries.forEach((e, k) => {
      e.classList.toggle('is-hidden', q !== '' && !navItems[k].title.toLowerCase().includes(q));
    });
    // Hide a group entirely once none of its entries (parent or children)
    // survived the filter, so no empty divider is left behind.
    overlayGroups.forEach(({ group, entries }) => {
      group.classList.toggle('is-hidden', entries.every(e => e.classList.contains('is-hidden')));
    });
  }

  function openOverlay() {
    overlayOpen = true;
    overlay.classList.add('is-open');
    overlayBtn.setAttribute('aria-expanded', 'true');
    // Keep the current item in view; only steal focus on desktop so mobile
    // doesn't pop the on-screen keyboard.
    const active = overlayEntries[activeIn(navItems)];
    if (active) active.scrollIntoView({ block: 'center' });
    if (window.matchMedia('(min-width: 769px)').matches) searchInput.focus();
  }
  function closeOverlay() {
    overlayOpen = false;
    overlay.classList.remove('is-open');
    overlayBtn.setAttribute('aria-expanded', 'false');
  }

  // One gesture = one step. The cooldown (min 0.7s) absorbs the burst of wheel
  // events a single physical scroll produces, so scenes can't be skipped.
  function step(delta) {
    if (locked) return;
    goTo(current + (delta > 0 ? 1 : -1));
    locked = true;
    gsap.delayedCall(Math.max(TOTAL, 0.7), () => { locked = false; });
  }

  // A tall scene scrolls internally first; we only advance once its edge in the
  // travel direction is reached. Returns true while there's room to scroll.
  function canScrollWithin(delta) {
    const el = scenes[current];
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 1) return false;
    if (delta > 0) return el.scrollTop < max - 1;   // room below
    if (delta < 0) return el.scrollTop > 1;          // room above
    return false;
  }

  window.addEventListener('wheel', (e) => {
    if (overlayOpen) return;
    // Scroll within a tall scene before advancing to the next/previous one.
    if (canScrollWithin(e.deltaY)) return;
    e.preventDefault();
    step(e.deltaY);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (overlayOpen) closeOverlay();
      return;
    }
    if (overlayOpen) return;
    const next = e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown';
    const prev = e.key === 'ArrowUp' || e.key === 'PageUp';
    if (!next && !prev) return;
    const delta = next ? 1 : -1;
    // Scroll within a tall scene before advancing.
    if (canScrollWithin(delta)) {
      e.preventDefault();
      const el = scenes[current];
      el.scrollBy({ top: delta * el.clientHeight * 0.8, behavior: 'smooth' });
      return;
    }
    e.preventDefault();
    step(delta);
  });

  let touchStartY = 0;
  window.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (overlayOpen) return;
    const diff = touchStartY - e.changedTouches[0].clientY;
    if (Math.abs(diff) < 30) return;
    if (canScrollWithin(diff)) return;   // still room to scroll the scene
    step(diff);
  }, { passive: true });

  // Build the nav aid and sync initial state.
  buildOverlay();
  updateNav();
})();
