// ============================================================
//  core/db.js — хранилище данных (npoint.io)
//  Умный кэш: один запрос на старте, повторные не идут в сеть
// ============================================================

const DB = (() => {
  const BASE = "https://api.npoint.io";

  // Promise-кэш: если запрос уже идёт — ждём его, не дублируем
  let _promises = { sales: null, menu: null };
  let _cache    = { sales: null, menu: null };

  async function _load(binId, key) {
    // Уже загружено — отдаём сразу
    if (_cache[key] !== null) return _cache[key];
    // Уже идёт запрос — ждём его результат
    if (_promises[key]) return _promises[key];

    _promises[key] = fetch(`${BASE}/${binId}`)
      .then(res => {
        if (!res.ok) throw new Error(`Ошибка загрузки (${res.status})`);
        return res.json();
      })
      .then(data => {
        _cache[key] = Array.isArray(data) ? data : [];
        return _cache[key];
      })
      .catch(err => {
        _promises[key] = null; // сброс чтобы можно было повторить
        throw err;
      });

    return _promises[key];
  }

  async function _save(binId, records) {
    const res = await fetch(`${BASE}/${binId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(records),
    });
    if (!res.ok) throw new Error(`Ошибка сохранения (${res.status})`);
  }

  // ---------- SALES ----------
  async function getSales() {
    return _load(CONFIG.NPOINT.SALES, "sales");
  }

  async function addSales(records) {
    const all = await getSales();
    const key = r => `${r.date}|${r.hour}|${r.channel}`;
    const existing = new Set(all.map(key));
    const fresh = records.filter(r => !existing.has(key(r)));
    if (!fresh.length) return 0;
    const merged = [...all, ...fresh];
    await _save(CONFIG.NPOINT.SALES, merged);
    _cache.sales = merged;
    return fresh.length;
  }

  async function clearSales() {
    await _save(CONFIG.NPOINT.SALES, []);
    _cache.sales = [];
    _promises.sales = null;
  }

  // ---------- MENU ----------
  async function getMenu() {
    return _load(CONFIG.NPOINT.MENU, "menu");
  }

  async function addMenu(records) {
    const all = await getMenu();
    const key = r => `${r.date}|${r.dish}`;
    const existing = new Set(all.map(key));
    const fresh = records.filter(r => !existing.has(key(r)));
    if (!fresh.length) return 0;
    const merged = [...all, ...fresh];
    await _save(CONFIG.NPOINT.MENU, merged);
    _cache.menu = merged;
    return fresh.length;
  }

  async function clearMenu() {
    await _save(CONFIG.NPOINT.MENU, []);
    _cache.menu = [];
    _promises.menu = null;
  }

  function clearCache() {
    _cache    = { sales: null, menu: null };
    _promises = { sales: null, menu: null };
  }

  return { getSales, addSales, clearSales, getMenu, addMenu, clearMenu, clearCache };
})();

window.DB = DB;
