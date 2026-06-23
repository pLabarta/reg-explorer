# Shared R setup for Quarto data stories: design tokens + the plotly theme.
#
# Token VALUES are not defined here — they are generated from the single source of
# truth, sass/_tokens.scss, into _tokens.R by scripts/build-stories.sh. This file is
# sourced from each story's setup chunk:
#   source(file.path(Sys.getenv("QUARTO_PROJECT_DIR"), "_setup.R"))

source(file.path(Sys.getenv("QUARTO_PROJECT_DIR"), "_tokens.R"))

library(plotly)

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
