// ============================================================
// core/db.js — локальное хранилище (localStorage)
// Теперь поддерживает:
//   - sales (продажи по позициям из Prod_Mix)
//   - menu (меню)
//   - hourly (почасовые данные: дата, час, сумма, чеки)
// ============================================================

const DB = (() => {
    const STORAGE_KEYS = {
        SALES: 'mganalytics_sales',
        MENU: 'mganalytics_menu',
        HOURLY: 'mganalytics_hourly'   // новая коллекция
    };

    function _loadFromStorage(key, defaultValue = []) {
        const data = localStorage.getItem(key);
        if (!data) return defaultValue;
        try {
            return JSON.parse(data);
        } catch (e) {
            console.error(`Ошибка парсинга ${key}:`, e);
            return defaultValue;
        }
    }

    function _saveToStorage(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
        return data;
    }

    // ---------- SALES (продажи по позициям) ----------
    async function getSales() {
        return _loadFromStorage(STORAGE_KEYS.SALES);
    }

    async function addSales(records) {
        const all = await getSales();
        const key = r => `${r.date}|${r.hour}|${r.channel}`;
        const existing = new Set(all.map(key));
        const fresh = records.filter(r => !existing.has(key(r)));
        if (!fresh.length) return 0;
        const merged = [...all, ...fresh];
        _saveToStorage(STORAGE_KEYS.SALES, merged);
        return fresh.length;
    }

    async function clearSales() {
        _saveToStorage(STORAGE_KEYS.SALES, []);
    }

    // ---------- MENU ----------
    async function getMenu() {
        return _loadFromStorage(STORAGE_KEYS.MENU);
    }

    async function addMenu(records) {
        const all = await getMenu();
        const key = r => `${r.date}|${r.dish}`;
        const existing = new Set(all.map(key));
        const fresh = records.filter(r => !existing.has(key(r)));
        if (!fresh.length) return 0;
        const merged = [...all, ...fresh];
        _saveToStorage(STORAGE_KEYS.MENU, merged);
        return fresh.length;
    }

    async function clearMenu() {
        _saveToStorage(STORAGE_KEYS.MENU, []);
    }

    // ---------- HOURLY (почасовые данные) ----------
    async function getHourly() {
        return _loadFromStorage(STORAGE_KEYS.HOURLY);
    }

    async function addHourly(records) {
        const all = await getHourly();
        // Уникальность: дата + час
        const key = r => `${r.date}|${r.hour}`;
        const existing = new Set(all.map(key));
        const fresh = records.filter(r => !existing.has(key(r)));
        if (!fresh.length) return 0;
        const merged = [...all, ...fresh];
        _saveToStorage(STORAGE_KEYS.HOURLY, merged);
        return fresh.length;
    }

    async function clearHourly() {
        _saveToStorage(STORAGE_KEYS.HOURLY, []);
    }

    // ---------- Вспомогательные ----------
    function clearCache() {
        console.log('Cache cleared (localStorage)');
    }

    function getStorageSize() {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length;
            }
        }
        return (total / 1024).toFixed(2) + ' KB';
    }

    return {
        getSales, addSales, clearSales,
        getMenu, addMenu, clearMenu,
        getHourly, addHourly, clearHourly,  // новые
        clearCache, getStorageSize
    };
})();
// ---------- HOURLY (почасовые данные) ----------
async function getHourly() {
    return _loadFromStorage('mganalytics_hourly');
}

async function addHourly(records) {
    const all = await getHourly();
    const key = r => `${r.date}|${r.hour}`;
    const existing = new Set(all.map(key));
    const fresh = records.filter(r => !existing.has(key(r)));
    if (!fresh.length) return 0;
    const merged = [...all, ...fresh];
    _saveToStorage('mganalytics_hourly', merged);
    return fresh.length;
}

window.DB = DB;
