// ============================================================
//  modules/upload/parsers/hourly.js
//  Универсальный парсер почасового отчёта из iiko
//
//  Поддерживает два формата:
//  1. Простой — даты в одной строке, без типов оплаты
//  2. С типами оплаты — блоки Сбербанк/Kiosk/Наличные (ЧАСМАЙ25 формат)
//     В этом случае суммирует чеки и выручку по всем типам оплаты
// ============================================================

const HourlyParser = (() => {

  function parseDateTime(val) {
    if (!val) return null;
    if (val instanceof Date) {
      const y = val.getFullYear(), m = String(val.getMonth()+1).padStart(2,'0'), d = String(val.getDate()).padStart(2,'0');
      return `${y}-${m}-${d}`;
    }
    const s = String(val);
    const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const ru = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
    return null;
  }

  function parse(buffer) {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const raw      = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });

    if (!raw || raw.length < 5) return { records: [], error: "Файл пустой" };

    // ── 1. Найти строку с "Час закрытия" ──────────────────────
    let headerIdx = -1;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] && raw[i].some(c => String(c || "").includes("Час закрытия"))) {
        headerIdx = i; break;
      }
    }
    if (headerIdx === -1) return { records: [], error: "Не найден заголовок 'Час закрытия'" };

    const headerRow = raw[headerIdx]; // строка с "Чеков", "Сумма" и т.д.

    // ── 2. Определить: есть ли строка с типами оплаты (row5) ──
    //    Ищем строку выше headerIdx где есть "всего" или каналы оплаты
    let channelRowIdx = -1;
    let dateRowIdx    = -1;

    for (let i = headerIdx - 1; i >= 0; i--) {
      if (!raw[i]) continue;
      const rowStr = raw[i].map(c => String(c || "").toLowerCase()).join(" ");
      if (rowStr.includes("всего") || rowStr.includes("kiosk") || rowStr.includes("наличные") || rowStr.includes("сбербанк")) {
        channelRowIdx = i;
        break;
      }
    }

    // Строка с датами — ищем ближайшую выше headerIdx с датами
    for (let i = headerIdx - 1; i >= 0; i--) {
      if (!raw[i]) continue;
      if (raw[i].some(c => parseDateTime(c) !== null)) {
        dateRowIdx = i; break;
      }
    }
    if (dateRowIdx === -1) return { records: [], error: "Не найдена строка с датами" };

    const dateRow = raw[dateRowIdx];

    // ── 3. Найти границы "игнорируемых" блоков (всего/итого) ──
    //    Чтобы не читать колонки агрегатов
    const skipRanges = []; // [{from, to}]
    if (channelRowIdx >= 0) {
      const chanRow = raw[channelRowIdx];
      for (let j = 0; j < chanRow.length; j++) {
        const v = String(chanRow[j] || "").toLowerCase();
        if (v.includes("всего") || v === "итого") {
          // Ищем конец этого блока — следующий непустой канал или конец
          let endJ = chanRow.length - 1;
          for (let k = j+1; k < chanRow.length; k++) {
            if (chanRow[k] && String(chanRow[k]).trim() !== "") { endJ = k - 1; break; }
          }
          skipRanges.push({ from: j, to: endJ });
        }
      }
    }

    function isSkipCol(colIdx) {
      return skipRanges.some(r => colIdx >= r.from && colIdx <= r.to);
    }

    // ── 4. Построить группы: дата → {checksCol, sumCol, avgCol} ──
    //    Одна дата может встречаться несколько раз (разные типы оплаты) — группируем
    const dateGroups = new Map(); // dateStr → [{checksCol, sumCol, avgCol}]

    for (let j = 0; j < dateRow.length; j++) {
      if (isSkipCol(j)) continue;
      const dateStr = parseDateTime(dateRow[j]);
      if (!dateStr) continue;

      // Найти checksCol — "Чеков" в headerRow начиная с j
      let checksCol = -1;
      for (let k = j; k < Math.min(j + 8, headerRow.length); k++) {
        if (String(headerRow[k] || "").includes("Чеков")) { checksCol = k; break; }
      }
      if (checksCol === -1) continue;

      // sumCol — "Сумма" в headerRow начиная с checksCol
      let sumCol = -1;
      for (let k = checksCol + 1; k < Math.min(checksCol + 8, headerRow.length); k++) {
        if (String(headerRow[k] || "").includes("Сумма")) { sumCol = k; break; }
      }
      if (sumCol === -1) continue;

      // avgCol — "Средняя"
      let avgCol = -1;
      for (let k = checksCol + 1; k < Math.min(checksCol + 8, headerRow.length); k++) {
        if (String(headerRow[k] || "").toLowerCase().includes("средняя")) { avgCol = k; break; }
      }

      if (!dateGroups.has(dateStr)) dateGroups.set(dateStr, []);
      dateGroups.get(dateStr).push({ checksCol, sumCol, avgCol });
    }

    if (!dateGroups.size) return { records: [], error: "Не найдено ни одной даты с данными" };

    // ── 5. Читаем строки по часам, суммируем по всем типам оплаты ──
    const records = [];

    for (let i = headerIdx + 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row) continue;
      const hourRaw = row[0];
      if (hourRaw === null || hourRaw === undefined) continue;
      const hourStr = String(hourRaw).trim();
      if (hourStr === "" || hourStr.toLowerCase().includes("итого")) break;
      const hour = parseInt(hourStr, 10);
      if (isNaN(hour)) continue;

      for (const [dateStr, groups] of dateGroups) {
        let totalChecks = 0;
        let totalSum    = 0;

        for (const g of groups) {
          const checks = parseFloat(String(row[g.checksCol] || "0").replace(",", ".")) || 0;
          const sum    = parseFloat(String(row[g.sumCol]    || "0").replace(",", ".")) || 0;
          totalChecks += checks;
          totalSum    += sum;
        }

        if (totalChecks > 0 || totalSum > 0) {
          const avg = totalChecks > 0 ? totalSum / totalChecks : 0;
          records.push({ date: dateStr, hour, channel: "total", sum: totalSum, checks: totalChecks, avg, costPct: 0 });
        }
      }
    }

    const dates = [...dateGroups.keys()].sort();
    return { records, error: null, date: dates[0], dates, count: records.length };
  }

  return { parse };
})();

window.HourlyParser = HourlyParser;
