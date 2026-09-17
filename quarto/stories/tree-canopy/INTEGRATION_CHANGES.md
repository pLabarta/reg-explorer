# Integration changes — "Under the Canopy"

This story originated as a standalone Quarto document in the `charlotte-tree-canopy`
repo (`tree-canopy-story.qmd`). The notes below record exactly what changed to make it a
first-class data story in **reg-explorer**, following the folder-based Quarto pipeline
(see `QUARTO.md` / `scripts/build-stories.sh`, modeled on `quarto/stories/wealth-mobility/`).

## Files added to this repo

- `quarto/stories/tree-canopy/index.qmd` — the story source (renamed from
  `tree-canopy-story.qmd`; the folder pipeline expects `<slug>/index.qmd`).
- `quarto/stories/tree-canopy/figures/` — the 6 pre-rendered PNG figures, copied as-is.
- `quarto/stories/tree-canopy/references.bib` — bibliography, copied as-is.
- `quarto/stories/tree-canopy/data/`, `analyze.py`, `figs.py` — the analysis inputs and
  figure-generation scripts, included for reproducibility (the story text states "the
  scripts that produced every figure are in this story's folder"). Not used at render
  time — the story has no code chunks.
- `content/stories/tree-canopy.md` — the Zola companion stub that makes the story appear
  as a `/stories/tree-canopy/` page in listings, latest, and tag filters.

## Not copied

- `story.css` — the standalone document's magazine styling (`.lead` border, custom
  heading/table rules, teal/brown palette). Dropped so the story inherits the site's
  design tokens through the Zola shell (`quarto_story.html`) instead of fighting them.

## Header (YAML) changes in `index.qmd`

The rest of the document (prose, figures, tables, callout, citations) is **unchanged**.
Only the front matter was adapted to the reg-explorer conventions:

| Change | Reason |
|---|---|
| Removed the entire `format: html:` block (`theme: cosmo`, `embed-resources`, `fig-cap-location`, `fig-align`, `css: story.css`) | `quarto/_quarto.yml` owns the output format for every story: a minimal, theme-less, `embed-resources: true` HTML fragment that gets embedded into the Zola page. A per-story `theme: cosmo` would pull in Bootstrap/Cosmo CSS and collide with the site design system. |
| Removed `toc: true`, `toc-location: left`, `number-sections: false` | The scrollytelling shell (`static/scrolly/scrolly.js`) provides its own progress rail + contents overlay; `_quarto.yml` sets `toc: false`. |
| `date: last-modified` → `date: 2026-07-13` | `scripts/build-stories.sh` reads the literal `date:` value into the generated stub as TOML; `last-modified` is not a valid literal date. |
| Added `description:` | Feeds the listing card summary and the page `<meta name="description">`. The standalone doc had none (only a `subtitle`). |
| Added `csl: …/chicago-author-date.csl` | House citation style, matching `quarto/stories/wealth-mobility/`. |
| Kept `title`, `subtitle`, `author`, `bibliography`, `link-citations` | Rendered by Quarto's title block (which `scrolly.js` treats as the opening scene) and the reference list. |

## Companion stub (`content/stories/tree-canopy.md`)

Hand-written rather than auto-generated so the tags/read-time are meaningful (the build
script would emit `tags = []`). Fields:

- `template = "quarto_story.html"` — embeds the rendered fragment in the site shell.
- `[extra] tags = ["environment", "housing"]` — display/filter chips on the listing.
  (Tags live under `[extra]`, the repo's existing convention — they are not wired to
  Zola's `[taxonomies]`, so no `/tags/` pages are generated.)
- `[extra] author`, `read_time` — shown on the story card.

## Build & verification

```
scripts/build-stories.sh tree-canopy   # render → static/quarto/stories/tree-canopy/…
                                        # + extract tree-canopy.fragment.html
zola build                              # assemble the site
```

Verified: all 6 figures inline as base64 (0 external image refs), all 6 `#fig-*` ids
preserved (so the stepper gives them the wide figure column), the bibliography renders
with 0 unresolved `[@…]` citations, no Bootstrap/Cosmo leakage, and the page builds at
`/stories/tree-canopy/` and appears in the `/stories/` listing.
