#!/usr/bin/env python3
"""Browser smoke test for the sequence stratigraphy teaching page.

Serves /home/claude/seqstrat on a free localhost port, drives index.html with
Chrome via Playwright, prints PASS/FAIL per check, and exits non-zero on any
failure. Read-only with respect to the page files; writes only screenshots
into shots/.

Usage: python3 /home/claude/seqstrat/ui_smoke.py
"""
import functools
import hashlib
import os
import re
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
SHOTS = os.path.join(ROOT, "tests", "shots")
CHROME = os.environ.get("CHROME_PATH") or None  # None = Playwright's own Chromium
IGNORE = ("ERR_TUNNEL", "fonts.g", "favicon")
RUN_TIMEOUT = 90_000

results = []   # (name, ok)
errors = []    # filtered page and console errors, tagged by phase


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".png": "image/png",
        ".json": "application/json",
        "": "application/octet-stream",
    }

    def log_message(self, *args):
        pass


def check(name, ok, detail):
    results.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'} {name}: {detail}", flush=True)


# Runs before any page script. Counts completed runs (writes to #status) and
# notes whether the pill ever showed a progress percentage.
INIT_JS = """
(() => {
  window.__pctSeen = false;
  window.__statusDone = 0;
  window.__lastStatus = '';
  const scan = () => {
    const p = document.getElementById('pill');
    const s = document.getElementById('status');
    if (p && p.textContent.indexOf('%') >= 0) window.__pctSeen = true;
    if (s) {
      const t = s.textContent;
      if (t !== window.__lastStatus && t.indexOf('Starting') !== 0) {
        window.__lastStatus = t;
        window.__statusDone++;
      }
    }
  };
  new MutationObserver(scan).observe(document, {subtree: true, childList: true, characterData: true});
})();
"""

CANVAS_HASH_JS = """
(id) => document.getElementById(id).toDataURL()
"""


def md5(s):
    return hashlib.md5(s.encode()).hexdigest()[:12]


def attach_errors(page, tag, workers):
    page.on("pageerror", lambda e: errors.append(f"[{tag}] pageerror: {e}"))

    def on_console(m):
        if m.type != "error":
            return
        url = (m.location or {}).get("url", "") or ""
        text = m.text or ""
        if any(s in text or s in url for s in IGNORE):
            return
        errors.append(f"[{tag}] console: {text} @ {url}")

    page.on("console", on_console)
    page.on("worker", lambda w: workers.append(w.url))


def wait_run(page, before):
    """Wait for one more completed run; return the final #status text."""
    page.wait_for_function("n => window.__statusDone > n", arg=before, timeout=RUN_TIMEOUT)
    return page.text_content("#status")


def done_count(page):
    return page.evaluate("window.__statusDone")


def run_ms(text):
    m = re.match(r"Run time (\d+) ms", text or "")
    return int(m.group(1)) if m else None


def set_slider(page, cid, value):
    page.evaluate(
        """([id, v]) => {
            const el = document.getElementById(id);
            el.value = v;
            el.dispatchEvent(new Event('input', {bubbles: true}));
            el.dispatchEvent(new Event('change', {bubbles: true}));
        }""",
        [cid, value],
    )


def main():
    os.makedirs(SHOTS, exist_ok=True)
    handler = functools.partial(Handler, directory=ROOT)
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}/index.html"
    print(f"serving {ROOT} at {base}", flush=True)

    presets_ms = {}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
            ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
            ctx.add_init_script(INIT_JS)
            page = ctx.new_page()
            workers = []
            attach_errors(page, "http", workers)

            # ---- 1. first run completes in the worker
            t0 = time.time()
            page.goto(base, wait_until="domcontentloaded")
            try:
                page.wait_for_function(
                    "window.__statusDone >= 1", timeout=RUN_TIMEOUT
                )
                status = page.text_content("#status")
                ok_run = status.startswith("Run time")
            except Exception as e:
                status = f"timeout ({e.__class__.__name__})"
                ok_run = False
            pct = page.evaluate("window.__pctSeen")
            wk = any(u.endswith("worker.js") for u in workers)
            check(
                "1 first run in worker",
                ok_run and pct and wk,
                f"status='{status[:40]}' in {time.time()-t0:.1f}s, "
                f"pill-% seen={pct}, worker.js created={wk}",
            )

            # ---- 2. page stays responsive during a run (ref preset, ~14 s)
            before = done_count(page)
            page.select_option("#preset", "ref")
            page.wait_for_function(
                "document.getElementById('pill').classList.contains('on')", timeout=10_000
            )
            lat = []
            t_end = time.time() + 60
            while time.time() < t_end:
                if not page.evaluate("document.getElementById('pill').classList.contains('on')"):
                    break
                t1 = time.perf_counter()
                page.evaluate("1 + 1")
                lat.append(time.perf_counter() - t1)
                time.sleep(0.05)
            wait_run(page, before)
            worst = max(lat) if lat else float("inf")
            check(
                "2 responsive during run",
                lat and worst < 0.5,
                f"{len(lat)} probes while running, worst evaluate {worst*1000:.0f} ms",
            )

            # ---- 3. slider does not auto-run; Run button does
            before = done_count(page)
            status_before = page.text_content("#status")
            set_slider(page, "c-amp", 20)
            time.sleep(1.5)
            auto_ran = done_count(page) != before
            status_same = page.text_content("#status") == status_before
            dirty_shown = not page.evaluate("document.getElementById('dirty').hidden")
            pre_click = (not auto_ran) and status_same and dirty_shown
            page.click("#runBtn")
            status3 = wait_run(page, before)
            dirty_hidden = page.evaluate("document.getElementById('dirty').hidden")
            check(
                "3 slider marks dirty, Run button runs",
                pre_click and status3.startswith("Run time") and dirty_hidden,
                f"auto_run={auto_ran}, status_unchanged={status_same}, "
                f"dirty_shown={dirty_shown}, after Run: '{status3[:30]}', dirty_hidden={dirty_hidden}",
            )

            # ---- 4. every preset runs to completion
            options = page.eval_on_selector_all("#preset option", "els => els.map(e => e.value)")
            options = [o for o in options if o != "custom"]
            all_ok = True
            details = []
            for name in options:
                n_err = len(errors)
                before = done_count(page)
                page.select_option("#preset", name)
                st = wait_run(page, before)
                ms = run_ms(st)
                good = ms is not None and len(errors) == n_err
                all_ok = all_ok and good
                presets_ms[name] = (ms, st if ms is None else "")
                details.append(f"{name}={ms} ms" if ms is not None else f"{name}=ERR '{st[:50]}'")
                if name in ("default", "ref"):
                    time.sleep(0.4)
                    page.locator("#secBase").screenshot(
                        path=os.path.join(SHOTS, f"smoke_{name}.png")
                    )
            check("4 all presets complete", all_ok, "; ".join(details))

            # ---- 5. exercise mode and whole-basin toggles
            n_err = len(errors)
            page.click("#optExercise")
            time.sleep(0.4)
            banner_on = page.is_visible("#banner")
            page.click("#optExercise")
            time.sleep(0.4)
            banner_off = not page.is_visible("#banner")
            page.click("#optWhole")
            time.sleep(0.4)
            whole_on = page.is_checked("#optWhole")
            page.click("#optWhole")
            time.sleep(0.4)
            whole_off = not page.is_checked("#optWhole")
            check(
                "5 exercise and whole-basin toggle",
                banner_on and banner_off and whole_on and whole_off and len(errors) == n_err,
                f"exercise banner on/off={banner_on}/{banner_off}, "
                f"whole on/off={whole_on}/{whole_off}, new errors={len(errors)-n_err}",
            )

            # ---- 6. wells: clear and place
            h0 = md5(page.evaluate(CANVAS_HASH_JS, "wellCv"))
            page.click("#clearWells")
            time.sleep(0.3)
            h1 = md5(page.evaluate(CANVAS_HASH_JS, "wellCv"))
            page.locator("#secOver").scroll_into_view_if_needed()  # clearing wells scrolls the page
            time.sleep(0.2)
            box = page.locator("#secOver").bounding_box()
            page.mouse.click(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.4)
            time.sleep(0.4)
            h2 = md5(page.evaluate(CANVAS_HASH_JS, "wellCv"))
            check(
                "6 wells clear and place",
                h1 != h0 and h2 != h1,
                f"wells panel hash default={h0} cleared={h1} after click={h2}",
            )

            # ---- 7. no horizontal overflow at desktop and phone widths
            page.set_viewport_size({"width": 1400, "height": 1000})
            time.sleep(0.5)
            d = page.evaluate(
                "[document.documentElement.scrollWidth, window.innerWidth]"
            )
            page.set_viewport_size({"width": 400, "height": 900})
            time.sleep(0.8)
            m = page.evaluate(
                "[document.documentElement.scrollWidth, window.innerWidth]"
            )
            check(
                "7 no horizontal overflow",
                d[0] <= d[1] and m[0] <= m[1],
                f"1400: scrollWidth={d[0]} innerWidth={d[1]}; 400: scrollWidth={m[0]} innerWidth={m[1]}",
            )
            # ---- 11. "Colour by" switches section, Wheeler and wells without starting a run
            page.set_viewport_size({"width": 1400, "height": 1000})
            time.sleep(0.6)
            n_err = len(errors)
            ids = ("secBase", "wheelCv", "wellCv")
            before_runs = done_count(page)
            h_sand = [md5(page.evaluate(CANVAS_HASH_JS, i)) for i in ids]
            page.check('input[name="colourBy"][value="rate"]')
            time.sleep(0.6)
            h_rate = [md5(page.evaluate(CANVAS_HASH_JS, i)) for i in ids]
            page.check('input[name="colourBy"][value="sand"]')
            time.sleep(0.6)
            h_back = [md5(page.evaluate(CANVAS_HASH_JS, i)) for i in ids]
            # exercise mode must colour by sand content even when rate is chosen
            page.click("#optExercise")
            time.sleep(0.6)
            h_ex_sand = md5(page.evaluate(CANVAS_HASH_JS, "secBase"))
            page.evaluate("""() => { const e = document.querySelector('input[name="colourBy"][value="rate"]');
                e.disabled = false; e.click(); e.disabled = true; }""")
            time.sleep(0.6)
            h_ex_rate = md5(page.evaluate(CANVAS_HASH_JS, "secBase"))
            radios_off = page.evaluate("[...document.querySelectorAll('input[name=colourBy]')].every(e => e.disabled)")
            page.click("#optExercise")
            time.sleep(0.6)
            h_after = md5(page.evaluate(CANVAS_HASH_JS, "secBase"))
            page.check('input[name="colourBy"][value="sand"]')
            time.sleep(0.4)
            ex_sand = h_ex_rate == h_ex_sand and radios_off and h_after == h_rate[0]
            no_run = done_count(page) == before_runs
            check(
                "11 colour by accumulation rate",
                all(a != b for a, b in zip(h_sand, h_rate)) and h_back == h_sand
                and ex_sand and no_run and len(errors) == n_err,
                f"changed section/wheeler/wells={[a != b for a, b in zip(h_sand, h_rate)]}, "
                f"back to sand identical={h_back == h_sand}, exercise forces sand={h_ex_rate == h_ex_sand}, "
                f"radios disabled in exercise={radios_off}, rate restored after exercise={h_after == h_rate[0]}, "
                f"no run started={no_run}, new errors={len(errors)-n_err}",
            )

            # ---- 10. well logs are 8:1 (height:width) at desktop and phone widths
            logs = {}
            for vw, vh in ((1400, 1000), (400, 900)):
                page.set_viewport_size({"width": vw, "height": vh})
                time.sleep(0.8)
                logs[vw] = page.evaluate("document.getElementById('wellCv').dataset.log || ''")
            def ratio(t):
                m = re.match(r"(\d+)x(\d+)$", t)
                return int(m.group(2)) / int(m.group(1)) if m else 0
            check(
                "10 well logs 8:1",
                all(abs(ratio(t) - 8) < 0.01 for t in logs.values()),
                "; ".join(f"{k} px: log {v or 'missing'} (ratio {ratio(v):.2f})" for k, v in logs.items()),
            )
            page.set_viewport_size({"width": 1400, "height": 1000})
            page.close()

            # ---- 8. file:// fallback (workers blocked) completes a run
            fpage = ctx.new_page()
            fworkers = []
            attach_errors(fpage, "file", fworkers)
            fpage.goto("file://" + os.path.join(ROOT, "index.html"), wait_until="domcontentloaded")
            try:
                fpage.wait_for_function("window.__statusDone >= 1", timeout=RUN_TIMEOUT)
                fst = fpage.text_content("#status")
            except Exception as e:
                fst = f"timeout ({e.__class__.__name__})"
            check(
                "8 file:// fallback run completes",
                fst.startswith("Run time"),
                f"status='{fst[:40]}', dedicated workers created={len(fworkers)}",
            )
            fpage.close()
            browser.close()
    finally:
        srv.shutdown()
        srv.server_close()

    check(
        "9 zero collected errors",
        not errors,
        "none" if not errors else f"{len(errors)} error(s): " + " | ".join(errors[:5]),
    )

    print("\nper-preset run times (worker ms):", flush=True)
    for k, (ms, _) in presets_ms.items():
        print(f"  {k}: {ms if ms is not None else 'ERROR'}", flush=True)

    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
