"""Generate the synthetic sample receipts used by the "Try random receipt" button.

Twenty license-clean demo receipts across five visually distinct templates
(thermal strip, cafe, supermarket, restaurant, invoice), with varied merchants,
currencies, tax rates, and consistent arithmetic. Each is rendered to JPEG via
headless Chrome. Re-run with:  python3 scripts/generate_sample_receipts.py

All output is clearly marked as synthetic — no real purchases.
"""
import json
import random
import shutil
import subprocess
import tempfile
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "static" / "sample-receipts"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if not Path(CHROME).exists():
    CHROME = shutil.which("google-chrome") or shutil.which("chromium") or CHROME

rng = random.Random(20260725)

DISCLAIMER = "Synthetic demo receipt — not a real purchase."

ITEM_POOLS = {
    "thermal": [("Bananas 1.2kg", 1.89), ("Whole milk 2L", 3.49), ("Sourdough loaf", 5.25),
                ("Eggs dozen", 4.79), ("Peanut butter", 6.10), ("Orange juice", 4.35),
                ("Cheddar 400g", 7.80), ("Tomatoes 500g", 2.95), ("Pasta penne", 1.99),
                ("Dish soap", 3.15), ("Paper towels", 5.49), ("Dark chocolate", 3.75)],
    "cafe": [("Flat white", 4.75), ("Cappuccino", 4.50), ("Iced latte", 5.25),
             ("Almond croissant", 4.95), ("Avocado toast", 11.50), ("Blueberry scone", 3.85),
             ("Chai tea", 4.25), ("Granola bowl", 9.75)],
    "restaurant": [("House burger", 16.50), ("Caesar salad", 12.00), ("Margherita pizza", 15.75),
                   ("Grilled salmon", 24.00), ("Pasta carbonara", 17.25), ("Iced tea", 3.50),
                   ("Glass house red", 9.00), ("Tiramisu", 8.50), ("Garlic bread", 6.25)],
    "invoice": [("Copy paper A4 x5", 24.95), ("Toner cartridge", 62.00), ("USB-C cable 2m", 12.99),
                ("Wireless mouse", 24.50), ("Desk organizer", 18.75), ("Whiteboard markers", 9.40),
                ("HDMI adapter", 15.25), ("Notebook 3-pack", 11.85)],
    "fuel": [("Unleaded 87 (gal)", 3.45), ("Car wash basic", 9.00), ("Windshield fluid", 4.25),
             ("Coffee 16oz", 2.19), ("Snack mix", 3.89), ("Energy drink", 3.50)],
}

MERCHANTS = {
    "thermal": ["GREENLEAF GROCERS", "NORTH END MARKET", "DAILY PANTRY #12", "HARVEST FOODS"],
    "cafe": ["The Daily Grind", "Cafe Meridian", "Willow & Bean", "Harbor Roast Co."],
    "restaurant": ["Bella's Trattoria", "The Copper Skillet", "Juniper Kitchen", "Old Mill Diner"],
    "invoice": ["Summit Office Supply", "Beacon Business Depot", "Keystone Supplies LLC"],
    "fuel": ["QuickStop Fuel #42", "Route 9 Service Station", "Lakeside Gas & Go"],
}

CURRENCIES = [("USD", "$", 0.06), ("USD", "$", 0.08875), ("EUR", "€", 0.20),
              ("GBP", "£", 0.20), ("CAD", "$", 0.13), ("USD", "$", 0.0)]


def pick_items(kind, n):
    items = rng.sample(ITEM_POOLS[kind], min(n, len(ITEM_POOLS[kind])))
    rows = []
    for name, price in items:
        qty = rng.choice([1, 1, 1, 2, 2, 3])
        rows.append((name, qty, price, round(qty * price, 2)))
    return rows


def money_math(rows, tax_rate):
    subtotal = round(sum(r[3] for r in rows), 2)
    tax = round(subtotal * tax_rate, 2)
    return subtotal, tax, round(subtotal + tax, 2)


def rand_date():
    return f"2026-{rng.randint(1, 7):02d}-{rng.randint(1, 28):02d}"


def item_rows_html(rows, sym, mono=False):
    tr = []
    for name, qty, price, amt in rows:
        tr.append(f"<tr><td>{name}</td><td class='c'>{qty}</td>"
                  f"<td class='r'>{sym}{price:.2f}</td><td class='r'>{sym}{amt:.2f}</td></tr>")
    return "".join(tr)


def build_html(kind, idx):
    merchant = rng.choice(MERCHANTS[kind])
    cur, sym, tax_rate = rng.choice(CURRENCIES)
    date = rand_date()
    rcpt_no = f"{rng.randint(10000, 99999)}"

    if kind == "thermal":
        rows = pick_items(kind, rng.randint(5, 9))
        subtotal, tax, total = money_math(rows, tax_rate)
        body = f"""
        <div class="paper">
          <h1>{merchant}</h1>
          <p class="sub">STORE 0{rng.randint(1,9)} · REG 0{rng.randint(1,4)} · {date} {rng.randint(8,20)}:{rng.randint(10,59)}</p>
          <div class="dash"></div>
          <table>{item_rows_html(rows, sym)}</table>
          <div class="dash"></div>
          <table class="tot">
            <tr><td>SUBTOTAL</td><td class="r">{sym}{subtotal:.2f}</td></tr>
            <tr><td>TAX</td><td class="r">{sym}{tax:.2f}</td></tr>
            <tr class="big"><td>TOTAL {cur}</td><td class="r">{sym}{total:.2f}</td></tr>
          </table>
          <div class="dash"></div>
          <p class="sub">CARD ****{rng.randint(1000,9999)} · AUTH {rng.randint(100000,999999)}</p>
          <p class="bc">|| ||| | |||| || ||| |||| | || |||</p>
          <p class="tiny">{DISCLAIMER}</p>
        </div>"""
        css = """
        body{background:#8a8377;display:flex;justify-content:center;padding:26px 0;font-family:'Courier New',monospace}
        .paper{width:340px;background:#fdfdfa;padding:26px 22px;box-shadow:0 6px 18px rgba(0,0,0,.45);transform:rotate(-1deg)}
        h1{font-size:19px;text-align:center;margin:0;letter-spacing:1px}
        .sub{text-align:center;font-size:10.5px;color:#444;margin:5px 0}
        .dash{border-top:1.5px dashed #999;margin:9px 0}
        table{width:100%;font-size:12px;border-collapse:collapse}
        td{padding:2.5px 0}.c{text-align:center}.r{text-align:right}
        .tot td{font-size:12.5px}.big td{font-weight:bold;font-size:15px;padding-top:5px}
        .bc{text-align:center;font-size:15px;letter-spacing:1px;margin:8px 0 2px}
        .tiny{font-size:8.5px;color:#999;text-align:center;margin:6px 0 0}"""
        size = (420, 760)

    elif kind == "cafe":
        rows = pick_items(kind, rng.randint(2, 4))
        subtotal, tax, total = money_math(rows, tax_rate)
        tip = round(total * rng.choice([0, 0.15, 0.18]), 2)
        grand = round(total + tip, 2)
        body = f"""
        <div class="paper">
          <div class="logo">☕</div>
          <h1>{merchant}</h1>
          <p class="sub">{date} · Order #{rng.randint(40,99)} · {rng.choice(['Dine in','Takeaway'])}</p>
          <table>{item_rows_html(rows, sym)}</table>
          <table class="tot">
            <tr><td>Subtotal</td><td class="r">{sym}{subtotal:.2f}</td></tr>
            <tr><td>Tax</td><td class="r">{sym}{tax:.2f}</td></tr>
            {f"<tr><td>Tip</td><td class='r'>{sym}{tip:.2f}</td></tr>" if tip else ""}
            <tr class="big"><td>Total ({cur})</td><td class="r">{sym}{grand:.2f}</td></tr>
          </table>
          <p class="thanks">see you tomorrow ❤</p>
          <p class="tiny">{DISCLAIMER}</p>
        </div>"""
        css = """
        body{background:#c9b8a3;display:flex;justify-content:center;padding:30px 0;font-family:Georgia,serif}
        .paper{width:360px;background:#fffdf6;padding:30px 28px;border-radius:6px;box-shadow:0 8px 22px rgba(60,40,20,.4);transform:rotate(0.8deg)}
        .logo{text-align:center;font-size:30px}
        h1{font-size:23px;text-align:center;margin:4px 0;font-style:italic;color:#4a3626}
        .sub{text-align:center;font-size:11px;color:#8a7a66;margin:0 0 14px}
        table{width:100%;font-size:13.5px;border-collapse:collapse;color:#33281c}
        td{padding:4px 0;border-bottom:1px solid #f0e8d8}.c{text-align:center}.r{text-align:right}
        .tot{margin-top:10px}.tot td{border:none;padding:2.5px 0}
        .big td{font-weight:bold;font-size:16px;border-top:2px solid #4a3626;padding-top:6px}
        .thanks{text-align:center;font-size:12px;color:#8a7a66;font-style:italic;margin:14px 0 2px}
        .tiny{font-size:8.5px;color:#bbb;text-align:center;margin:4px 0 0}"""
        size = (440, 640)

    elif kind == "restaurant":
        rows = pick_items(kind, rng.randint(3, 5))
        subtotal, tax, total = money_math(rows, tax_rate)
        body = f"""
        <div class="paper">
          <div class="band"><h1>{merchant}</h1></div>
          <div class="inner">
          <p class="sub">Server: {rng.choice(['Dana','Marco','Priya','Leo'])} · Table {rng.randint(2,18)} · Guests {rng.randint(1,5)}<br>{date} {rng.randint(17,21)}:{rng.randint(10,59)}</p>
          <table>{item_rows_html(rows, sym)}</table>
          <table class="tot">
            <tr><td>Subtotal</td><td class="r">{sym}{subtotal:.2f}</td></tr>
            <tr><td>Tax ({tax_rate*100:.1f}%)</td><td class="r">{sym}{tax:.2f}</td></tr>
            <tr class="big"><td>TOTAL {cur}</td><td class="r">{sym}{total:.2f}</td></tr>
          </table>
          <p class="foot">Gratuity not included · Thank you!</p>
          <p class="tiny">{DISCLAIMER}</p>
          </div>
        </div>"""
        accent = rng.choice(["#7a1f1f", "#1f4d3a", "#3a2a5e"])
        css = f"""
        body{{background:#5c5650;display:flex;justify-content:center;padding:26px 0;font-family:'Trebuchet MS',sans-serif}}
        .paper{{width:400px;background:#fff;box-shadow:0 8px 20px rgba(0,0,0,.5);transform:rotate(-0.6deg)}}
        .band{{background:{accent};padding:16px}}
        h1{{color:#fff;font-size:20px;text-align:center;margin:0;letter-spacing:2px;text-transform:uppercase}}
        .inner{{padding:18px 24px 22px}}
        .sub{{text-align:center;font-size:11.5px;color:#777;margin:0 0 12px;line-height:1.5}}
        table{{width:100%;font-size:13px;border-collapse:collapse}}
        td{{padding:4px 0;border-bottom:1px dotted #ddd}}.c{{text-align:center}}.r{{text-align:right}}
        .tot{{margin-top:8px}}.tot td{{border:none;padding:3px 0}}
        .big td{{font-weight:bold;font-size:15.5px;border-top:2px solid {accent};padding-top:6px;color:{accent}}}
        .foot{{text-align:center;font-size:11px;color:#999;margin:12px 0 2px}}
        .tiny{{font-size:8.5px;color:#ccc;text-align:center;margin:4px 0 0}}"""
        size = (480, 640)

    elif kind == "invoice":
        rows = pick_items(kind, rng.randint(3, 6))
        subtotal, tax, total = money_math(rows, tax_rate)
        body = f"""
        <div class="paper">
          <div class="head">
            <div><h1>{merchant}</h1><p class="addr">1400 Commerce Way, Suite {rng.randint(100,900)}</p></div>
            <div class="meta">RECEIPT<br><b>#{rcpt_no}</b><br>{date}</div>
          </div>
          <table class="items">
            <tr class="th"><td>Description</td><td class="c">Qty</td><td class="r">Unit</td><td class="r">Amount</td></tr>
            {item_rows_html(rows, sym)}
          </table>
          <div class="totwrap"><table class="tot">
            <tr><td>Subtotal</td><td class="r">{sym}{subtotal:.2f}</td></tr>
            <tr><td>{'VAT' if cur in ('EUR','GBP') else 'Sales tax'} {tax_rate*100:.1f}%</td><td class="r">{sym}{tax:.2f}</td></tr>
            <tr class="big"><td>Total {cur}</td><td class="r">{sym}{total:.2f}</td></tr>
          </table></div>
          <p class="paid">PAID · card ****{rng.randint(1000,9999)}</p>
          <p class="tiny">{DISCLAIMER}</p>
        </div>"""
        css = """
        body{background:#9aa2ad;display:flex;justify-content:center;padding:24px 0;font-family:Arial,Helvetica,sans-serif}
        .paper{width:560px;background:#fff;padding:28px 32px;box-shadow:0 6px 18px rgba(0,0,0,.4)}
        .head{display:flex;justify-content:space-between;border-bottom:3px solid #23456e;padding-bottom:12px;margin-bottom:14px}
        h1{font-size:19px;color:#23456e;margin:0}
        .addr{font-size:10.5px;color:#888;margin:4px 0 0}
        .meta{text-align:right;font-size:11px;color:#555;line-height:1.6}
        .items{width:100%;font-size:12.5px;border-collapse:collapse}
        .items td{padding:6px 4px;border-bottom:1px solid #eee}
        .th td{background:#f2f5f9;color:#23456e;font-weight:bold;font-size:11px;text-transform:uppercase}
        .c{text-align:center}.r{text-align:right}
        .totwrap{display:flex;justify-content:flex-end;margin-top:10px}
        .tot{width:240px;font-size:12.5px}.tot td{padding:3px 4px}
        .big td{font-weight:bold;font-size:15px;border-top:2px solid #23456e;color:#23456e}
        .paid{color:#1f7a43;font-weight:bold;font-size:12px;letter-spacing:1px;margin:14px 0 2px}
        .tiny{font-size:8.5px;color:#ccc;margin:2px 0 0}"""
        size = (640, 560)

    else:  # fuel
        rows = pick_items(kind, rng.randint(2, 4))
        subtotal, tax, total = money_math(rows, tax_rate)
        body = f"""
        <div class="paper">
          <h1>⛽ {merchant}</h1>
          <p class="sub">PUMP {rng.randint(1,12)} · {date} {rng.randint(6,22)}:{rng.randint(10,59)}<br>TXN {rcpt_no}</p>
          <div class="dash"></div>
          <table>{item_rows_html(rows, sym)}</table>
          <div class="dash"></div>
          <table class="tot">
            <tr><td>SUBTOTAL</td><td class="r">{sym}{subtotal:.2f}</td></tr>
            <tr><td>TAX</td><td class="r">{sym}{tax:.2f}</td></tr>
            <tr class="big"><td>TOTAL {cur}</td><td class="r">{sym}{total:.2f}</td></tr>
          </table>
          <p class="sub">DEBIT ****{rng.randint(1000,9999)} APPROVED</p>
          <p class="tiny">{DISCLAIMER}</p>
        </div>"""
        css = """
        body{background:#6e7b6a;display:flex;justify-content:center;padding:28px 0;font-family:Verdana,monospace}
        .paper{width:360px;background:#fbfbee;padding:24px 20px;box-shadow:0 6px 16px rgba(0,0,0,.5);transform:rotate(1.1deg)}
        h1{font-size:16px;text-align:center;margin:0;color:#233}
        .sub{text-align:center;font-size:10.5px;color:#556;margin:6px 0;line-height:1.5}
        .dash{border-top:2px dotted #aab;margin:8px 0}
        table{width:100%;font-size:12px;border-collapse:collapse}
        td{padding:3px 0}.c{text-align:center}.r{text-align:right}
        .big td{font-weight:bold;font-size:14.5px;padding-top:5px}
        .tiny{font-size:8.5px;color:#aab;text-align:center;margin:6px 0 0}"""
        size = (440, 560)

    html = f"<!doctype html><html><head><meta charset='utf-8'><style>*{{margin:0;box-sizing:border-box}}{css}</style></head><body>{body}</body></html>"
    return html, size


def main():
    kinds = (["thermal"] * 5 + ["cafe"] * 4 + ["restaurant"] * 4 + ["invoice"] * 4 + ["fuel"] * 3)
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("synthetic-receipt-*.jpg"):
        old.unlink()
    manifest = []
    with tempfile.TemporaryDirectory() as td:
        for i, kind in enumerate(kinds, 1):
            html, (w, h) = build_html(kind, i)
            page = Path(td) / f"r{i}.html"
            page.write_text(html)
            png = Path(td) / f"r{i}.png"
            subprocess.run([CHROME, "--headless", "--disable-gpu", f"--screenshot={png}",
                            f"--window-size={w},{h}", "--hide-scrollbars", str(page)],
                           check=True, capture_output=True)
            name = f"synthetic-receipt-{i:02d}.jpg"
            subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "88",
                            str(png), "--out", str(OUT / name)], check=True, capture_output=True)
            manifest.append(name)
            print(f"  {name}  ({kind})")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"{len(manifest)} receipts written to {OUT}")


if __name__ == "__main__":
    main()
