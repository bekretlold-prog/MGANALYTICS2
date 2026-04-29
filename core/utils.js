// ============================================================
//  core/utils.js — общие утилиты
// ============================================================

const Utils = (() => {

  // Форматирование даты без смещения часового пояса
  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseDate(str) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // Excel serial → YYYY-MM-DD
  function excelDateToStr(serial) {
    const date = new Date((serial - 25569) * 86400000);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Универсальный парсер ячейки с датой
  function parseDateCell(cell) {
    if (typeof cell === "number" && cell > 40000 && cell < 60000)
      return excelDateToStr(cell);
    if (typeof cell === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(cell)) return cell;
      const dm = cell.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
    }
    return null;
  }

  // Форматирование чисел
  function money(n) {
    return Math.round(n).toLocaleString("ru-RU") + " ₽";
  }

  function pct(n, decimals = 1) {
    return (n * 100).toFixed(decimals) + "%";
  }

  function num(n) {
    return Number(n).toLocaleString("ru-RU");
  }

  // Названия дней недели
  const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  function dayName(date) {
    return DAYS[date.getDay()];
  }

  // Получить дату N дней назад
  function daysAgo(n, from = new Date()) {
    const d = new Date(from);
    d.setDate(d.getDate() - n);
    return d;
  }

  // Показать/скрыть спиннер
  function showLoader(msg = "Загрузка...") {
    document.getElementById("loader-text").textContent = msg;
    document.getElementById("loader").classList.remove("hidden");
  }

  function hideLoader() {
    document.getElementById("loader").classList.add("hidden");
  }

  // Показать уведомление
  function toast(msg, type = "success") {
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    document.getElementById("toasts").appendChild(el);
    setTimeout(() => el.classList.add("show"), 10);
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3000);
  }

  return { formatDate, parseDate, excelDateToStr, parseDateCell, money, pct, num, dayName, daysAgo, showLoader, hideLoader, toast };
})();

window.Utils = Utils;
