# Shared R setup for Quarto data stories: design tokens + the plotly theme.
#
# Token VALUES are not defined here — they are generated from the single source of
# truth, sass/_tokens.scss, into _tokens.R by scripts/build-stories.sh. This file is
# sourced from each story's setup chunk:
#   source(file.path(Sys.getenv("QUARTO_PROJECT_DIR"), "_setup.R"))

source(file.path(Sys.getenv("QUARTO_PROJECT_DIR"), "_tokens.R"))

library(plotly)

# ── Data-viz palettes ─────────────────────────────────────────────────────────
# viz_categorical (from sass/_tokens.scss) is the ordered set of chart colors.
# cat_pal(n) returns the first n, recycling if n exceeds the palette length —
# use it wherever a chart needs discrete series colors:
#   plot_ly(..., color = ~group, colors = cat_pal(n_distinct(df$group)))
cat_pal <- function(n = length(viz_categorical)) {
  rep(viz_categorical, length.out = n)
}

# Sequential ramps (light → dark, one per hue): viz_seq_plum/green/blue/orange.
# Diverging ramps (endpoint → neutral → endpoint): viz_div_plum_green / blue_plum /
# orange_green / gray_plum. Pass a ramp straight to plotly's `colors=` for a
# continuous scale, or interpolate to n discrete steps with ramp():
#   plot_ly(..., color = ~value, colors = viz_seq_blue)   # continuous
#   colors = ramp(viz_div_orange_green, 7)                # 7 discrete bins
ramp <- function(pal, n) grDevices::colorRampPalette(pal)(n)

# Apply the project look to any plotly figure (mirrors the .line-chart / figure styling).
zola_style <- function(p, ytitle = "Value", xtitle = "Index") {
  p |>
    layout(
      font          = list(family = font, color = black, size = 14),
      paper_bgcolor = paper,
      plot_bgcolor  = paper,
      margin        = list(l = 56, r = 24, t = 16, b = 48),
      xaxis = list(title = xtitle, gridcolor = warm_gray_light,
                   zeroline = FALSE, tickcolor = warm_gray),
      yaxis = list(title = ytitle, gridcolor = warm_gray_light,
                   zeroline = FALSE, tickcolor = warm_gray)
    ) |>
    config(displayModeBar = FALSE)
}
