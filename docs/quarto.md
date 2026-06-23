# Authoring a Quarto data story

_Last updated: 2026-06-23_

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
3. Read data relative to the story folder; **don't use `here::here()`**.
4. Give the front matter a real `description` and an ISO `date`.
5. Make sure your R packages are installed, then run `scripts/build-stories.sh`.

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
bibliography: references.bib   # optional
csl: ...                       # optional
---
```

- **`description`** populates the story card. A `subtitle:` alone does *not* — add a
  `description`.
- **`date`** must be `YYYY-MM-DD`. `date: "2026"` produces an invalid Zola date.

## 3. Setup chunk and design tokens

Pull in the shared tokens + plotly theme helper from the setup chunk:

```r
#| label: setup
source(file.path(Sys.getenv("QUARTO_PROJECT_DIR"), "_setup.R"))
```

This gives you two things, both generated from `sass/_tokens.scss` (the single source of truth):

- **The palette as R variables** — `accent`, `accent_dark`, `accent_light`, `paper`,
  `warm_gray`, `warm_gray_dark`, `warm_gray_light`, `black`, `white`, plus `font` and
  `font_heading`. Use them anywhere a chart takes a color, instead of hardcoding hex values.
- **`zola_style(p, ytitle, xtitle)`** — a plotly theme that applies the site font, paper
  background, muted gridlines, and hides the Plotly toolbar. Pass the axis titles via
  `ytitle` / `xtitle` (both default to a placeholder).

### Applying it to a Plotly figure

Color the series with palette variables, then pipe the figure through `zola_style()`:

```r
#| label: fig-trend
#| fig-cap: "A caption describing what this chart shows"
plot_ly(df, x = ~year, y = ~value,
        type = "scatter", mode = "lines+markers",
        line   = list(color = accent_dark, width = 3),
        marker = list(color = accent_dark, size = 7)) |>
  zola_style(ytitle = "A measured value", xtitle = "Year")
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

**Do not use `here::here(...)`** — `here` anchors to the git/project root, not your story
folder, so `here("data", ...)` points at the wrong place.

## 5. Figures

Both kinds work and are inlined by `embed-resources`, so the fragment stays self-contained:

- **Pre-rendered images:** `knitr::include_graphics("output/figures/fig1.png")` (relative path).
- **Interactive widgets:** plotly and leaflet render inline.

For visual parity with the site, color charts with the tokens from `_setup.R` (or
`zola_style()` for plotly). **Pre-baked PNGs keep whatever palette they were generated
with** — if you want them on-brand, regenerate them using the site tokens.

## 6. R package dependencies

[The Quarto toolchain setup](development.md#data-stories-quarto) covers the baseline
(knitr + plotly). If your story uses more (e.g. `tidyverse`, `scales`, `leaflet`,
`leaflet.extras`, `sf`), install those in your environment and in CI before rendering.

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
