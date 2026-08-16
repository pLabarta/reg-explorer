/* Scrollytelling stepper for Quarto stories.
   Each direct child of #scrolly-story becomes a "scene", except a heading is
   always grouped with the paragraph that opens its section (never shown
   alone); one scene is shown at a time and a single scroll gesture / arrow
   key / swipe advances or rewinds one scene.

   On wide viewports (see WIDE_QUERY) figures and tables are pulled out of
   that one-at-a-time flow into a second, non-interactive deck pinned in a
   side panel: whichever figure/table a paragraph's first @fig-/@tbl-
   cross-reference points at is shown next to it automatically, synced from
   the text deck rather than stepped directly. Narrow viewports keep every
   block — including figures/tables — as its own full-screen stop, exactly
   as before this existed.

   The current section is reflected in the URL hash (deep-linkable, via
   history.replaceState so it doesn't spam browser history) and, in reverse,
   a hash present on load determines the starting scene instead of always
   starting at the top.

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

  const DURATION = 0.5;        // fade length per text-deck scene (s)
  const MEDIA_DURATION = 0.35; // fade length for the (unslid) media-deck cross-fade (s)
  const GAP = 0.0;             // pause between the old leaving and the new arriving (s)
  const OFFSET = 40;           // px the text-deck scenes travel as they fade
  const SLIDE = 0.6;           // end-card slide-up length (s)
  const TOTAL = DURATION * 2 + GAP;   // full text-deck transition length

  // Split layout only kicks in above this width — a 720px reading column plus
  // a ~420-560px media column plus stage gutters needs roughly this much room.
  const WIDE_QUERY = '(min-width: 1200px)';
  const wideMode = window.matchMedia(WIDE_QUERY).matches;

  const isHeading = el => el.matches('h1, h2, h3, header') || el.id === 'title-block-header';
  const isMedia = el => el.matches('[id^="fig-"],[id^="tbl-"]') ||
    !!el.querySelector('[id^="fig-"],[id^="tbl-"]');

  // Elements with no text content (e.g. a stray `<hr>` from a `---`
  // divider in the .qmd) never become a scene — they'd just be a blank
  // stop. Previously they were merely skipped, which left them sitting in
  // the DOM outside any scene wrapper: static, un-animated, always visible.
  // Remove them outright so nothing leaks through un-managed.
  const rawContent = [...story.children].filter(el => {
    if (el.nodeType !== 1 || el.matches('style, script, link')) return false;
    if (el.textContent.trim() === '') { el.remove(); return false; }
    return true;
  });
  if (rawContent.length < 2) { reveal(); return; }

  // Original document position of every top-level element, captured before
  // figures/tables get pulled into a separate deck — used only to sort nav
  // entries back into true reading order across the two decks.
  const rawIndexOf = new Map(rawContent.map((el, i) => [el, i]));

  // In wide mode, figures/tables are pulled out of the normal flow to live in
  // their own synced side panel instead of being scene stops themselves.
  const textContent = wideMode ? rawContent.filter(el => !isMedia(el)) : rawContent;
  const mediaContent = wideMode ? rawContent.filter(isMedia) : [];
  // Only actually split the layout if there's something to pin — a story
  // with no figures/tables behaves like narrow mode even on a wide screen.
  const splitMode = wideMode && mediaContent.length > 0;

  // A heading is never its own scene: it's grouped with the paragraph that
  // opens its section, so readers always see "Heading + first sentence"
  // together rather than the heading alone as a scroll stop.
  function groupHeadings(elements) {
    const groups = [];
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (isHeading(el)) {
        const group = [el];
        const next = elements[i + 1];
        if (next && !isHeading(next) && !next.matches('.scrolly-end')) {
          group.push(next);
          i++;
        }
        groups.push(group);
      } else {
        groups.push([el]);
      }
    }
    return groups;
  }

  // Wrap each group's elements in its own centering container (appended to
  // `parent`) rather than turning an element itself into a flex column —
  // flexing a <p> would stack its inline children onto separate lines. The
  // end card is always appended straight to `story` (not a column) so it can
  // slide up full-bleed across both columns in split mode.
  function buildScenes(groups, parent) {
    return groups.map(group => {
      const scene = document.createElement('div');
      // Figure/table scenes get a wider reading column; end scene is the
      // full-bleed footer card.
      const isFig = group.some(el =>
        el.querySelector('[id^="fig-"],[id^="tbl-"]') || /^(fig|tbl)-/.test(el.id || ''));
      const isEnd = group.some(el => el.matches('.scrolly-end'));
      scene.className = 'scrolly-scene' +
        (isEnd ? ' scrolly-scene--end' : isFig ? ' scrolly-scene--fig' : '');
      (isEnd ? story : parent).appendChild(scene);
      group.forEach(el => scene.appendChild(el));
      return scene;
    });
  }

  let textCol = story;
  let mediaCol = null;
  if (splitMode) {
    // Both start applied synchronously, before first paint, so the panel
    // never flashes visible-then-collapsing on load — the initial-state
    // block below (after the deep-link target is resolved) is what decides
    // whether to reveal it, same as any later scene change.
    story.classList.add('scrolly-stage--split', 'scrolly-stage--media-hidden', 'scrolly-stage--media-collapsed');
    textCol = document.createElement('div');
    textCol.className = 'scrolly-text-col';
    mediaCol = document.createElement('div');
    mediaCol.className = 'scrolly-media-col';
    story.appendChild(textCol);
    story.appendChild(mediaCol);
  }

  const textGroups = groupHeadings(textContent);
  const textScenes = buildScenes(textGroups, textCol);
  const mediaGroups = mediaContent.map(el => [el]);
  const mediaScenes = mediaCol ? buildScenes(mediaGroups, mediaCol) : [];

  // Original position of each scene's representative element (the heading,
  // or the sole element for a media/standalone-paragraph scene) — used only
  // to sort nav entries from both decks back into true reading order.
  const textPos = textGroups.map(g => rawIndexOf.get(g[0]));
  const mediaPos = mediaContent.map(el => rawIndexOf.get(el));

  // ---- Text scene → media scene association (split mode only) ----
  // Quarto renders @fig-id / @tbl-id cross-refs in prose as
  // <a class="quarto-xref" href="#fig-id">. That's the only signal needed —
  // no new .qmd syntax required.
  const mediaIndexById = {};
  mediaScenes.forEach((scene, i) => {
    const el = scene.firstElementChild;
    if (el) mediaIndexById[el.id] = i;
  });

  const textToMedia = [];      // textScenes index -> mediaScenes index (or undefined)
  const mediaFirstRef = {};    // media id -> first textScenes index that references it
  if (mediaScenes.length) {
    textScenes.forEach((scene, i) => {
      const refs = scene.querySelectorAll('a.quarto-xref[href^="#fig-"], a.quarto-xref[href^="#tbl-"]');
      if (!refs.length) return;
      if (refs.length > 1) {
        console.warn('[scrolly] text scene references multiple figures/tables; ' +
          'only the first is pinned in the side panel.', scene);
      }
      const id = refs[0].getAttribute('href').slice(1);
      const mIndex = mediaIndexById[id];
      if (mIndex === undefined) return;
      textToMedia[i] = mIndex;
      if (!(id in mediaFirstRef)) mediaFirstRef[id] = i;
    });
    // Figures/tables no paragraph ever references — still reachable via the
    // Contents drawer (falls back to the last text scene), but flagged for authors.
    Object.keys(mediaIndexById).forEach(id => {
      if (!(id in mediaFirstRef)) console.warn('[scrolly] figure/table "' + id + '" is never referenced by any paragraph.');
    });
  }

  // ---- Section model for the nav aid + deep-linking ----
  // Scan the text deck for headers/H2/H3, and (narrow mode only, since split
  // mode pulled them out) any figures/tables still embedded as text scenes.
  // Separately scan the media deck (split mode only) for the real fig/tbl
  // entries. `pos` (true document order, captured pre-split) sorts the two
  // back into one reading-order list; `deck`+`index` are the real jump target.
  function mediaLabel(el) {
    const isTbl = /^tbl-/.test(el.id || '');
    const img = el.querySelector('img');
    const imgTitle = img ? img.getAttribute('title') : '';
    const scap = el.getAttribute('data-fig-scap');
    const caption = el.querySelector('figcaption');
    // Quarto's own caption text is pre-numbered ("Figure 1: "/"Table 1: ") —
    // strip that so it isn't doubled under our own label.
    const captionText = caption
      ? caption.textContent.trim().replace(/^(Figure|Table)\s+\S+:\s*/, '')
      : '';
    const label = imgTitle || scap || captionText || el.id.replace(/^(fig|tbl)-/, '');
    return (isTbl ? 'Table: ' : 'Figure: ') + label;
  }

  const items = [];
  textScenes.forEach((scene, i) => {
    const el = scene.firstElementChild;
    if (!el) return;
    // The Quarto title block (title + subtitle + author + date).
    if (el.matches('header') || el.id === 'title-block-header') {
      const h1 = el.querySelector('h1, .title');
      items.push({
        index: i, deck: 'text', level: 'header', id: el.id || 'top',
        title: h1 ? h1.textContent.trim() : 'Introduction', pos: textPos[i],
      });
      return;
    }
    if (el.matches('h2, h3')) {
      items.push({
        index: i, deck: 'text', level: el.tagName === 'H2' ? 2 : 3,
        id: el.id, title: el.textContent.trim(), pos: textPos[i],
      });
      return;
    }
    const media = scene.querySelector('[id^="fig-"],[id^="tbl-"]');
    if (media) {
      items.push({ index: i, deck: 'text', level: 'fig', id: media.id, title: mediaLabel(media), pos: textPos[i] });
    }
  });
  mediaScenes.forEach((scene, i) => {
    const el = scene.firstElementChild;
    if (!el) return;
    items.push({ index: i, deck: 'media', level: 'fig', id: el.id, title: mediaLabel(el), pos: mediaPos[i] });
  });

  // One ordered nav list drives the contents drawer. It's flat (for the
  // search filter) but also grouped into a parent/child tree: each header or
  // H2 is a parent, and the H3s/figures/tables that follow it (until the
  // next parent) are its children — mirrors the story's own section hierarchy.
  const navItems = items.sort((a, b) => a.pos - b.pos);
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

  // ---- Deep-linking: per-scene hash within each section ----
  // A section's heading scene links as `#heading-id`; each subsequent scene
  // within that section (a standalone paragraph, a callout, anything not a
  // new heading) links as `#heading-id-2`, `#heading-id-3`, etc. — so a link
  // can point at the exact part of a section, not just the section itself.
  const sectionPartHash = [];      // textScenes index -> hash string (no leading #)
  const textIndexByHash = {};      // hash string -> textScenes index
  {
    let sectionId = null;
    let part = 0;
    textScenes.forEach((scene, i) => {
      const el = scene.firstElementChild;
      const isSectionStart = el && (el.matches('header, h1, h2, h3') || el.id === 'title-block-header');
      if (isSectionStart) {
        sectionId = el.id || 'top';
        part = 1;
      } else {
        part += 1;
      }
      const hash = part > 1 ? sectionId + '-' + part : sectionId;
      sectionPartHash[i] = hash;
      if (hash && !(hash in textIndexByHash)) textIndexByHash[hash] = i;
    });
  }

  // ---- Deep-linking: resolve the starting scene from location.hash ----
  // A hash matching a section or a numbered part within one (see above)
  // starts there directly; one matching a figure/table's own id starts at
  // the paragraph that references it (or, for an orphan nobody references,
  // the last text scene) with that item shown. Falls back to the very start
  // when there's no hash or no match.
  function resolveInitialTarget() {
    const hashId = decodeURIComponent(location.hash.slice(1));
    if (!hashId) return { textIndex: 0 };
    if (hashId in textIndexByHash) return { textIndex: textIndexByHash[hashId] };
    const mediaItem = navItems.find(it => it.deck === 'media' && it.id === hashId);
    if (mediaItem) {
      const ref = mediaFirstRef[hashId];
      return ref !== undefined
        ? { textIndex: ref, mediaIndex: mediaItem.index }
        : { textIndex: textScenes.length - 1, mediaIndex: mediaItem.index };
    }
    return { textIndex: 0 };
  }
  const initialTarget = resolveInitialTarget();

  // ---- Cross-fade deck ----
  // driven decks (the text deck in both modes) get the existing slide+fade
  // transition, the end-card special case, and are the ones user input
  // (wheel/keys/touch/nav clicks) steps directly. The media deck (wide mode
  // only) is never stepped directly — it's synced from the text deck — so it
  // uses a plain cross-fade with no cooldown gate, or its swap would lag a
  // beat behind the paragraph that just introduced it.
  function createDeck(scenes, driven, startIndex) {
    let current = startIndex || 0;
    const listeners = [];
    gsap.set(scenes, { autoAlpha: 0 });
    if (scenes.length) gsap.set(scenes[current], { autoAlpha: 1 });

    function goTo(index) {
      index = Math.max(0, Math.min(index, scenes.length - 1));
      if (index === current) return;
      // dir = 1 forward → everything travels upward (old exits up, new rises
      // from below); dir = -1 backward mirrors it.
      const dir = index > current ? 1 : -1;
      const leaving = scenes[current];
      const entering = scenes[index];
      entering.scrollTop = 0;
      current = index;

      const tl = gsap.timeline({
        // Plotly figures laid out while hidden render at width 0 — nudge a reflow.
        onStart: () => window.dispatchEvent(new Event('resize')),
      });

      if (driven && entering.classList.contains('scrolly-scene--end')) {
        // Footer slides up from the bottom, over the current scene (no fade).
        tl.set(leaving, { autoAlpha: 1, y: 0 })
          .fromTo(entering,
            { autoAlpha: 1, yPercent: 100 },
            { autoAlpha: 1, yPercent: 0, duration: SLIDE, ease: 'power2.out' }, 0);
      } else if (driven && leaving.classList.contains('scrolly-scene--end')) {
        // Footer slides back down out of view, revealing the previous scene.
        tl.set(entering, { autoAlpha: 1, y: 0 })
          .to(leaving, { yPercent: 100, duration: SLIDE, ease: 'power2.in' }, 0)
          .set(leaving, { autoAlpha: 0, yPercent: 0 });
      } else if (driven) {
        tl.to(leaving, { autoAlpha: 0, y: -OFFSET * dir, duration: DURATION }, 0)
          .fromTo(entering,
            { autoAlpha: 0, y: OFFSET * dir },
            { autoAlpha: 1, y: 0, duration: DURATION }, DURATION + GAP);
      } else {
        // Media deck: plain cross-fade, no slide — it shouldn't visually
        // compete with the text deck's directional slide.
        tl.to(leaving, { autoAlpha: 0, duration: MEDIA_DURATION }, 0)
          .to(entering, { autoAlpha: 1, duration: MEDIA_DURATION }, 0);
      }

      listeners.forEach(cb => cb(current));
    }

    return {
      scenes,
      goTo,
      current: () => current,
      onChange: cb => listeners.push(cb),
    };
  }

  const textDeck = createDeck(textScenes, true, initialTarget.textIndex);
  const mediaDeck = mediaScenes.length ? createDeck(mediaScenes, false, initialTarget.mediaIndex) : null;
  reveal();

  document.body.classList.add('scrolly-active');

  let locked = false;
  let overlayOpen = false;

  // Reveals the panel, fading it in *with* the entering text scene: called
  // at t=DURATION (the midpoint — see syncMedia), it snaps the width open
  // and sets the right figure/table instantly (both invisible, opacity
  // still 0 at this exact instant), then removes --media-hidden so opacity
  // transitions 0→1 over the next DURATION — ending exactly when the
  // entering text scene finishes its own fade-in. updateNav() runs here
  // (not just at the call site) so the drawer's "active figure" highlight
  // updates in step with what's actually now showing, rather than one
  // scene behind while the reveal is still pending.
  function revealMedia(index) {
    story.classList.remove('scrolly-stage--media-collapsed');
    if (index !== mediaDeck.current()) mediaDeck.goTo(index);
    story.classList.remove('scrolly-stage--media-hidden');
    updateNav();
  }
  // Hides the panel, fading it out *with* the leaving text scene: called at
  // t=0 (see syncMedia), it adds --media-hidden immediately so opacity
  // transitions 1→0 over DURATION, in sync with the leaving text scene's
  // own fade — then, once that's finished, snaps the width closed
  // (invisible already, so the resize itself is never seen).
  function hideMedia() {
    story.classList.add('scrolly-stage--media-hidden');
    setTimeout(() => story.classList.add('scrolly-stage--media-collapsed'), DURATION * 1000);
  }
  // Every text scene decides for itself, independently — a figure/table
  // does NOT stay pinned once its paragraph is behind you. A scene with no
  // reference of its own hides the panel and goes full-width/centered,
  // rather than holding onto whatever was last shown.
  function syncMedia(textIndex) {
    if (!mediaDeck) return;
    const m = textToMedia[textIndex];
    if (m !== undefined) {
      setTimeout(() => revealMedia(m), DURATION * 1000);
    } else {
      hideMedia();
    }
  }

  // Apply the resolved deep-link's panel state instantly on load — no delay,
  // no transition, since there's no leaving/entering scene fade to sync
  // with on first paint (that's only for later, real scene changes).
  if (splitMode) {
    const initialMediaIndex = initialTarget.mediaIndex !== undefined
      ? initialTarget.mediaIndex : textToMedia[initialTarget.textIndex];
    if (initialMediaIndex !== undefined) {
      story.classList.remove('scrolly-stage--media-collapsed', 'scrolly-stage--media-hidden');
    }
  }

  // Lock-respecting step of the text deck; media follows via textDeck.onChange.
  function jumpText(index) {
    if (!locked && index !== textDeck.current()) {
      textDeck.goTo(index);
      locked = true;
      gsap.delayedCall(Math.max(TOTAL, 0.7), () => { locked = false; });
    }
  }

  // A nav click on a figure/table jumps the text deck to the paragraph that
  // first references it (natural sync then shows it); an orphan figure/table
  // (no referencing paragraph) jumps to the last text scene and force-shows
  // the media deck directly, since nothing will sync it there naturally.
  function jumpTo(item) {
    if (item.deck === 'media') {
      const target = mediaFirstRef[item.id];
      if (target !== undefined) {
        jumpText(target);
      } else {
        jumpText(textDeck.scenes.length - 1);
        setTimeout(() => revealMedia(item.index), DURATION * 1000);
      }
    } else {
      jumpText(item.index);
    }
    closeOverlay();
  }

  textDeck.onChange(index => {
    syncMedia(index);
    updateNav();
  });

  // ---- Navigation aid (searchable contents drawer) + URL hash sync ----

  // Index of the furthest-reached item in a list, by a given current index.
  function activeIn(list, cur) {
    let s = -1;
    list.forEach((item, k) => { if (cur >= item.index) s = k; });
    return s;
  }

  // Mirrors the current scene into the URL hash (deep-linkable down to the
  // exact part of a section, per sectionPartHash above) without adding a
  // browser-history entry per scene — replaceState only.
  function updateHash(textIndex) {
    const hash = sectionPartHash[textIndex];
    if (!hash) return;
    const newHash = '#' + hash;
    if (location.hash !== newHash) history.replaceState(null, '', newHash);
  }

  function updateNav() {
    const textItems = navItems.filter(it => it.deck === 'text');
    const aText = activeIn(textItems, textDeck.current());
    const activeTextItem = aText >= 0 ? textItems[aText] : null;
    updateHash(textDeck.current());
    // A media item only counts as "active" when the current text scene is
    // the one that actually references it — matches the no-hold-over sync.
    const activeMediaIndex = mediaDeck && textToMedia[textDeck.current()] !== undefined
      ? mediaDeck.current() : -1;
    overlayEntries.forEach((entry, k) => {
      const item = navItems[k];
      const isActive = item.deck === 'media'
        ? item.index === activeMediaIndex
        : (item === activeTextItem);
      entry.classList.toggle('is-active', isActive);
    });
  }

  // Nav DOM, populated by buildOverlay().
  const overlayEntries = [];
  const overlayGroups = [];
  let overlay, overlayBtn, searchInput;

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
      entry.addEventListener('click', () => jumpTo(node));
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
          childEntry.addEventListener('click', () => jumpTo(item));
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
    const active = overlay.querySelector('.scrolly-overlay-entry.is-active');
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
  // Only the text deck is ever driven directly — the media deck (split mode)
  // follows automatically via textDeck.onChange.
  function step(delta) {
    if (locked) return;
    textDeck.goTo(textDeck.current() + (delta > 0 ? 1 : -1));
    locked = true;
    gsap.delayedCall(Math.max(TOTAL, 0.7), () => { locked = false; });
  }

  // A tall scene scrolls internally first; we only advance once its edge in the
  // travel direction is reached. Returns true while there's room to scroll.
  function canScrollWithin(delta) {
    const el = textDeck.scenes[textDeck.current()];
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
      const el = textDeck.scenes[textDeck.current()];
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

  // The split/narrow decision is made once at load — crossing the breakpoint
  // (window resize, tablet rotation) reloads rather than trying to
  // re-partition the DOM live, since the split is a real structural change,
  // not just a CSS reflow.
  window.matchMedia(WIDE_QUERY).addEventListener('change', (e) => {
    if (e.matches !== wideMode) location.reload();
  });

  // Build the nav aid and sync initial state.
  buildOverlay();
  updateNav();
})();
