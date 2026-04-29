// ============================================================
//  modules/upload/parsers/hourly.js
//  Парсер почасового отчёта из iiko
//  Формат: каждая дата = группа колонок (Сумма / Средняя / Чеков)
// ============================================================

const HourlyParser = (() => {

  function parseDateTime(val) {
    if (!val) return null;
    const s = String(val);
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return Utils.parseDateCell(val);
  }

  function parse(buffer) {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const raw      = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    if (!raw || raw.length < 5) return { records: [], error: "Файл пустой" };

    // 1. Строка заголовка ("Час закрытия")
    let headerIdx = -1;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] && raw[i].some(c => String(c || "").includes("Час закрытия"))) {
        headerIdx = i; break;
      }
    }
    if (headerIdx === -1) return { records: [], error: "Не найден заголовок 'Час закрытия'" };

    const headerRow = raw[headerIdx];

    // 2. Строка с датами (выше заголовка)
    let dateRowIdx = -1;
    for (let i = headerIdx - 1; i >= 0; i--) {
      if (raw[i] && raw[i].some(c => parseDateTime(c) !== null)) {
        dateRowIdx = i; break;
      }
    }
    if (dateRowIdx === -1) return { records: [], error: "Не найдена строка с датами" };

    const dateRow = raw[dateRowIdx];

    // 3. Для каждой даты находим колонки Сумма и Чеков
    const groups = [];
    for (let j = 0; j < dateRow.length; j++) {
      const dateStr = parseDateTime(dateRow[j]);
      if (!dateStr) continue;

      // sumCol — ближайшая "Сумма" в headerRow от j
      let sumCol = -1;
      for (let k = j; k < Math.min(j + 5, headerRow.length); k++) {
        if (String(headerRow[k] || "").includes("Сумма")) { sumCol = k; break; }
      }
      if (sumCol === -1) sumCol = j;

      // checksCol — ближайший "Чеков" правее sumCol
      let checksCol = -1;
      for (let k = sumCol + 1; k < Math.min(sumCol + 10, headerRow.length); k++) {
        if (String(headerRow[k] || "").toLowerCase().includes("чеков")) { checksCol = k; break; }
      }
      if (checksCol === -1) continue;

      // avgCol — "Средняя" между sumCol и checksCol
      let avgCol = -1;
      for (let k = sumCol + 1; k < checksCol; k++) {
        if (String(headerRow[k] || "").toLowerCase().includes("средняя")) { avgCol = k; break; }
      }

      groups.push({ date: dateStr, sumCol, checksCol, avgCol });
    }

    if (!groups.length) return { records: [], error: "Не найдено ни одной даты с данными" };

    // 4. Читаем строки с часами
    const records = [];
    for (let i = headerIdx + 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row) continue;
      const hourRaw = row[0];
      if (hourRaw === null || hourRaw === undefined) continue;
      const hourStr = String(hourRaw).trim();
      if (hourStr.toLowerCase().includes("итого") || hourStr === "") break;
      const hour = parseInt(hourStr, 10);
      if (isNaN(hour)) continue;

      for (const g of groups) {
        const sum    = parseFloat(String(row[g.sumCol]    || 0).replace(",", ".")) || 0;
        const checks = parseFloat(String(row[g.checksCol] || 0).replace(",", ".")) || 0;
        const avg    = g.avgCol >= 0
          ? (parseFloat(String(row[g.avgCol] || 0).replace(",", ".")) || 0)
          : (checks > 0 ? sum / checks : 0);

        if (sum > 0 || checks > 0) {
          records.push({ date: g.date, hour, channel: "total", sum, checks, avg, costPct: 0 });
        }
      }
    }

    const dates = [...new Set(records.map(r => r.date))];
    return { records, error: null, date: dates[0], dates, count: records.length };
  }

  return { parse };
})();

window.HourlyParser = HourlyParser;
