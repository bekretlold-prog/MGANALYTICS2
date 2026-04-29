// ============================================================
//  core/db.js — хранилище данных (npoint.io)
//  Когда переедешь на VPS — меняешь только этот файл
// ============================================================

const DB = (() => {
  const BASE = "https://api.npoint.io";
  let _cache = { sales: null, menu: null };

  async function _load(binId) {
    const res = await fetch(`${BASE}/${binId}`);
    if (!res.ok) throw new Error(`Ошибка загрузки (${res.status})`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async function _save(binId, records) {
    const res = await fetch(`${BASE}/${binId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(records),
    });
    if (!res.ok) throw new Error(`Ошибка сохранения (${res.status})`);
  }

  // ---------- SALES (почасовой отчёт) ----------
  async function getSales() {
    if (!_cache.sales) _cache.sales = await _load(CONFIG.NPOINT.SALES);
    return _cache.sales;
  }

  async function addSales(records) {
    const all = await getSales();
    // дедупликация по дате+часу+каналу
    const key = (r) => `${r.date}|${r.hour}|${r.channel}`;
    const existing = new Set(all.map(key));
    const fresh = records.filter((r) => !existing.has(key(r)));
    if (!fresh.length) return 0;
    const merged = [...all, ...fresh];
    await _save(CONFIG.NPOINT.SALES, merged);
    _cache.sales = merged;
    return fresh.length;
  }

  async function clearSales() {
    await _save(CONFIG.NPOINT.SALES, []);
    _cache.sales = [];
  }

  // ---------- MENU (Prod Mix) ----------
  async function getMenu() {
    if (!_cache.menu) _cache.menu = await _load(CONFIG.NPOINT.MENU);
    return _cache.menu;
  }

  async function addMenu(records) {
    const all = await getMenu();
    // дедупликация по дате+блюду
    const key = (r) => `${r.date}|${r.dish}`;
    const existing = new Set(all.map(key));
    const fresh = records.filter((r) => !existing.has(key(r)));
    if (!fresh.length) return 0;
    const merged = [...all, ...fresh];
    await _save(CONFIG.NPOINT.MENU, merged);
    _cache.menu = merged;
    return fresh.length;
  }

  async function clearMenu() {
    await _save(CONFIG.NPOINT.MENU, []);
    _cache.menu = [];
  }

  // ---------- сброс кэша ----------
  function clearCache() {
    _cache = { sales: null, menu: null };
  }

  return { getSales, addSales, clearSales, getMenu, addMenu, clearMenu, clearCache };
})();

window.DB = DB;
