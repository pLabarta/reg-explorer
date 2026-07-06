# Shared Python setup for Quarto data stories: design tokens + the plotly theme.
# Mirrors _setup.R — keep the two in sync when the authoring surface changes.
#
# Token VALUES are not defined here — they are generated from the single source of
# truth, sass/_tokens.scss, into _tokens.py by scripts/build-stories.sh. This file is
# imported from each story's setup cell:
#   import os, sys
#   sys.path.insert(0, os.environ["QUARTO_PROJECT_DIR"])
#   from _setup import *

from _tokens import *  # noqa: F401,F403 — the generated palette/font variables
from _tokens import viz_categorical, font, black, paper, warm_gray, warm_gray_light

import plotly.io as pio

# Quarto renders each figure's text/html bundle; unlike R htmlwidgets there is no
# per-figure config() baked into the widget, so hide the modebar and make figures
# responsive globally on the renderers. (Each figure also embeds its own copy of
# plotly.js — extract_fragment in scripts/build-stories.sh dedupes those.)
for _renderer in ("plotly_mimetype", "notebook", "notebook_connected"):
    try:
        pio.renderers[_renderer].config = {"displayModeBar": False, "responsive": True}
    except (KeyError, AttributeError):
        pass


# ── Data-viz palettes ─────────────────────────────────────────────────────────
# viz_categorical (from sass/_tokens.scss) is the ordered set of chart colors.
# cat_pal(n) returns the first n, recycling if n exceeds the palette length —
# use it wherever a chart needs discrete series colors:
#   go.Bar(..., marker=dict(color=cat_pal(df["group"].nunique())))
def cat_pal(n=None):
    if n is None:
        n = len(viz_categorical)
    return [viz_categorical[i % len(viz_categorical)] for i in range(n)]


def _hex_to_rgb(color):
    color = color.lstrip("#")
    if len(color) == 3:
        color = "".join(c * 2 for c in color)
    return tuple(int(color[i : i + 2], 16) for i in (0, 2, 4))


# Sequential ramps (light → dark, one per hue): viz_seq_plum/green/blue/orange.
# Diverging ramps (endpoint → neutral → endpoint): viz_div_plum_green / blue_plum /
# orange_green / gray_plum. Pass a ramp straight to a plotly colorscale for a
# continuous scale, or interpolate to n discrete steps with ramp():
#   go.Choropleth(..., colorscale=[[i/(len(viz_seq_blue)-1), c] for i, c in enumerate(viz_seq_blue)])
#   colors = ramp(viz_div_orange_green, 7)                # 7 discrete bins
def ramp(pal, n):
    if n < 1:
        return []
    if n == 1:
        return [pal[0]]
    stops = [_hex_to_rgb(c) for c in pal]
    out = []
    for i in range(n):
        t = i * (len(stops) - 1) / (n - 1)
        j = min(int(t), len(stops) - 2)
        f = t - j
        rgb = (round(stops[j][k] + (stops[j + 1][k] - stops[j][k]) * f) for k in range(3))
        out.append("#{:02X}{:02X}{:02X}".format(*rgb))
    return out


# Apply the project look to any plotly figure (mirrors zola_style() in _setup.R).
def zola_style(fig, ytitle="Value", xtitle="Index"):
    fig.update_layout(
        font=dict(family=font, color=black, size=14),
        paper_bgcolor=paper,
        plot_bgcolor=paper,
        margin=dict(l=56, r=24, t=16, b=48),
        autosize=True,
        xaxis=dict(title=xtitle, gridcolor=warm_gray_light,
                   zeroline=False, tickcolor=warm_gray),
        yaxis=dict(title=ytitle, gridcolor=warm_gray_light,
                   zeroline=False, tickcolor=warm_gray),
    )
    return fig
