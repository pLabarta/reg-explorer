"""Tree-canopy data story — core analysis. Outputs tables (data/) + a findings.json."""
import json, math
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "crxp" / "static" / "data"
OUT = Path(__file__).resolve().parent / "data"
OUT.mkdir(exist_ok=True)

def vals(i):
    v = json.load(open(D / "values" / f"{i}.json", encoding="utf-8"))
    return v["years"], v["values"]

def col(i, year):
    yrs, vv = vals(i)
    k = yrs.index(year)
    return {g: (a[k] if a[k] is not None else np.nan) for g, a in vv.items()}

# ---- assemble tract table ----
tc_years, tc = vals(76)
rows = []
inc23 = col(20, 2023); den23 = col(51, 2023); pop23 = col(50, 2023)
nh23 = col(56, 2023); dev21 = col(73, 2021); dev13 = col(73, 2013)
imp21 = col(74, 2021); imp13 = col(74, 2013); black23 = col(5, 2023); pov23 = col(30, 2023)

areas = json.load(open(D / "areas" / "tracts.json", encoding="utf-8"))
meta = {a["geoid"]: a for a in areas}

for g, arr in tc.items():
    c15, c23 = arr[0], arr[-1]  # 2015, 2023
    if c15 is None or c23 is None:
        continue
    den = den23.get(g, np.nan)
    pop = pop23.get(g, np.nan)
    area = (pop / den) if (den and den > 0 and not math.isnan(pop)) else np.nan  # sq mi
    m = meta.get(g, {})
    rows.append(dict(
        geoid=g, county=m.get("county", ""), label=m.get("label", m.get("name", "")),
        canopy15=c15, canopy23=c23, change=c23 - c15,
        income=inc23.get(g, np.nan), density=den, pop=pop, area=area,
        newhomes=nh23.get(g, np.nan),
        dev_change=(dev21.get(g, np.nan) - dev13.get(g, np.nan)),
        imp_change=(imp21.get(g, np.nan) - imp13.get(g, np.nan)),
        black=black23.get(g, np.nan), poverty=pov23.get(g, np.nan),
    ))
df = pd.DataFrame(rows)
df.to_csv(OUT / "tract_analysis.csv", index=False)
n = len(df)

def wmean(s, w):
    m = s.notna() & w.notna()
    return float(np.average(s[m], weights=w[m])) if m.any() else float("nan")

F = {}  # findings

# ================= Q1: how / where is canopy changing =================
# regional trend (area-weighted) each year
reg_trend = {}
for k, y in enumerate(tc_years):
    cy = {g: (a[k] if a[k] is not None else np.nan) for g, a in tc.items()}
    s = df["geoid"].map(cy); reg_trend[y] = wmean(s, df["area"])
pd.Series(reg_trend, name="region_canopy_pct").to_csv(OUT / "region_trend.csv")
F["region_canopy_2015"] = round(reg_trend[2015], 2)
F["region_canopy_2023"] = round(reg_trend[2023], 2)
F["region_change_pts"] = round(reg_trend[2023] - reg_trend[2015], 2)
F["region_rel_change_pct"] = round(100 * (reg_trend[2023] - reg_trend[2015]) / reg_trend[2015], 1)
F["n_tracts"] = n
F["share_losing"] = round(100 * (df["change"] < 0).mean(), 1)
F["share_gaining"] = round(100 * (df["change"] > 0).mean(), 1)
F["share_loss_gt3"] = round(100 * (df["change"] < -3).mean(), 1)
F["median_change"] = round(df["change"].median(), 2)
F["mean_change"] = round(df["change"].mean(), 2)

# county summary (area-weighted canopy 15/23/change)
cty = []
for c, gdf in df.groupby("county"):
    cty.append(dict(county=c, tracts=len(gdf),
                    canopy15=round(wmean(gdf["canopy15"], gdf["area"]), 2),
                    canopy23=round(wmean(gdf["canopy23"], gdf["area"]), 2),
                    change=round(wmean(gdf["canopy23"], gdf["area"]) - wmean(gdf["canopy15"], gdf["area"]), 2),
                    mean_tract_change=round(gdf["change"].mean(), 2)))
cty = pd.DataFrame(cty).sort_values("change")
cty.to_csv(OUT / "county_summary.csv", index=False)
F["counties_worst"] = cty.head(3)[["county", "change"]].to_dict("records")
F["counties_best"] = cty.tail(3)[["county", "change"]].to_dict("records")

# top losers / gainers (tracts)
keep = ["geoid", "label", "county", "canopy15", "canopy23", "change", "income", "newhomes", "density"]
losers = df.sort_values("change").head(15)[keep].round(2)
gainers = df.sort_values("change", ascending=False).head(10)[keep].round(2)
losers.to_csv(OUT / "top_losers.csv", index=False)
gainers.to_csv(OUT / "top_gainers.csv", index=False)

# ================= Q2: housing/development vs canopy change =================
def corr(a, b):
    m = df[a].notna() & df[b].notna()
    x, y = df[a][m], df[b][m]
    pear = float(np.corrcoef(x, y)[0, 1])
    spear = float(np.corrcoef(x.rank(), y.rank())[0, 1])
    return round(pear, 3), round(spear, 3), int(m.sum())

F["corr_change_newhomes"] = corr("change", "newhomes")
F["corr_change_devchange"] = corr("change", "dev_change")
F["corr_change_impchange"] = corr("change", "imp_change")
# high vs low housing-activity tracts
q = df["newhomes"].quantile([.25, .75])
hi = df[df["newhomes"] >= q[.75]]; lo = df[df["newhomes"] <= q[.25]]
F["newhomes_top_quartile_change"] = round(hi["change"].mean(), 2)
F["newhomes_bot_quartile_change"] = round(lo["change"].mean(), 2)
F["newhomes_q75"] = round(q[.75], 1)

# ================= Q3: income equity in URBAN clusters =================
DENS_THRESHOLD = 500.0  # people / sq mi ~ urbanized; excludes highly rural tracts
urb = df[df["density"] >= DENS_THRESHOLD].dropna(subset=["income"]).copy()
F["urban_threshold_density"] = DENS_THRESHOLD
F["urban_tracts"] = len(urb); F["excluded_rural_tracts"] = n - len(urb)
urb["inc_tercile"] = pd.qcut(urb["income"], 3, labels=["Lower income", "Middle income", "Higher income"])
terc = []
for t, gdf in urb.groupby("inc_tercile", observed=True):
    terc.append(dict(group=str(t), tracts=len(gdf),
                     med_income=int(gdf["income"].median()),
                     canopy15=round(wmean(gdf["canopy15"], gdf["area"]), 2),
                     canopy23=round(wmean(gdf["canopy23"], gdf["area"]), 2),
                     change=round(gdf["change"].mean(), 2),
                     share_losing=round(100 * (gdf["change"] < 0).mean(), 1)))
terc = pd.DataFrame(terc)
terc.to_csv(OUT / "income_tercile_urban.csv", index=False)
F["income_terciles"] = terc.to_dict("records")
# baseline equity gap + change gap
F["equity_gap_2023_pts"] = round(terc.iloc[2]["canopy23"] - terc.iloc[0]["canopy23"], 1)
F["corr_canopy_income_urban"] = round(np.corrcoef(urb["canopy23"], urb["income"])[0, 1], 3)
# does higher income = more stable (less loss)?
F["corr_change_income_urban"] = round(np.corrcoef(urb["change"], urb["income"])[0, 1], 3)

# other thread: canopy vs impervious (heat proxy) + race
F["corr_change_black"] = corr("change", "black")
F["corr_canopy23_black"] = round(df.dropna(subset=["black"]).pipe(lambda d: np.corrcoef(d["canopy23"], d["black"])[0, 1]), 3)

json.dump(F, open(OUT / "findings.json", "w"), indent=2, default=str)

# ---- print key findings ----
print("=== Q1 REGIONAL ===")
print(f"Region canopy: {F['region_canopy_2015']}% (2015) -> {F['region_canopy_2023']}% (2023) "
      f"= {F['region_change_pts']} pts ({F['region_rel_change_pct']}% relative)")
print(f"Tracts: {n}; losing {F['share_losing']}%, gaining {F['share_gaining']}%, lost >3pts {F['share_loss_gt3']}%")
print("Counties (worst change):", F["counties_worst"])
print("Counties (best change):", F["counties_best"])
print("\nTop 8 tract losers:")
print(losers.head(8).to_string(index=False))
print("\n=== Q2 HOUSING/DEVELOPMENT ===")
print("corr(change, new-homes share) pearson/spearman/n:", F["corr_change_newhomes"])
print("corr(change, developed-land change):", F["corr_change_devchange"])
print("corr(change, impervious change):", F["corr_change_impchange"])
print(f"canopy change: top-quartile new-homes {F['newhomes_top_quartile_change']} vs bottom {F['newhomes_bot_quartile_change']}")
print("\n=== Q3 INCOME (urban clusters, density>=500) ===")
print(f"urban tracts {F['urban_tracts']} (excluded {F['excluded_rural_tracts']} rural)")
print(terc.to_string(index=False))
print(f"2023 equity gap (higher-lower): {F['equity_gap_2023_pts']} pts; corr(canopy23,income)={F['corr_canopy_income_urban']}; corr(change,income)={F['corr_change_income_urban']}")
print("\n=== OTHER ===")
print("corr(change, %Black):", F["corr_change_black"], "| corr(canopy23, %Black):", F["corr_canopy23_black"])
print("\nwrote:", ", ".join(p.name for p in sorted(OUT.glob("*.csv"))), "+ findings.json")
