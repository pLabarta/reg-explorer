"""Tree-canopy data story — figures + choropleth map -> figures/."""
import json
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import TwoSlopeNorm
import geopandas as gpd

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"; FIG = HERE / "figures"; FIG.mkdir(exist_ok=True)
D = HERE.parents[1] / "crxp" / "static" / "data"

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 11, "axes.titlesize": 13,
    "axes.titleweight": "bold", "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": "#e5dfd6", "grid.linewidth": 0.7,
    "figure.facecolor": "white", "axes.facecolor": "white",
})
TEAL, BROWN, PLUM = "#1f6f63", "#9e3b2f", "#5b2a4e"
df = pd.read_csv(DATA / "tract_analysis.csv")

# 1) regional trend
rt = pd.read_csv(DATA / "region_trend.csv", index_col=0).iloc[:, 0]
fig, ax = plt.subplots(figsize=(7, 3.6))
ax.plot(rt.index, rt.values, "-o", color=TEAL, lw=2.5, ms=6)
ax.set_ylim(rt.min() - 0.6, rt.max() + 0.6)
ax.set_ylabel("Regional tree canopy (% of land)"); ax.set_xlabel("")
ax.set_title("The region's tree canopy has slipped since 2015")
for y in (rt.index.min(), rt.index.max()):
    ax.annotate(f"{rt[y]:.1f}%", (y, rt[y]), textcoords="offset points",
                xytext=(0, 10 if y == rt.index.min() else -16), ha="center", fontweight="bold", color=TEAL)
fig.tight_layout(); fig.savefig(FIG / "fig1_region_trend.png", dpi=150); plt.close(fig)

# 2) distribution of tract change
fig, ax = plt.subplots(figsize=(7, 3.6))
ch = df["change"].dropna()
bins = np.arange(-14, 12.5, 1)
n, b, patches = ax.hist(ch, bins=bins, edgecolor="white")
for p, left in zip(patches, b[:-1]):
    p.set_facecolor(BROWN if left < 0 else TEAL)
ax.axvline(0, color="#4d463f", lw=1)
ax.set_xlabel("Change in tree canopy, 2015 to 2023 (percentage points)")
ax.set_ylabel("Census tracts")
ax.set_title(f"Most tracts changed little, but a tail lost heavily\n({(ch < 0).mean()*100:.0f}% lost canopy; {(ch < -3).mean()*100:.0f}% lost more than 3 points)")
fig.tight_layout(); fig.savefig(FIG / "fig2_change_hist.png", dpi=150); plt.close(fig)

# 3) county change bar
cty = pd.read_csv(DATA / "county_summary.csv").sort_values("change")
fig, ax = plt.subplots(figsize=(7, 4.4))
colors = [BROWN if v < 0 else TEAL for v in cty["change"]]
ax.barh(cty["county"].str.replace(" County", ""), cty["change"], color=colors)
ax.axvline(0, color="#4d463f", lw=1)
ax.set_xlabel("Area-weighted canopy change, 2015 to 2023 (pts)")
ax.set_title("Canopy loss is heaviest in the fast-growing SC border counties")
ax.grid(axis="y", visible=False)
fig.tight_layout(); fig.savefig(FIG / "fig3_county_change.png", dpi=150); plt.close(fig)

# 4) housing-activity scatter
d = df.dropna(subset=["newhomes", "change"])
fig, ax = plt.subplots(figsize=(7, 4.2))
ax.scatter(d["newhomes"], d["change"], s=12, alpha=0.45, color=PLUM, edgecolors="none")
m, bb = np.polyfit(d["newhomes"], d["change"], 1)
xs = np.array([d["newhomes"].min(), d["newhomes"].max()])
ax.plot(xs, m * xs + bb, color=BROWN, lw=2.5)
r = np.corrcoef(d["newhomes"], d["change"])[0, 1]
ax.axhline(0, color="#4d463f", lw=0.8)
ax.set_xlabel("Homes built since 2010 (% of a tract's housing)")
ax.set_ylabel("Canopy change 2015–23 (pts)")
ax.set_title(f"Where new houses went up, trees came down (r = {r:.2f})")
fig.tight_layout(); fig.savefig(FIG / "fig4_housing_scatter.png", dpi=150); plt.close(fig)

# 5) income terciles (urban)
terc = pd.read_csv(DATA / "income_tercile_urban.csv")
fig, (a1, a2) = plt.subplots(1, 2, figsize=(9, 3.9))
x = np.arange(len(terc)); w = 0.38
a1.bar(x - w/2, terc["canopy15"], w, label="2015", color="#c9b18c")
a1.bar(x + w/2, terc["canopy23"], w, label="2023", color=TEAL)
a1.set_xticks(x); a1.set_xticklabels([g.replace(" income", "") for g in terc["group"]])
a1.set_ylabel("Tree canopy (% of land)"); a1.legend(frameon=False, fontsize=9)
a1.set_title("Baseline canopy by income")
cols = [TEAL if v >= 0 else BROWN for v in terc["change"]]
a2.bar(x, terc["change"], color=cols)
a2.axhline(0, color="#4d463f", lw=1)
a2.set_xticks(x); a2.set_xticklabels([g.replace(" income", "") for g in terc["group"]])
a2.set_ylabel("Mean canopy change 2015–23 (pts)")
a2.set_title("Who lost canopy (urban tracts)")
a2.grid(axis="x", visible=False)
fig.suptitle("Higher-income urban neighborhoods lost more, not less", fontweight="bold", y=1.02)
fig.tight_layout(); fig.savefig(FIG / "fig5_income_terciles.png", dpi=150, bbox_inches="tight"); plt.close(fig)

# 6) choropleth map of canopy change
tr = gpd.read_file(D / "geo" / "tracts.geojson")
key = "geoid" if "geoid" in tr.columns else [c for c in tr.columns if "geoid" in c.lower()][0]
tr[key] = tr[key].astype(str)
df["geoid"] = df["geoid"].astype(str)
g = tr.merge(df[["geoid", "change"]], left_on=key, right_on="geoid", how="left")
fig, ax = plt.subplots(figsize=(8, 8.6))
norm = TwoSlopeNorm(vmin=-10, vcenter=0, vmax=5)
g.plot(column="change", cmap="BrBG", norm=norm, ax=ax, linewidth=0.1, edgecolor="#ffffff",
       missing_kwds={"color": "#e6e2db"})
try:
    ct = gpd.read_file(D / "geo" / "counties.geojson")
    ct.boundary.plot(ax=ax, color="#4d463f", linewidth=0.6)
except Exception:
    pass
ax.set_axis_off()
ax.set_title("Change in tree canopy by census tract, 2015 to 2023", fontsize=14, fontweight="bold", loc="left")
sm = plt.cm.ScalarMappable(cmap="BrBG", norm=norm)
cb = fig.colorbar(sm, ax=ax, shrink=0.4, pad=0.01)
cb.set_label("Percentage-point change (brown = loss, green = gain)")
fig.text(0.01, 0.02, "Source: Carolinas Regional Explorer / USGS NLCD Tree Canopy Cover.", fontsize=8, color="#756c61")
fig.savefig(FIG / "map_canopy_change.png", dpi=150, bbox_inches="tight"); plt.close(fig)

print("wrote figures:", ", ".join(sorted(p.name for p in FIG.glob("*.png"))))
