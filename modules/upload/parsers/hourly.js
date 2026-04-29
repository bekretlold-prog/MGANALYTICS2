// ============================================================
//  modules/upload/parsers/hourly.js
//  Парсер почасового отчёта из iiko
//  Каналы: Альфа Банк, Kiosk pay, Наличные
// ============================================================

const HourlyParser = (() => {

  // Названия каналов оплаты как они приходят из iiko
  const CHANNEL_MAP = {
    "альфа банк": "alfa",
    "1. альфа банк": "alfa",
    "kiosk pay": "kiosk",
    "наличные": "cash",
    "итого": "total",
  };

  function detectChannel(str) {
    if (!str) return null;
    const key = str.toString().toLowerCase().trim();
    return CHANNEL_MAP[key] || null;
  }

  function parse(buffer) {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (!rows || rows.length < 5) return { records: [], error: "Файл пустой" };

    // Ищем строку с "Час закрытия"
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).includes("Час закрытия")) { headerIdx = i; break; }
    }
    if (headerIdx === -1) return { records: [], error: "Не найден заголовок 'Час закрытия'" };

    // Ищем строку с типами оплаты (выше заголовка)
    let channelRowIdx = -1;
    for (let offset = 1; offset <= 4; offset++) {
      const idx = headerIdx - offset;
      if (idx < 0) break;
      const rowStr = rows[idx].map(c => String(c).toLowerCase());
      if (rowStr.some(c => c.includes("альфа") || c.includes("kiosk") || c.includes("наличн"))) {
        channelRowIdx = idx;
        break;
      }
    }
    if (channelRowIdx === -1) return { records: [], error: "Не найдена строка с типами оплаты" };

    // Ищем строку с датой (ещё выше)
    let dateRowIdx = -1;
    for (let offset = 1; offset <= 4; offset++) {
      const idx = channelRowIdx - offset;
      if (idx < 0) break;
      const hasDate = rows[idx].some(c => Utils.parseDateCell(c) !== null);
      if (hasDate) { dateRowIdx = idx; break; }
    }

    // Определяем колонки для каждого канала
    // Структура: Чеков | пусто | Сумма | Себест% | Средний чек — на каждый канал
    const channelRow = rows[channelRowIdx];
    const headerRow = rows[headerIdx];
    const channels = []; // { name, channel, checkCol, sumCol, costCol, avgCol }

    let currentChannel = null;
    for (let j = 1; j < channelRow.length; j++) {
      const ch = detectChannel(channelRow[j]);
      if (ch) currentChannel = ch;
      if (currentChannel && headerRow[j]) {
        const h = String(headerRow[j]).toLowerCase();
        if (h.includes("чеков")) channels.push({ channel: currentChannel, checkCol: j, sumCol: j + 2, costCol: j + 3, avgCol: j + 4 });
      }
    }

    if (!channels.length) return { records: [], error: "Не найдены колонки каналов оплаты" };

    // Извлекаем дату
    let dateStr = null;
    if (dateRowIdx >= 0) {
      for (let j = 1; j < rows[dateRowIdx].length; j++) {
        dateStr = Utils.parseDateCell(rows[dateRowIdx][j]);
        if (dateStr) break;
      }
    }
    // fallback: берём из имени файла или сегодня
    if (!dateStr) dateStr = Utils.formatDate(new Date());

    // Читаем строки с часами
    const records = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const hourRaw = rows[i][0];
      if (hourRaw === "" || String(hourRaw).toLowerCase().includes("итого")) break;
      const hour = parseInt(String(hourRaw), 10);
      if (isNaN(hour)) continue;

      for (const ch of channels) {
        if (ch.channel === "total") continue;
        const checks = parseInt(rows[i][ch.checkCol], 10) || 0;
        const sum = parseFloat(String(rows[i][ch.sumCol]).replace(",", ".")) || 0;
        const costPct = parseFloat(String(rows[i][ch.costCol]).replace(",", ".")) || 0;
        const avg = parseFloat(String(rows[i][ch.avgCol]).replace(",", ".")) || 0;

        if (checks > 0 || sum > 0) {
          records.push({ date: dateStr, hour, channel: ch.channel, checks, sum, costPct, avg });
        }
      }
    }

    return { records, error: null, date: dateStr, count: records.length };
  }

  return { parse };
})();

window.HourlyParser = HourlyParser;
