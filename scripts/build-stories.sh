#!/usr/bin/env bash
#
# Run the full Quarto render pipeline for the data stories: process the project
# (theme SCSS, freeze cache, includes) and write the rendered HTML + widget deps
# into static/quarto/. It also autogenerates the Zola companion stubs in
# content/stories/ so each story shows up in the /stories/ grid.
#
# This does NOT run `zola build` — assembling the final site (which copies
# static/quarto/ into public/) is a separate step run afterwards.
#
# Usage:
#   scripts/build-stories.sh             # render every story in quarto/
#   scripts/build-stories.sh <slug>      # render a single story (quarto/stories/<slug>[/index].qmd)
#   scripts/build-stories.sh --force     # bust the freeze cache: re-execute & overwrite ALL
#   scripts/build-stories.sh --force <slug>   # force re-render of just that story
#   scripts/build-stories.sh --check     # verify quarto/_tokens.R and quarto/_tokens.py match
#                                          sass/_tokens.scss (writes/renders nothing; exit 1 if drifted)
#
# Requires the Quarto CLI + R (knitr/plotly) for R stories, and Python with the packages in
# quarto/requirements.txt (jupyter/plotly) for Python stories — see Installing-quarto.md.
# Rendering uses the committed quarto/_freeze/ cache, so a story's code only re-runs
# when its .qmd changes (freeze: auto in _quarto.yml). --force drops that cache so the
# code re-executes from scratch, and overwrites rendered output, fragments, and stubs.

set -euo pipefail

# This script lives in <repo>/scripts/ — resolve the repo root and quarto project.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
QUARTO_DIR="$ROOT_DIR/quarto"
STUBS_DIR="$ROOT_DIR/content/stories"
FORCE=0
CHECK=0

# Parse args: optional --force/-f, --check, plus an optional <slug>.
positional=()
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=1 ;;
    --check)    CHECK=1 ;;
    *)          positional+=("$arg") ;;
  esac
done

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: 'python3' is required for token generation and fragment extraction." >&2
  exit 1
fi

# --check only needs python + the SCSS; rendering needs the full Quarto toolchain.
if [ "$CHECK" -ne 1 ]; then
  if ! command -v quarto >/dev/null 2>&1; then
    echo "Error: the 'quarto' CLI is not installed. See Installing-quarto.md." >&2
    exit 1
  fi
  if [ ! -f "$QUARTO_DIR/_quarto.yml" ]; then
    echo "Error: Quarto project not found at $QUARTO_DIR (_quarto.yml missing)." >&2
    exit 1
  fi
fi

# Derive the token assignments from sass/_tokens.scss (single source of truth) → stdout.
#   $1 = target language: "r" (_tokens.R) or "py" (_tokens.py)
tokens_expected() {
  python3 - "$ROOT_DIR/sass/_tokens.scss" "$1" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
lang = sys.argv[2]
assign, vec_open, vec_close = ("<-", "c(", ")") if lang == "r" else ("=", "[", "]")
out = ["# AUTO-GENERATED from sass/_tokens.scss by scripts/build-stories.sh — do not edit.\n"]
for name, val in re.findall(r"^\$([a-z0-9-]+):\s*(.+?);", src, re.M):
    tname = name.replace("-", "_")
    if name.startswith("viz-"):
        # Data-viz palette: emit the list of hex colors as an R vector / Python list.
        colors = re.findall(r"#[0-9A-Fa-f]{3,8}", val)
        vec = ", ".join(f'"{c}"' for c in colors)
        out.append(f'{tname} {assign} {vec_open}{vec}{vec_close}\n')
    elif val.startswith("#"):
        out.append(f'{tname} {assign} "{val}"\n')
    elif name in ("font", "font-heading"):
        v = val.replace('"', '\\"')
        out.append(f'{tname} {assign} "{v}"\n')
sys.stdout.write("".join(out))
PY
}

# Write quarto/_tokens.R and quarto/_tokens.py from the SCSS tokens so stories share one
# source of truth for the palette/fonts (neither runtime can read the CSS at render time).
# _setup.R sources the R file; _setup.py imports the Python one.
generate_tokens() {
  echo "Generating quarto/_tokens.R and quarto/_tokens.py from sass/_tokens.scss ..."
  tokens_expected r  > "$QUARTO_DIR/_tokens.R"
  tokens_expected py > "$QUARTO_DIR/_tokens.py"
}

# Verify the generated token files match sass/_tokens.scss without writing. Returns 1 if drifted.
check_tokens() {
  local status=0 lang file
  for lang in r py; do
    file="_tokens.R"; [ "$lang" = "py" ] && file="_tokens.py"
    echo "Checking quarto/$file is in sync with sass/_tokens.scss ..."
    if [ ! -f "$QUARTO_DIR/$file" ]; then
      echo "  OUT OF SYNC: quarto/$file is missing (run scripts/build-stories.sh to generate it)." >&2
      status=1
      continue
    fi
    if diff -u "$QUARTO_DIR/$file" <(tokens_expected "$lang") >/dev/null; then
      echo "  in sync."
    else
      echo "  OUT OF SYNC: quarto/$file differs from sass/_tokens.scss:" >&2
      diff -u "$QUARTO_DIR/$file" <(tokens_expected "$lang") >&2 || true
      status=1
    fi
  done
  return "$status"
}

# Read a value from a .qmd's YAML front matter (first ---...--- block). Strips quotes.
fm_value() {
  awk -v key="$2" '
    /^---[[:space:]]*$/ { fm++; next }
    fm==1 && $0 ~ "^"key":" {
      sub("^"key":[[:space:]]*", ""); gsub(/^"|"$/, ""); print; exit
    }
  ' "$1"
}

# Create a Zola companion stub for a story if one does not already exist.
#   $1 = qmd path   $2 = slug
generate_stub() {
  local qmd="$1" slug="$2"
  local stub="$STUBS_DIR/${slug}.md"
  if [ -f "$stub" ] && [ "$FORCE" -ne 1 ]; then
    echo "  stub exists, skipping: content/stories/${slug}.md"
    return
  fi
  local rel="${qmd#"$QUARTO_DIR"/}"
  local title desc date author
  title="$(fm_value "$qmd" title)";       [ -n "$title" ] || title="$slug"
  desc="$(fm_value "$qmd" description)"
  date="$(fm_value "$qmd" date)"
  author="$(fm_value "$qmd" author)"
  {
    echo "+++"
    echo "# Auto-generated companion stub for a Quarto data story (scripts/build-stories.sh)."
    echo "# Body is authored in quarto/${rel} and embedded via quarto_story.html."
    echo "# Edit tags/read_time as needed."
    echo "title = \"${title}\""
    [ -n "$date" ] && echo "date = ${date}"
    [ -n "$desc" ] && echo "description = \"${desc}\""
    echo "template = \"quarto_story.html\""
    echo ""
    echo "[extra]"
    echo "tags = []"
    [ -n "$author" ] && echo "author = \"${author}\""
    echo "+++"
  } > "$stub"
  echo "  wrote stub: content/stories/${slug}.md"
}

# Extract a lean, self-contained fragment (head <style>/<script> + body) from a
# rendered Quarto page, so quarto_story.html can embed it inside the Zola shell.
#   $1 = rendered html   $2 = output fragment path
extract_fragment() {
  python3 - "$1" "$2" <<'PY'
import re, sys
src = open(sys.argv[1], encoding="utf-8").read()
head = re.search(r"<head[^>]*>(.*?)</head>", src, re.S)
body = re.search(r"<body[^>]*>(.*?)</body>", src, re.S)
# Keep the inlined deps (styles/scripts) from <head>; drop meta/title/base/link chrome.
deps = "".join(re.findall(r"<style.*?</style>|<script.*?</script>", head.group(1) if head else "", re.S))
inner = body.group(1) if body else src
out = deps + "\n" + inner

# Dedupe repeated large inline <script> blocks. plotly.py embeds a full copy of
# plotly.js in every figure's output (unlike R htmlwidgets, which shares one), so a
# multi-figure Python story inlines the same ~5 MB library N times. Byte-identical
# script blocks are pure duplicates (the library just redefines itself), so keep the
# first and drop the rest. Figure payloads differ per figure and are untouched.
seen = set()
def dedupe(m):
    block = m.group(0)
    if len(block) > 100_000:
        if block in seen:
            return ""
        seen.add(block)
    return block
out = re.sub(r"<script[^>]*>.*?</script>", dedupe, out, flags=re.S)

open(sys.argv[2], "w", encoding="utf-8").write(out)
PY
}

# Sweep all stories: ensure a stub exists and extract the rendered fragment.
#   single file:  stories/<slug>.qmd        → static/quarto/stories/<slug>.html
#   folder:       stories/<slug>/index.qmd  → static/quarto/stories/<slug>/index.html
#   fragment (both): static/quarto/stories/<slug>.fragment.html
process_stories() {
  echo "Syncing stubs and extracting fragments ..."
  shopt -s nullglob
  local qmd dir slug out
  local out_base="$ROOT_DIR/static/quarto/stories"
  for qmd in "$QUARTO_DIR"/stories/*.qmd; do
    slug="$(basename "$qmd" .qmd)"
    generate_stub "$qmd" "$slug"
    out="$out_base/${slug}.html"
    [ -f "$out" ] && extract_fragment "$out" "$out_base/${slug}.fragment.html" \
      && echo "  fragment: static/quarto/stories/${slug}.fragment.html"
  done
  for dir in "$QUARTO_DIR"/stories/*/; do
    qmd="${dir}index.qmd"
    [ -f "$qmd" ] || continue
    slug="$(basename "$dir")"
    generate_stub "$qmd" "$slug"
    out="$out_base/${slug}/index.html"
    [ -f "$out" ] && extract_fragment "$out" "$out_base/${slug}.fragment.html" \
      && echo "  fragment: static/quarto/stories/${slug}.fragment.html"
  done
  shopt -u nullglob
}

if [ "$CHECK" -eq 1 ]; then
  if check_tokens; then exit 0; else exit 1; fi
fi

cd "$QUARTO_DIR"

generate_tokens

if [ "${#positional[@]}" -ge 1 ]; then
  slug="${positional[0]%.qmd}"           # tolerate a trailing .qmd in the argument
  # A story is either a single file (stories/<slug>.qmd) or a folder (stories/<slug>/index.qmd).
  if [ -f "stories/${slug}.qmd" ]; then
    target="stories/${slug}.qmd"
  elif [ -f "stories/${slug}/index.qmd" ]; then
    target="stories/${slug}/index.qmd"
  else
    echo "Error: story not found: quarto/stories/${slug}.qmd or quarto/stories/${slug}/index.qmd" >&2
    exit 1
  fi
  if [ "$FORCE" -eq 1 ]; then
    echo "Force: dropping freeze cache for ${slug}"
    rm -rf "_freeze/stories/${slug}"
  fi
  echo "Rendering single story: ${target}"
  quarto render "$target"
else
  if [ "$FORCE" -eq 1 ]; then
    echo "Force: dropping the entire freeze cache (all stories will re-execute)"
    rm -rf "_freeze"
  fi
  echo "Rendering all stories in quarto/ ..."
  quarto render
fi

process_stories

echo "Done. Rendered, synced stubs, and extracted fragments. Run 'zola build' (or 'zola serve') to assemble the site."
