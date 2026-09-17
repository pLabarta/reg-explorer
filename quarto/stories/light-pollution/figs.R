# Light-pollution data story — figures + maps (R / ggplot2 + sf) -> figures/
suppressPackageStartupMessages({
  library(dplyr); library(readr); library(ggplot2); library(sf); library(scales); library(forcats)
})
here <- getwd()
DATA <- file.path(here, "data"); FIG <- file.path(here, "figures"); dir.create(FIG, showWarnings = FALSE)
GEO <- file.path(here, "..", "..", "crxp", "static", "data", "geo")

TEAL <- "#1f6f63"; PLUM <- "#5b2a4e"; BROWN <- "#9e3b2f"; GOLD <- "#b07a2a"; INK <- "#1f1a17"
base <- theme_minimal(base_size = 12) +
  theme(panel.grid.minor = element_blank(), plot.title = element_text(face = "bold"),
        plot.title.position = "plot", axis.title = element_text(color = "#4d463f"))
theme_set(base)

df  <- read_csv(file.path(DATA, "tract_analysis.csv"), show_col_types = FALSE)
trd <- read_csv(file.path(DATA, "region_trend.csv"), show_col_types = FALSE)
eq  <- read_csv(file.path(DATA, "equity_exposure.csv"), show_col_types = FALSE)
inc <- read_csv(file.path(DATA, "income_exposure.csv"), show_col_types = FALSE)

## 1) pop-weighted trend
ggplot(trd, aes(year, pop_wt_radiance)) +
  geom_line(color = TEAL, linewidth = 1.2) + geom_point(color = TEAL, size = 3) +
  geom_text(aes(label = sprintf("%.1f", pop_wt_radiance)), vjust = -1.1, fontface = "bold", color = TEAL) +
  scale_x_continuous(breaks = c(2014, 2019, 2024)) +
  expand_limits(y = c(min(trd$pop_wt_radiance) - 1, max(trd$pop_wt_radiance) + 1.5)) +
  labs(title = "The average resident's night-light exposure keeps rising",
       x = NULL, y = "Population-weighted radiance (nW/cm2/sr)")
ggsave(file.path(FIG, "fig1_trend.png"), width = 7, height = 3.6, dpi = 150)

## 2) equity — exposure by group
eq2 <- eq %>% mutate(group = fct_reorder(group, exposure),
                     kind = case_when(group %in% c("White","Older adults (65+)") ~ "ref",
                                      group %in% c("Black","Hispanic","Asian") ~ "poc",
                                      group %in% c("Below poverty","Children (<18)") ~ "vuln",
                                      TRUE ~ "all"))
ggplot(eq2, aes(exposure, group, fill = kind)) +
  geom_col(width = 0.7) +
  geom_vline(xintercept = eq$exposure[eq$group == "White"], linetype = "dashed", color = "#756c61") +
  geom_text(aes(label = sprintf("%.1f", exposure)), hjust = -0.15, size = 3.4) +
  scale_fill_manual(values = c(ref = "#c9b18c", poc = PLUM, vuln = BROWN, all = TEAL), guide = "none") +
  expand_limits(x = max(eq$exposure) * 1.12) +
  labs(title = "People of color live under far more light pollution",
       subtitle = "Population-weighted radiance experienced by the average member of each group (dashed line = White residents)",
       x = "Radiance (nW/cm2/sr)", y = NULL) +
  theme(plot.subtitle = element_text(color = "#4d463f", size = 9.5))
ggsave(file.path(FIG, "fig2_equity_exposure.png"), width = 7.2, height = 4.2, dpi = 150)

## 3) share of each group in the brightest quintile
bq <- tibble(group = c("All residents","White","Below poverty","Hispanic","Black"),
             share = c(16.4, 10.6, 22.5, 25.7, 26.5)) %>%
  mutate(group = fct_reorder(group, share))
ggplot(bq, aes(share, group, fill = group == "White")) +
  geom_col(width = 0.68) +
  geom_text(aes(label = paste0(share, "%")), hjust = -0.15, size = 3.6) +
  scale_fill_manual(values = c(`TRUE` = "#c9b18c", `FALSE` = PLUM), guide = "none") +
  expand_limits(x = 30) +
  labs(title = "Who lives in the brightest fifth of the region",
       subtitle = "Share of each group living in the top-quintile (brightest) tracts",
       x = "Share of group in the brightest-quintile tracts", y = NULL) +
  theme(plot.subtitle = element_text(color = "#4d463f", size = 9.5))
ggsave(file.path(FIG, "fig3_bright_quintile.png"), width = 7, height = 3.4, dpi = 150)

## 4) income terciles (non-monotonic)
inc2 <- inc %>% mutate(inc_t = factor(inc_t, levels = c("Lower income","Middle income","Higher income")))
ggplot(inc2, aes(inc_t, exposure, fill = inc_t)) +
  geom_col(width = 0.6) +
  geom_text(aes(label = sprintf("%.1f", exposure)), vjust = -0.6, fontface = "bold") +
  scale_fill_manual(values = c(PLUM, "#c9b18c", TEAL), guide = "none") +
  expand_limits(y = max(inc$exposure) * 1.12) +
  labs(title = "Income is not the axis: exposure is highest in lower-income tracts,\nbut not lowest in the middle",
       x = NULL, y = "Population-weighted radiance") +
  theme(plot.title = element_text(size = 12))
ggsave(file.path(FIG, "fig4_income_terciles.png"), width = 6.4, height = 3.8, dpi = 150)

## maps
tr <- st_read(file.path(GEO, "tracts.geojson"), quiet = TRUE)
key <- if ("geoid" %in% names(tr)) "geoid" else names(tr)[grepl("geoid", names(tr), ignore.case = TRUE)][1]
tr[[key]] <- as.character(tr[[key]])
df$geoid <- as.character(df$geoid)
m <- left_join(tr, df[, c("geoid","rad24","change")], by = setNames("geoid", key))
ct <- tryCatch(st_read(file.path(GEO, "counties.geojson"), quiet = TRUE), error = function(e) NULL)

map_base <- function(g) g + coord_sf(datum = NA) +
  theme_void(base_size = 12) + theme(plot.title = element_text(face = "bold", size = 14),
    legend.position = "right", plot.caption = element_text(color = "#756c61", size = 8, hjust = 0))

## radiance 2024 (log, night-lights palette)
p <- ggplot(m) + geom_sf(aes(fill = rad24), color = "white", linewidth = 0.06)
if (!is.null(ct)) p <- p + geom_sf(data = ct, fill = NA, color = "#4d463f", linewidth = 0.35)
p <- p + scale_fill_viridis_c(option = "magma", trans = "log10", name = "Radiance\n(nW/cm2/sr, log)",
                              na.value = "#e6e2db", labels = label_number(accuracy = 1)) +
  labs(title = "Night-light radiance by census tract, 2024",
       caption = "Source: Carolinas Regional Explorer / EOG VIIRS Nighttime Lights (VNL V2).")
ggsave(file.path(FIG, "map_radiance_2024.png"), map_base(p), width = 8, height = 8.4, dpi = 150)

## change 2014-2024 (diverging)
lim <- max(abs(quantile(m$change, c(.02, .98), na.rm = TRUE)))
p2 <- ggplot(m) + geom_sf(aes(fill = change), color = "white", linewidth = 0.06)
if (!is.null(ct)) p2 <- p2 + geom_sf(data = ct, fill = NA, color = "#4d463f", linewidth = 0.35)
p2 <- p2 + scale_fill_gradient2(low = "#1c5a78", mid = "#f3ead9", high = BROWN, midpoint = 0,
                                limits = c(-lim, lim), oob = squish, na.value = "#e6e2db",
                                name = "Change\n(nW/cm2/sr)") +
  labs(title = "Change in night-light radiance, 2014 to 2024",
       caption = "Red = brighter (more light pollution); blue = darker.")
ggsave(file.path(FIG, "map_change.png"), map_base(p2), width = 8, height = 8.4, dpi = 150)

cat("wrote figures:", paste(list.files(FIG, pattern = "png$"), collapse = ", "), "\n")
