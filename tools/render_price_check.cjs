#!/usr/bin/env node
const fs = require("fs");
const { chromium } = require("playwright");

function parsePrice(raw) {
  if (!raw) return null;
  const match = raw.match(/[0-9]{1,3}(?:[.,][0-9]{3}){2,}\s*(?:đ|₫|vnd)?/i);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return value >= 500000 && value <= 100000000 ? value : null;
}

function normalizeText(raw) {
  return (raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const OOS_PHRASES = [
  "tam het hang",
  "khong co hang",
  "hang sap ve",
  "sap ve",
  "het hang",
  "ngung kinh doanh",
  "lien he tu van",
  "sold out",
  "san pham can tu van",
  "out of stock",
];
const PURCHASE_ACTION_OOS_PHRASES = [
  "cho lien he",
  "lien he tu van",
  "sap ve hang",
  "san pham ngung kinh doanh",
  "tam het hang",
  "khong co hang",
  "hang sap ve",
  "ngung kinh doanh",
  "sold out",
  "out of stock",
];
const PURCHASE_ACTION_OK_PHRASES = [
  "mua hang",
  "dat hang",
  "mua ngay",
  "them vao gio",
];

function hasOosText(raw) {
  const normalized = normalizeText(raw);
  return OOS_PHRASES.some((phrase) => normalized.includes(phrase));
}

function pricesInText(raw) {
  const matches = (raw || "").match(/[0-9]{1,3}(?:[.,][0-9]{3}){2,}\s*(?:đ|₫|vnd)?/gi) || [];
  return matches.map(parsePrice).filter(Boolean);
}

function classifyPurchaseAction(raw) {
  const normalized = normalizeText(raw);
  if (PURCHASE_ACTION_OOS_PHRASES.some((phrase) => normalized.includes(phrase))) return "OOS";
  if (PURCHASE_ACTION_OK_PHRASES.some((phrase) => normalized.includes(phrase))) return "IN_STOCK";
  return "";
}

function selectorCandidates(retailer) {
  if (retailer === "CPS") return [".sale-price", ".box-product-price"];
  if (retailer === "Shopdunk") return ["[id^='price-value-']", ".new-price", ".product-price"];
  if (retailer === "MW") return [".box_saving .bs_price strong", ".box_saving", ".box-price-present", ".price-one"];
  if (retailer === "FPT") return [".st-price-main", ".price-main", "[data-testid*='price']"];
  if (retailer === "Viettel") return [".version-product.active .txt-price", ".product-detail .price", ".product-info .price", ".product-price"];
  return ["[class*='price']"];
}

async function renderedPrice(page, retailer) {
  const selectors = selectorCandidates(retailer);
  for (const selector of selectors) {
    const texts = await page.locator(selector).evaluateAll((nodes) =>
      nodes.slice(0, 8).map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
    ).catch(() => []);
    for (const text of texts) {
      const price = parsePrice(text);
      if (price) return { price, method: `rendered_dom:${selector}`, text };
    }
  }
  const bodyText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  return { price: parsePrice(bodyText), method: "rendered_body_text", text: bodyText.slice(0, 500) };
}

function actionSelectors(retailer) {
  if (retailer === "Shopdunk") return ["#cart-button-prd button", "#cart-button-prd a", ".btn-mobile button", ".btn-mobile a"];
  if (retailer === "MW") return [".block-button.buy button", ".block-button.buy a", ".block-button button", ".block-button a"];
  if (retailer === "Viettel") return ["#btnDatTruoc", "#btnMuaNgay", ".btn-dathang", ".product-detail button", ".product-detail a"];
  if (retailer === "FPT") return ["main button", "main a", "[data-testid*='buy']", "[data-testid*='order']"];
  if (retailer === "CPS") return ["main button", "main a", ".btn-buy", ".btn-add-cart", "[class*='buy']", "[class*='cart']"];
  return ["main button", "main a"];
}

async function renderedPurchaseAction(page, retailer) {
  for (const selector of actionSelectors(retailer)) {
    const texts = await page.locator(selector).evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .slice(0, 16)
        .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
    ).catch(() => []);
    for (const text of texts) {
      const status = classifyPurchaseAction(text);
      if (status) return { actionStatus: status, actionMethod: `rendered_action:${selector}`, actionText: text.slice(0, 500) };
    }
  }
  return { actionStatus: "", actionMethod: "", actionText: "" };
}

function availabilitySelectors(retailer) {
  const common = ["[itemprop='availability']", "[class*='availability']", "[class*='product-status']"];
  // MW renders stock phrases in reviews, promotions, and recently viewed products.
  // Only its product-detail discontinued state is reliable enough to mark a row OOS.
  if (retailer === "MW") return ["[itemprop='availability']", ".box04.notselling .productstatus", ".box04.notselling"];
  if (retailer === "FPT") return [...common, "#noPrice", ".st-price", ".product-info", "[data-testid*='product']"];
  // Viettel product pages list every capacity at once. Only the selected
  // variant's status is relevant; another variant can legitimately be OOS.
  if (retailer === "Viettel") return [".version-product.active .txt-price"];
  if (retailer === "CPS") return [...common, ".box-product-price", ".box-info-product"];
  if (retailer === "Shopdunk") return [...common, ".stock", ".availability"];
  return common;
}

async function renderedAvailability(page, retailer, rendered) {
  const action = await renderedPurchaseAction(page, retailer);
  if (action.actionStatus === "OOS") {
    return {
      ...action,
      availability: "OOS",
      availabilityMethod: action.actionMethod,
      availabilityText: action.actionText,
    };
  }
  for (const selector of availabilitySelectors(retailer)) {
    const texts = await page.locator(selector).evaluateAll((nodes) =>
      nodes.slice(0, 8).map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
    ).catch(() => []);
    for (const text of texts) {
      if (hasOosText(text)) {
        return { ...action, availability: "OOS", availabilityMethod: `rendered_dom:${selector}`, availabilityText: text.slice(0, 500) };
      }
    }
  }

  if (retailer === "MW" || retailer === "CPS" || retailer === "Shopdunk" || retailer === "Viettel") {
    return { ...action, availability: "", availabilityMethod: "", availabilityText: "" };
  }

  const bodyText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  const normalized = normalizeText(bodyText);
  for (const phrase of OOS_PHRASES) {
    let index = normalized.indexOf(phrase);
    while (index !== -1) {
      const window = normalized.slice(Math.max(0, index - 450), index + phrase.length + 550);
      const nearbyPrices = pricesInText(window);
      if (rendered.price && nearbyPrices.includes(rendered.price)) {
        return { ...action, availability: "OOS", availabilityMethod: "rendered_price_context", availabilityText: window.slice(0, 500) };
      }
      index = normalized.indexOf(phrase, index + phrase.length);
    }
  }
  return { ...action, availability: "", availabilityMethod: "", availabilityText: "" };
}

async function main() {
  const inputPath = process.argv[2];
  const chromePath = process.argv[3] || process.env.PRICE_CHECK_CHROMIUM_BIN || undefined;
  const tasks = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const launchOptions = { headless: true };
  if (chromePath) launchOptions.executablePath = chromePath;
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ locale: "vi-VN" });
  const results = [];

  for (const task of tasks) {
    const page = await context.newPage();
    try {
      if ((task.url || "").includes("cellphones.com.vn")) {
        await context.addCookies([
          { name: "cps_province_id", value: "24", domain: ".cellphones.com.vn", path: "/" },
          { name: "cps_region", value: "1", domain: ".cellphones.com.vn", path: "/" },
        ]);
        await page.addInitScript(() => {
          localStorage.setItem("provinceId", "24");
          localStorage.setItem("cps_province_id", "24");
          localStorage.setItem("cps_region", "1");
        });
      }
      await page.goto(task.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2500);
      const rendered = await renderedPrice(page, task.retailer);
      const availability = await renderedAvailability(page, task.retailer, rendered);
      results.push({
        key: task.key,
        url: task.url,
        ok: Boolean(rendered.price || availability.availability === "OOS"),
        ...rendered,
        ...availability,
      });
    } catch (error) {
      results.push({ key: task.key, url: task.url, ok: false, price: null, method: "render_error", error: String(error.message || error) });
    } finally {
      await page.close().catch(() => {});
    }
  }

  await browser.close();
  process.stdout.write(JSON.stringify(results));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
