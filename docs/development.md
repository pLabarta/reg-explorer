# Development

_Last updated: 2026-06-23_

> **Who this is for:** developers changing the site's structure, templates, or styles.
> Assumes you're comfortable with the command line, Git, and editing code.

Terms like *Tera*, *taxonomy*, *design tokens*, *fragment*, and *freeze* are defined in the
[Glossary](glossary.md).

- [Project structure](#project-structure)
- [Adding a new page/section](#adding-a-new-pagesection)
- [Available partials](#available-partials)
- [Styles](#styles)
- [Data stories (Quarto)](#data-stories-quarto)
- [Deploying](#deploying)

---

## Project structure

```
content/          page content and stories (Markdown + TOML front matter)
templates/        Zola/Tera HTML templates
  partials/       reusable layout blocks included by page templates
  tags/           taxonomy templates (list.html, single.html)
sass/             styles (compiled automatically by Zola)
  main.scss       main stylesheet — all component styles
  _nav.scss       navigation and header styles
  _headings.scss  heading styles
  _layout.scss    layout utilities
static/           static assets served as-is (images, fonts)
docs/             project documentation
config.toml       site config and shared content (footer, events, newsletter)
netlify.toml      Netlify build config and redirect rules
```

---

## Adding a new page/section

### 1. Create the content folder

```
content/resources/_index.md
```

```toml
+++
title       = "Resources"
description = "One-line description."
template    = "resources.html"

[extra]
hero_eyebrow = "Label above the hero title"
+++
```

### 2. Create the template

`templates/resources.html` — minimal starting point:

```django
{% extends "base.html" %}

{% block title %}{{ section.title }} &mdash; {{ config.title }}{% endblock %}
{% block description %}{{ section.description }}{% endblock %}

{% block content %}
{% include "partials/hero_textonly.html" %}

<div class="container">
  <div class="page-content">
    {{ section.content | safe }}
  </div>
</div>
{% endblock %}
```

Reuse existing partials as needed — see below.

### 3. Add the nav link

In `templates/base.html`, add a new `<li>` inside `.nav-menu` following the existing pattern:

```html
<li>
  <a href="/resources/"
    {% if current_path == "/resources/" %}class="is-active"{% endif %}>
    Resources
  </a>
</li>
```

Also add a link to the footer sitemap in the same file. Find the `footer-links` list under the "Sitemap" eyebrow and add a `<li>`:

```html
<li><a href="/resources/">Resources</a></li>
```

### 4. (Optional) Add to the home page cards

In `content/_index.md`, add an entry to the `sections` array:

```toml
{ title = "Resources", slug = "resources", description = "...", button = "Explore" }
```

---

## Available partials

| Partial | What it renders |
|---|---|
| `partials/hero_textonly.html` | Text-only hero (title + subtitle, reads from `section.extra`) |
| `partials/hero_withimage.html` | Hero with image on the right |
| `partials/about/section_gray_twocol.html` | Gray two-column section (pass `eyebrow`, `title_left`, `body_left`, `title_right`, `body_right`) |
| `partials/about/section_white.html` | White section, title left / text right (pass `eyebrow`, `title`, `body`) |
| `partials/events.html` | CONNECT + events section (reads from `section.extra.connect` and `config.extra.events`) |
| `partials/newsletter.html` | Newsletter strip (reads from `config.extra.newsletter`) |

Pass variables to partials using `{% set %}` before the `{% include %}`:

```django
{% set eyebrow     = "Label" %}
{% set title_left  = "Left title" %}
{% set body_left   = "Left body." %}
{% set title_right = "Right title" %}
{% set body_right  = "Right body." %}
{% include "partials/about/section_gray_twocol.html" %}
```

---

## Styles

Component styles live in `sass/main.scss`; navigation and header styles in `sass/_nav.scss`.
Zola compiles Sass automatically on build and during `zola serve`.

**Design tokens** (palette, fonts, `$max-w`) are the single source of truth and live in
`sass/_tokens.scss` — `main.scss` imports them, and the Quarto data stories inherit the same
values (generated into `quarto/_tokens.R` by `build-stories.sh`). **Edit token values there,
not in `main.scss`.** The palette is built around the `$accent` / `$accent-dark` greens, the
`$paper` and `$warm-gray-*` neutrals, and `$black` / `$white`, with `$font` (Archivo) for body
text and `$font-heading` (Inter) for headings. See [`sass/_tokens.scss`](../sass/_tokens.scss)
for the current values.

---

## Data stories (Quarto)

Data stories are authored in [Quarto](https://quarto.org/) (`.qmd`) under `quarto/stories/`,
rendered to lean HTML fragments, and embedded into the Zola site at `/stories/<slug>/`. For
how to bring a story into the site (folder layout, front matter, data paths), see
[quarto.md](quarto.md).

### Installing the toolchain

You only need this if you're rendering stories locally — most content work doesn't touch Quarto.

**1. Install the Quarto CLI** — see https://quarto.org/docs/get-started/

**2. Install R**

```bash
# Quick way (Ubuntu's R, fine for this):
sudo apt update
sudo apt install -y r-base

# Or, for a current R version, use CRAN's repo:
sudo apt update && sudo apt install -y --no-install-recommends software-properties-common dirmngr
wget -qO- https://cloud.r-project.org/bin/linux/ubuntu/marutter_pubkey.asc | sudo tee /etc/apt/trusted.gpg.d/cran_ubuntu_key.asc
sudo add-apt-repository "deb https://cloud.r-project.org/bin/linux/ubuntu $(lsb_release -cs)-cran40/"
sudo apt update && sudo apt install -y r-base
```

**3. Install the R packages**

Quarto runs R through the knitr engine, and the stories use plotly for visualizations:

```bash
sudo apt install -y r-cran-knitr r-cran-plotly
```

Individual stories may pull in more packages (see the story's setup chunk). The
`economic-mobility` story loads tidyverse, scales, leaflet, leaflet.extras, and sf:

```bash
Rscript -e 'install.packages(c("tidyverse", "scales", "leaflet", "leaflet.extras", "sf"), repos = "https://cloud.r-project.org")'
```

`sf` needs system geospatial libraries. On Debian/Ubuntu, install them first:

```bash
sudo apt install -y libgdal-dev libgeos-dev libproj-dev libudunits2-dev
```

**4. Verify**

```bash
quarto check knitr   # check the knitr engine
Rscript -e 'library(plotly); cat("plotly", as.character(packageVersion("plotly")), "ready\n")'
```

### Building stories

```bash
scripts/build-stories.sh            # render every story, sync stubs, extract fragments
scripts/build-stories.sh <slug>     # just one story
scripts/build-stories.sh --force    # re-execute from scratch (e.g. after editing tokens)
```

Rendering uses the committed `quarto/_freeze/` cache, so a story's code only re-runs when its
`.qmd` changes. In CI, `.github/workflows/` validates stories on pull requests and re-renders
them on pushes to `main`.

---

## Deploying

Push to `main`; Netlify builds automatically. Full guidance — previewing, pull-request
previews, and fixing failed builds — is in [Deploying](deploying.md).
