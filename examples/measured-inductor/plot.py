"""Regenerate the reference figure with Python, matplotlib and Node.js."""
import csv
import io
import subprocess
from pathlib import Path

import matplotlib.pyplot as plt

root = Path(__file__).resolve().parent
csv_text = subprocess.check_output(["node", str(root / "compare.mjs")], text=True)
rows = list(csv.DictReader(io.StringIO(csv_text)))
fig, axes = plt.subplots(1, 2, figsize=(9, 3.5), layout="constrained")
for ax, component, title in zip(axes, ["R", "X"], ["Resistance", "Reactance"]):
    measured = f"measured_{component}_ohm"
    samples = [r for r in rows if r[measured]]
    mhz = [float(r["frequency_Hz"]) / 1e6 for r in samples]
    ax.plot(mhz, [float(r[f"predicted_{component}_ohm"]) for r in samples],
            color="#265c92", label="Planar Studio")
    ax.scatter(mhz[1:], [float(r[measured]) for r in samples[1:]],
               color="#b24a22", label="Published figure", zorder=3)
    ax.scatter(mhz[0], float(samples[0][measured]), marker="s", color="#512916",
               label="Published table", zorder=4)
    ax.set(xlabel="Frequency (MHz)", ylabel=f"{title} (Ω)", ylim=(0, None))
    ax.grid(axis="y", alpha=0.25)
    ax.spines[["top", "right"]].set_visible(False)
axes[0].legend(frameon=False, fontsize=9)
fig.suptitle("TxB square spiral · measured and predicted impedance", fontsize=14)
fig.savefig(root / "comparison.png", dpi=160)
