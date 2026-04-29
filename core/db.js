// ============================================================
//  core/db.js — хранилище данных (IndexedDB)
//  Данные хранятся локально в браузере, работает офлайн
// ============================================================

const DB = (() => {
  const DB_NAME    = "RestaurantAnalytics";
  const DB_VERSION = 1;
  let _db = null;

  // Открываем/создаём базу
  function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("sales")) {
          const s = db.createObjectStore("sales", { keyPath: "id", autoIncrement: true });
          s.createIndex("date", "date", { unique: false });
          s.createIndex("date_hour", ["date","hour"], { unique: false });
        }
        if (!db.objectStoreNames.contains("menu")) {
          const m = db.createObjectStore("menu", { keyPath: "id", autoIncrement: true });
          m.createIndex("date", "date", { unique: false });
          m.createIndex("date_dish", ["date","dish"], { unique: false });
        }
      };
    });
  }

  // Получить все записи из store
  async function getAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  // Добавить записи с дедупликацией
  async function addWithDedup(storeName, records, keyFn) {
    const db  = await openDB();
    const all = await getAll(storeName);
    const existing = new Set(all.map(keyFn));
    const fresh = records.filter(r => !existing.has(keyFn(r)));
    if (!fresh.length) return 0;

    return new Promise((resolve, reject) => {
      const tx    = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      fresh.forEach(r => store.add(r));
      tx.oncomplete = () => resolve(fresh.length);
      tx.onerror    = () => reject(tx.error);
    });
  }

  // Очистить store
  async function clearStore(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).clear();
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  }

  // ---------- SALES ----------
  async function getSales() {
    return getAll("sales");
  }

  async function addSales(records) {
    return addWithDedup("sales", records, r => `${r.date}|${r.hour}`);
  }

  async function clearSales() {
    return clearStore("sales");
  }

  // ---------- MENU ----------
  async function getMenu() {
    return getAll("menu");
  }

  async function addMenu(records) {
    return addWithDedup("menu", records, r => `${r.date}|${r.dish}`);
  }

  async function clearMenu() {
    return clearStore("menu");
  }

  // clearCache — оставляем для совместимости, IndexedDB не кэшируется в памяти
  function clearCache() {}

  return { getSales, addSales, clearSales, getMenu, addMenu, clearMenu, clearCache };
})();

window.DB = DB;
