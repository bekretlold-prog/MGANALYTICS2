// ============================================================
// core/db.js — Локальное хранилище (localStorage)
// Работает как точная замена npoint.io, без внешних запросов
// ============================================================

const DB = (() => {
    const STORAGE_KEYS = {
        SALES: 'mganalytics_sales',
        MENU: 'mganalytics_menu'
    };

    // Вспомогательная функция для загрузки данных из localStorage
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

    // Вспомогательная функция для сохранения в localStorage
    function _saveToStorage(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
        return data;
    }

    // ---------- SALES (продажи) ----------
    // Получить все записи продаж
    async function getSales() {
        return _loadFromStorage(STORAGE_KEYS.SALES);
    }

    // Добавить новые записи продаж с дедупликацией
    async function addSales(records) {
        const all = await getSales();
        const key = r => `${r.date}|${r.hour}|${r.channel}`; // Увеличил уникальность
        const existing = new Set(all.map(key));
        const fresh = records.filter(r => !existing.has(key(r)));
        
        if (!fresh.length) return 0;
        
        const merged = [...all, ...fresh];
        _saveToStorage(STORAGE_KEYS.SALES, merged);
        return fresh.length;
    }

    // Очистить все данные продаж
    async function clearSales() {
        _saveToStorage(STORAGE_KEYS.SALES, []);
    }

    // ---------- MENU (меню) ----------
    // Получить все записи меню
    async function getMenu() {
        return _loadFromStorage(STORAGE_KEYS.MENU);
    }

    // Добавить новые записи меню с дедупликацией
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

    // Очистить все данные меню
    async function clearMenu() {
        _saveToStorage(STORAGE_KEYS.MENU, []);
    }

    // Очистить весь кэш (просто сброс, т.к. локальный)
    function clearCache() {
        // Для localStorage этот метод не нужен, но оставлен для совместимости
        console.log('Cache cleared (localStorage)');
    }

    // Дополнительная функция: показать объём используемого хранилища
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
        getSales,
        addSales,
        clearSales,
        getMenu,
        addMenu,
        clearMenu,
        clearCache,
        getStorageSize
    };
})();

window.DB = DB;
