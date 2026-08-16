# Authoring a Quarto data story

_Last updated: 2026-08-11_

> **Who this is for:** authors of a data story whose charts, maps, and tables are generated
> from analysis code. Assumes you're comfortable with Quarto, R or Python, and the command
> line.

This guide takes a Quarto data story and renders it inside the Carolinas Regional Explorer —
with the site's nav, footer, fonts, and tokens — as a normal `/stories/<slug>/` page. It
applies whether you're **starting a new story here** or **bringing in one you already wrote
elsewhere**; the steps are the same checklist either way.

Unfamiliar with a term — *fragment*, *companion stub*, *front matter*, *freeze*? See the
[Glossary](glossary.md).

---

## TL;DR

1. Put the story at `quarto/stories/<slug>/index.qmd` (folder + data) or `quarto/stories/<slug>.qmd`.
2. Strip the per-document `format:` block — the project owns presentation.
3. Write in **R or Python** (one engine per story); Python stories declare `jupyter: python3`.
4. Read data relative to the story folder; **don't use `here::here()`**.
5. Give the front matter a real `description` and an ISO `date`.
6. Make sure your packages are installed (R packages, or `pip install -r quarto/requirements.txt`
   for Python), then run `scripts/build-stories.sh`.

---

## 1. Folder layout and naming

The build script discovers stories in exactly two shapes:

- **Single file:** `quarto/stories/<slug>.qmd`
- **Folder (use this if you have data/assets):** `quarto/stories/<slug>/index.qmd`

The **folder name is the URL slug**, so keep it clean: lowercase, hyphenated, no typos
(`economic-mobility`, not `econ-movility`). Rename your entry file to `index.qmd`. Keep
datasets and figures inside the folder (e.g. `data/`, `output/figures/`).

Don't commit build artifacts into the folder: no `*.zip` archives, no per-folder
`.gitignore`, and once you've removed the custom theme (step 2) no `custom.scss`/`custom.css`.

**Keep the folder under 20 MB.** A pre-commit hook (enable it with
`git config core.hooksPath .githooks`) and CI both reject a story folder over that
limit — trim or downsample large datasets before committing.

## 2. Front matter: keep metadata, drop presentation

The project's `quarto/_quarto.yml` already sets the output format (`minimal: true`,
`embed-resources: true`) and the site shell (nav + footer) comes from Zola. A per-document
`format:` block **overrides** that and breaks the embed (it re-introduces Bootstrap, a TOC
sidebar, its own theme/fonts, etc.).

**Remove the entire `format:` block**, including extra output formats like `docx`
(`quarto render` builds *every* declared format). Keep only metadata:

```yaml
---
title: "Your story title"
description: "One or two sentences — used for the story card in /stories/."
date: 2026-06-18          # a real ISO date (YYYY-MM-DD). A bare year breaks the companion stub.
author: "Author Name"
jupyter: python3               # Python stories only — omit for R
bibliography: references.bib   # optional
csl: ...                       # optional
---
```

- **`description`** populates the story card. A `subtitle:` alone does *not* — add a
  `description`.
- **`date`** must be `YYYY-MM-DD`. `date: "2026"` produces an invalid Zola date.
- **One engine per story:** write all code cells in R *or* all in Python — don't mix
  `{r}` and `{python}` in one `.qmd`. Quarto infers the engine from the cells, but Python
  stories should declare `jupyter: python3` explicitly so it's visible at a glance.

## 3. Setup chunk and design tokens

Pull in the shared tokens + plotly theme helper from the setup chunk.

**R:**

```r
#| label: setup
source(file.path(Sys.getenv("QUARTO_PROJECT_DIR"), "_setup.R"))
```

**Python:**

```python
#| label: setup
import os, sys
sys.path.insert(0, os.environ["QUARTO_PROJECT_DIR"])
from _setup import *
```

Either way you get the same two things, both generated from `sass/_tokens.scss` (the
single source of truth):

- **The palette as variables** — `accent`, `accent_dark`, `accent_light`, `paper`,
  `warm_gray`, `warm_gray_dark`, `warm_gray_light`, `black`, `white`, plus `font` and
  `font_heading`, and the viz palettes (`viz_categorical`, the `viz_seq_*` /`viz_div_*`
  ramps, `cat_pal(n)`, `ramp(pal, n)`). Use them anywhere a chart takes a color, instead
  of hardcoding hex values.
- **`zola_style(fig, ytitle, xtitle)`** — a plotly theme that applies the site font, paper
  background, muted gridlines, and hides the Plotly toolbar. Pass the axis titles via
  `ytitle` / `xtitle` (both default to a placeholder).

### Applying it to a Plotly figure

Color the series with palette variables, then pass the figure through `zola_style()`.

**R:**

```r
#| label: fig-trend
#| fig-cap: "A caption describing what this chart shows"
plot_ly(df, x = ~year, y = ~value,
        type = "scatter", mode = "lines+markers",
        line   = list(color = accent_dark, width = 3),
        marker = list(color = accent_dark, size = 7)) |>
  zola_style(ytitle = "A measured value", xtitle = "Year")
```

**Python** (build the figure with `plotly.graph_objects`; `zola_style` returns it, so
ending the cell with the call displays the styled figure):

```python
#| label: fig-trend
#| fig-cap: "A caption describing what this chart shows"
import plotly.graph_objects as go

fig = go.Figure(go.Scatter(x=df["year"], y=df["value"],
                           mode="lines+markers",
                           line=dict(color=accent_dark, width=3),
                           marker=dict(color=accent_dark, size=7)))
zola_style(fig, ytitle="A measured value", xtitle="Year")
```

### Applying it to a Leaflet map (or other non-plotly viz)

`zola_style()` is plotly-only, but the **palette variables work anywhere** — so a leaflet (or
ggplot) story still sources `_setup.R` to get them, then styles by hand. Build color ramps and
strokes from the tokens rather than hardcoded hex:

```r
#| label: map
#| column: page
# Sequential ramp from the light paper tone up to the dark accent green.
pal <- colorNumeric(c(paper, accent_dark), domain = counties$value)

leaflet(counties) |>
  addProviderTiles("CartoDB.Positron") |>
  addPolygons(
    fillColor   = ~ pal(value),
    fillOpacity = 0.8,
    color       = white,   # hairline borders between shapes
    weight      = 1,
    label       = ~ name
  ) |>
  addLegend(pal = pal, values = ~ value, title = "A value",
            position = "bottomright")
```

ggplot/leaflet stories don't *need* `zola_style()`, but sourcing `_setup.R` for the palette is
what keeps them on-brand.

## 4. Data paths: relative, not `here()`

The project sets `execute-dir: file`, so each story's code runs **from its own folder**.
Read data with paths relative to the story:

```r
region <- readr::read_csv("data/processed/mobility_region.csv")
```

```python
region = pd.read_csv("data/processed/mobility_region.csv")
```

**Do not use `here::here(...)`** (or Python equivalents that anchor to the repo root) —
`here` anchors to the git/project root, not your story folder, so `here("data", ...)`
points at the wrong place.

## 5. Figures

Both kinds work and are inlined by `embed-resources`, so the fragment stays self-contained:

- **Pre-rendered images:** `knitr::include_graphics("output/figures/fig1.png")` (relative path).
- **Interactive widgets:** plotly and leaflet render inline.

### Title, description, reading tip, and alt text

A pre-rendered image inserted with Markdown syntax can carry four distinct pieces of text,
each with a different job. Set all four — they're cheap to write and each one is used
somewhere:

```md
![Regional tree canopy, area-weighted across all tracts, 2015–2023.](figures/fig1_region_trend.png "Canopy trend, 2015–2023"){#fig-trend fig-scap="The y-axis is zoomed in to show the trend clearly — the visible dip is a real half-point decline across a 44%-canopy region." fig-alt="Line chart of regional tree canopy percentage from 2015 to 2023, showing a peak in 2016 followed by a steady decline to 43.5 percent by 2023." width=80%}
```

| Field | Syntax | Purpose |
|---|---|---|
| **Title** | the quoted string after the image path, `(path "…")` | A short name for the figure. Not shown in the figure itself — Quarto renders it as the `<img>`'s `title` attribute, and the site's scrollytelling nav (`static/scrolly/scrolly.js`) reads that to label this figure's entry in the contents drawer, e.g. "Figure: Canopy trend, 2015–2023". Keep it to a few words. |
| **Description** | the bracketed `![…]` text (`fig-cap`) | The full caption, rendered visibly under the figure. Write it as a sentence a reader skimming past the chart would want. |
| **Reading tip** | `fig-scap="…"` | A short note on *how to read* the chart — a scale quirk, what a color means, which panel to compare against which. Not rendered visually; not shown in the figure or the nav. Despite the name, this project does not use `fig-scap` for its Quarto-standard purpose (a List-of-Figures short caption) — it's repurposed as a reading-tip slot. |
| **Alt text** | `fig-alt="…"` | Screen-reader-only description of what the chart shows — never rendered visually. Describe the shape of the data (trend, comparison, distribution), not just what type of chart it is: "line chart declining from 44% to 43.5%" beats "a line chart". |

If a figure has no title set, the nav drawer falls back to `fig-scap`, then the full caption,
then the figure's id — so the title is optional but recommended once a caption gets long
enough that it's awkward as a nav label.

For figures built with code chunks (`#| label:`/`#| fig-cap:`, see [§3](#3-setup-chunk-and-design-tokens)),
the same fields apply via chunk options: `#| label: fig-trend`, `#| fig-cap: "…"`,
`#| fig-scap: "…"` (reading tip), `#| fig-alt: "…"`. Chunk options have no equivalent to the
Markdown-image title string, so for code-chunk figures the nav falls back to `fig-scap`.

For visual parity with the site, color charts with the tokens from `_setup.R` (or
`zola_style()` for plotly). **Pre-baked PNGs keep whatever palette they were generated
with** — if you want them on-brand, regenerate them using the site tokens.

### Wide-desktop split view: the referenced figure follows the paragraph

On a wide desktop viewport (1200px and up), the scrollytelling stepper (`static/scrolly/scrolly.js`)
splits into two columns: your prose steps one paragraph at a time on the left, exactly as
before, while whichever figure or table the *current* paragraph's `@fig-id`/`@tbl-id`
cross-reference points at is pinned in a synced panel on the right — updating automatically as
the reader advances. On narrower screens, or a story with no figures/tables at all, this is
inert and every block (including figures/tables) is still its own full-screen stop, as before.

**No new syntax is needed** — the existing cross-reference convention (`@fig-trend`, `@tbl-losers`)
already provides the pairing signal; Quarto's rendered `<a class="quarto-xref" href="#fig-trend">`
links in your prose are what the JS reads.

The one authoring rule this adds: **reference at most one figure or table per paragraph.** Only
the *first* `@fig-`/`@tbl-` reference in a paragraph is used to pick what's pinned — if a
paragraph mentions two, only the first pairs correctly and the browser console logs a warning.
Both stories already follow this pattern naturally; if a section needs to discuss two figures,
give each its own paragraph.

A figure or table that no paragraph ever references still renders (reachable via the Contents
drawer, and included in the narrow-mode flow) but logs a console warning, since it likely means
a `@fig-`/`@tbl-` reference was dropped or never added.

## 6. Package dependencies

[The Quarto toolchain setup](development.md#data-stories-quarto) covers the baseline.

- **R:** knitr + plotly. If your story uses more (e.g. `tidyverse`, `scales`, `leaflet`,
  `leaflet.extras`, `sf`), install those in your environment and add them to the CI
  package list (`.github/actions/setup-stories/action.yml`) before rendering.
- **Python:** the baseline lives in `quarto/requirements.txt` (jupyter, plotly, pandas) —
  `pip install -r quarto/requirements.txt` into your venv. If your story needs more
  (e.g. `geopandas`), add it to that same file; CI installs from it too.

## 7. Build and verify

```bash
scripts/build-stories.sh            # render + autogenerate the companion stub + extract fragment
scripts/build-stories.sh <slug>     # just your story
scripts/build-stories.sh --force    # after editing design tokens (busts the freeze cache)
```

The script renders your story, auto-creates `content/stories/<slug>.md` (the companion stub)
from your front matter, and extracts the embeddable fragment. Afterwards:

- Edit the generated stub to set `tags` (and `read_time` if you use it).
- Run `zola serve` and open `/stories/<slug>/` to confirm it renders inside the site shell.

## Caveats

- **Static PNG figures don't pick up site tokens** — regenerate them to match the palette.
- **Citations** need the CSL (often a remote URL) reachable at render time.
- **`embed-resources: true`** inlines everything; large interactive widgets make large pages.
- **Freeze:** after changing tokens or `_setup.R`, frozen stories won't re-render until you
  pass `--force`.
