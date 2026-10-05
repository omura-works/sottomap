import { expect, test, type Page } from "@playwright/test";

// SPEC motion §8.4・§6.2・§6.3・§6.6: 当たり判定・フォーカスの輪・拡大（幅 320px）の自動の確認。
// データを書き換えない（見るだけ）。

const PAGES = [
  "/start",
  "/sapporo",
  "/sapporo/search",
  "/sapporo/spots/d0000000-0000-4000-8000-000000000001",
  "/bookmarks",
  "/me",
  "/verify/80000000-0000-4000-8000-000000000009",
  "/login",
  "/contact",
  "/faq",
  "/shops",
  "/terms",
  "/sapporo/spots/new",
];

/** §6.2 の表の部品（独立したリンクを含む）。文の中のリンクは対象外。 */
const TARGETS = [
  ".btn",
  ".chip-hit",
  ".start-city-chip",
  "nav a",
  ".btn.answer",
  "label.radio",
  "summary",
  ".map-pending-link",
  ".me-pending-link a",
  ".site-footer-links a",
  ".map-bm-btn",
].join(", ");

/** 入りの動き（有限回の animation）が終わるまで待つ。途中の scale で当たり判定を小さく測らないため。 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page
    .waitForFunction(
      () =>
        document.getAnimations().every((a) => {
          const timing = a.effect?.getComputedTiming();
          return a.playState !== "running" || timing?.iterations === Infinity;
        }),
      undefined,
      { timeout: 6000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(200);
}

async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // 見えていない（PC/スマホの片方だけの部品）
      if (el.closest("[inert], [aria-hidden='true']")) continue;
      if (r.width < 43.5 || r.height < 43.5) {
        bad.push(`${el.tagName}.${String(el.className).slice(0, 40)} 「${(el.textContent ?? "").trim().slice(0, 16)}」 ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return bad;
  }, TARGETS);
}

for (const viewport of [
  { name: "スマホ 390×844", width: 390, height: 844 },
  { name: "PC 1280×800", width: 1280, height: 800 },
]) {
  test.describe(`当たり判定 44×44px 以上（${viewport.name}）`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    for (const path of PAGES) {
      test(path, async ({ page }) => {
        await page.goto(path);
        await settle(page);
        expect(await smallTargets(page)).toEqual([]);
      });
    }
  });
}

test("地図のピン: 外側の中心から ±20px の4点が、ピン（外側かその子）を指す", async ({ page }) => {
  await page.goto("/sapporo");
  await expect(page.locator(".map-pin-hit-area:not([inert])").first()).toBeVisible({ timeout: 15000 });
  const results = await page.evaluate(() => {
    return Array.from(document.querySelectorAll<HTMLElement>(".map-pin-hit-area")).map((pin) => {
      const r = pin.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      return [
        [cx - 20, cy],
        [cx + 20, cy],
        [cx, cy - 20],
        [cx, cy + 20],
      ].every(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        // 重なった別のピンに当たるのは可（どちらもピン）
        return hit !== null && hit.closest(".map-pin-hit-area") !== null;
      });
    });
  });
  expect(results.length).toBeGreaterThan(0);
  // 重なっていないピンが少なくとも1つあり、そのピンは4点とも当たる
  expect(results.some(Boolean)).toBe(true);
});

/** 今フォーカスのある要素の輪（要素自身か、輪を描く見た目の子・隣）。 */
async function focusRing(page: Page): Promise<{ desc: string; style: string; color: string; night: boolean } | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const candidates: Element[] = [el];
    const visual = el.querySelector(".chip, .pin-stamp");
    if (visual) candidates.unshift(visual);
    if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) {
      const dot = el.nextElementSibling;
      if (dot) candidates.unshift(dot);
      const seg = el.closest(".seg-opt");
      if (seg) candidates.unshift(seg);
    }
    let style = "none";
    let color = "";
    for (const c of candidates) {
      const cs = getComputedStyle(c);
      if (cs.outlineStyle !== "none" && cs.outlineWidth !== "0px") {
        style = cs.outlineStyle;
        color = cs.outlineColor;
        break;
      }
      if (cs.boxShadow !== "none" && c !== el) {
        style = "box-shadow";
        color = "";
        break;
      }
    }
    const night = el.closest(".night-card, .night-band, .login-night, .sticky[data-tone='night'], .lantern-badge") !== null;
    const paperInNight = el.closest(".card, .dialog, .login-card, .start-chooser, .sticky[data-tone='orange'], .sticky[data-tone='moss']") !== null;
    return { desc: `${el.tagName}.${String(el.className).slice(0, 30)}`, style, color, night: night && !paperInNight };
  });
}

test.describe("フォーカスの輪（Tab で進む）", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  for (const path of ["/start", "/sapporo", "/bookmarks", "/verify/80000000-0000-4000-8000-000000000009", "/login"]) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const accent300 = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "var(--color-accent-300)";
        document.body.appendChild(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      });
      const problems: string[] = [];
      for (let i = 0; i < 18; i++) {
        await page.keyboard.press("Tab");
        const ring = await focusRing(page);
        if (!ring) continue;
        if (ring.style === "none") problems.push(`${ring.desc}: 輪が無い`);
        if (ring.night && ring.color && ring.color !== accent300) problems.push(`${ring.desc}: 夜の面で輪が ${ring.color}`);
      }
      expect(problems).toEqual([]);
    });
  }
});

test.describe("拡大: 幅 320px で横にスクロールしない（§6.6）", () => {
  test.use({ viewport: { width: 320, height: 720 } });
  for (const path of PAGES) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
