# Light-pollution data story — analysis (R). Writes data/ tables + findings.json.
suppressPackageStartupMessages({library(jsonlite); library(dplyr); library(tidyr); library(readr)})

here <- getwd()
D <- file.path(here, "..", "..", "crxp", "static", "data")
out <- file.path(here, "data"); dir.create(out, showWarnings = FALSE)

read_ind <- function(id) fromJSON(file.path(D, "values", paste0(id, ".json")))
col <- function(v, year) {
  k <- match(year, v$years)
  vapply(v$values, function(x) { xk <- x[k]; if (length(xk) == 0 || is.null(xk[[1]]) || is.na(xk[[1]])) NA_real_ else as.numeric(xk[[1]]) }, numeric(1))
}

lp <- read_ind(75)                       # light pollution (radiance), 2014/2019/2024
geoids <- names(lp$values)
g <- function(id, yr) { v <- read_ind(id); col(v, yr)[geoids] }

areas <- fromJSON(file.path(D, "areas", "tracts.json"))
meta <- setNames(seq_len(nrow(areas)), areas$geoid)
lab <- function(gid) { i <- meta[[gid]]; if (is.null(i)) c("", "") else c(areas$county[i], areas$label[i]) }

df <- tibble(
  geoid   = geoids,
  county  = areas$county[match(geoids, areas$geoid)],
  label   = areas$label[match(geoids, areas$geoid)],
  rad14   = col(lp, 2014), rad19 = col(lp, 2019), rad24 = col(lp, 2024),
  pop     = g(50, 2024),
  income  = g(20, 2023),
  poverty = g(30, 2023),
  white   = g(7, 2023),  black = g(5, 2023), hisp = g(6, 2023), asian = g(4, 2023),
  density = g(51, 2024), youth = g(2, 2023), older = g(1, 2023)
) %>%
  mutate(change = rad24 - rad14,
         pct_change = 100 * (rad24 - rad14) / rad14,
         poc = pmax(0, 100 - white))          # people of color (share)
write_csv(df, file.path(out, "tract_analysis.csv"))

wmean <- function(x, w) { ok <- !is.na(x) & !is.na(w) & w > 0; sum(x[ok] * w[ok]) / sum(w[ok]) }
F <- list()

## ---------- Q1: levels + change ----------
F$n_tracts <- nrow(df)
F$pop_wt_rad_2014 <- round(wmean(df$rad14, df$pop), 2)   # exposure of the average resident
F$pop_wt_rad_2019 <- round(wmean(df$rad19, df$pop), 2)
F$pop_wt_rad_2024 <- round(wmean(df$rad24, df$pop), 2)
F$pop_wt_change   <- round(F$pop_wt_rad_2024 - F$pop_wt_rad_2014, 2)
F$pop_wt_pct      <- round(100 * (F$pop_wt_rad_2024 - F$pop_wt_rad_2014) / F$pop_wt_rad_2014, 1)
F$median_rad_2024 <- round(median(df$rad24, na.rm = TRUE), 2)
F$median_rad_2014 <- round(median(df$rad14, na.rm = TRUE), 2)
F$brightest_rad   <- round(max(df$rad24, na.rm = TRUE), 1)
F$darkest_rad     <- round(min(df$rad24, na.rm = TRUE), 2)
F$ratio_bright_dark <- round(max(df$rad24, na.rm=TRUE) / min(df$rad24, na.rm=TRUE))
F$share_tracts_brighter <- round(100 * mean(df$rad24 > df$rad14, na.rm = TRUE), 1)

# regional trend table
tibble(year = c(2014, 2019, 2024),
       pop_wt_radiance = c(F$pop_wt_rad_2014, F$pop_wt_rad_2019, F$pop_wt_rad_2024)) %>%
  write_csv(file.path(out, "region_trend.csv"))

# county summary (population-weighted radiance)
cty <- df %>% group_by(county) %>%
  summarise(tracts = n(),
            rad14 = round(wmean(rad14, pop), 2), rad24 = round(wmean(rad24, pop), 2),
            pop = sum(pop, na.rm = TRUE), .groups = "drop") %>%
  mutate(change = round(rad24 - rad14, 2)) %>%
  arrange(desc(rad24))
write_csv(cty, file.path(out, "county_summary.csv"))
F$county_brightest <- head(cty, 3) %>% select(county, rad24) %>% as.data.frame()

# brightest tracts (2024) + biggest increases
sel <- c("geoid","label","county","rad14","rad24","change","income","poverty","poc","density","pop")
df %>% arrange(desc(rad24)) %>% head(12) %>% select(all_of(sel)) %>%
  mutate(across(where(is.numeric), ~round(.,1))) %>% write_csv(file.path(out, "top_brightest.csv"))
df %>% filter(rad14 > 1) %>% arrange(desc(change)) %>% head(12) %>% select(all_of(sel)) %>%
  mutate(across(where(is.numeric), ~round(.,1))) %>% write_csv(file.path(out, "top_increase.csv"))

## ---------- Q2: exposure quantification ----------
tot_pop <- sum(df$pop, na.rm = TRUE)
q <- quantile(df$rad24, c(.2,.4,.6,.8), na.rm = TRUE)
df <- df %>% mutate(rad_q = cut(rad24, breaks = c(-Inf, q, Inf),
                                labels = c("Darkest","Dark","Middle","Bright","Brightest")))
expo <- df %>% group_by(rad_q) %>% summarise(tracts = n(), pop = sum(pop, na.rm=TRUE),
              med_rad = round(median(rad24),2), .groups="drop") %>%
  mutate(pop_share = round(100 * pop / tot_pop, 1))
write_csv(expo, file.path(out, "exposure_quintiles.csv"))
F$total_pop <- round(tot_pop)
F$pop_brightest_quintile <- round(sum(df$pop[df$rad_q == "Brightest"], na.rm = TRUE))
F$share_above_median <- round(100 * sum(df$pop[df$rad24 > F$median_rad_2024], na.rm=TRUE) / tot_pop, 1)

## ---------- Q3: equity — population-weighted exposure by group ----------
grp_pop <- function(share) df$pop * share / 100
groups <- tibble(
  group = c("All residents","White","Black","Hispanic","Asian","Below poverty","Children (<18)","Older adults (65+)"),
  order = 1:8,
  exposure = c(
    wmean(df$rad24, df$pop),
    wmean(df$rad24, grp_pop(df$white)),
    wmean(df$rad24, grp_pop(df$black)),
    wmean(df$rad24, grp_pop(df$hisp)),
    wmean(df$rad24, grp_pop(df$asian)),
    wmean(df$rad24, grp_pop(df$poverty)),
    wmean(df$rad24, grp_pop(df$youth)),
    wmean(df$rad24, grp_pop(df$older))
  )) %>% mutate(exposure = round(exposure, 2),
               vs_white = round(exposure / exposure[group == "White"], 2))
write_csv(groups, file.path(out, "equity_exposure.csv"))
F$equity <- groups %>% select(group, exposure, vs_white) %>% as.data.frame()

# income terciles pop-weighted exposure
urb <- df %>% filter(!is.na(income))
urb <- urb %>% mutate(inc_t = cut(income, quantile(income, c(0,1/3,2/3,1), na.rm=TRUE),
                                  labels = c("Lower income","Middle income","Higher income"), include.lowest = TRUE))
inc <- urb %>% group_by(inc_t) %>% summarise(tracts=n(), med_income=round(median(income)),
             exposure = round(wmean(rad24, pop), 2), .groups="drop")
write_csv(inc, file.path(out, "income_exposure.csv"))
F$income_exposure <- as.data.frame(inc)

# share of each group living in the brightest quintile
in_bright <- df$rad_q == "Brightest"
grp_share_bright <- function(share) round(100 * sum((df$pop*share/100)[in_bright], na.rm=TRUE) /
                                          sum(df$pop*share/100, na.rm=TRUE), 1)
F$bright_share <- list(
  all = grp_share_bright(rep(100, nrow(df))),
  white = grp_share_bright(df$white), black = grp_share_bright(df$black),
  hisp = grp_share_bright(df$hisp), poverty = grp_share_bright(df$poverty))

# correlations
cor_s <- function(a, b){ ok <- !is.na(a)&!is.na(b); round(cor(a[ok], b[ok], method="spearman"), 3) }
F$corr_rad_poc     <- cor_s(df$rad24, df$poc)
F$corr_rad_income  <- cor_s(df$rad24, df$income)
F$corr_rad_poverty <- cor_s(df$rad24, df$poverty)
F$corr_rad_density <- cor_s(df$rad24, df$density)

write_json(F, file.path(out, "findings.json"), auto_unbox = TRUE, pretty = TRUE, digits = 4)

## ---------- print ----------
cat("=== Q1 LEVELS/CHANGE ===\n")
cat(sprintf("pop-weighted radiance: %.2f (2014) -> %.2f (2024) = %+.2f (%+.1f%%)\n",
            F$pop_wt_rad_2014, F$pop_wt_rad_2024, F$pop_wt_change, F$pop_wt_pct))
cat(sprintf("median tract: %.2f -> %.2f; brightest %.0f vs darkest %.2f (%.0fx); %.1f%% of tracts brighter\n",
            F$median_rad_2014, F$median_rad_2024, F$brightest_rad, F$darkest_rad, F$ratio_bright_dark, F$share_tracts_brighter))
cat("brightest counties:\n"); print(F$county_brightest)
cat("\n=== Q2 EXPOSURE ===\n"); print(as.data.frame(expo))
cat(sprintf("region pop %s; %.1f%% live above the median-radiance tract\n", format(F$total_pop, big.mark=","), F$share_above_median))
cat("\n=== Q3 EQUITY (pop-weighted exposure) ===\n"); print(F$equity)
cat("income terciles:\n"); print(F$income_exposure)
cat("share in brightest quintile:\n"); print(unlist(F$bright_share))
cat(sprintf("corr rad~%%POC %.3f | ~income %.3f | ~poverty %.3f | ~density %.3f\n",
            F$corr_rad_poc, F$corr_rad_income, F$corr_rad_poverty, F$corr_rad_density))
cat("\nwrote:", paste(list.files(out, pattern="csv$"), collapse=", "), "+ findings.json\n")
