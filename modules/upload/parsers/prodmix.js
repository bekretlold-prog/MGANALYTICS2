// ============================================================
//  modules/upload/parsers/prodmix.js
//  Парсер отчёта Prod Mix из iiko
// ============================================================

const ProdMixParser = (() => {

  // Служебные группы которые не нужны в аналитике
  const SKIP_GROUPS = ["техподдержка", "сервисный сбор", "сметана к супам", "соус к щёчкам", "сыр к макаронам"];

  function isSkip(category, group) {
    const str = `${category} ${group}`.toLowerCase();
    return SKIP_GROUPS.some(s => str.includes(s));
  }

  function parse(buffer) {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (!rows || rows.length < 5) return { records: [], error: "Файл пустой" };

    // Ищем строку-заголовок с "Блюдо" или "Количество блюд"
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map(c => String(c));
      if (row.some(c => c.includes("Количество блюд")) || row.some(c => c === "Блюдо")) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) return { records: [], error: "Не найден заголовок таблицы" };

    const header = rows[headerIdx].map(c => String(c).trim());

    // Определяем индексы колонок
    const col = {
      restaurant: header.indexOf("Торговое предприятие"),
      category:   header.findIndex(h => h.includes("Категория")),
      group:      header.findIndex(h => h.includes("Группа")),
      dish:       header.indexOf("Блюдо"),
      qty:        header.findIndex(h => h.includes("Количество блюд")),
      avgQty:     header.findIndex(h => h.includes("Ср. количество")),
      sum:        header.findIndex(h => h.includes("Сумма без скидки")),
      discount:   header.findIndex(h => h.includes("Сумма скидки")),
      avgPrice:   header.findIndex(h => h.includes("Средняя цена")),
      costUnit:   header.findIndex(h => h.includes("Себестоимость единицы")),
      costTotal:  header.findIndex(h => h.includes("Себестоимость, р")),
      costPct:    header.findIndex(h => h.includes("Себестоимость(%)")),
    };

    // Извлекаем дату из шапки файла (первые строки)
    let dateStr = null;
    for (let i = 0; i < Math.min(headerIdx, 10); i++) {
      for (const cell of rows[i]) {
        const d = Utils.parseDateCell(cell);
        if (d) { dateStr = d; break; }
      }
      if (dateStr) break;
    }
    if (!dateStr) dateStr = Utils.formatDate(new Date());

    const records = [];
    let lastCategory = "";
    let lastGroup = "";

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const dish = String(row[col.dish] || "").trim();

      // Пропускаем итоговые строки и пустые
      if (!dish || dish.toLowerCase().includes("всего") || dish.toLowerCase().includes("итого")) continue;

      // Подхватываем категорию и группу из предыдущих строк (в iiko они мёрджатся)
      const cat = String(row[col.category] || "").trim() || lastCategory;
      const grp = String(row[col.group] || "").trim() || lastGroup;
      if (String(row[col.category] || "").trim()) lastCategory = cat;
      if (String(row[col.group] || "").trim()) lastGroup = grp;

      if (isSkip(cat, grp)) continue;

      const qty      = parseFloat(String(row[col.qty] || "0").replace(",", ".")) || 0;
      const sum      = parseFloat(String(row[col.sum] || "0").replace(",", ".")) || 0;
      const discount = parseFloat(String(row[col.discount] || "0").replace(",", ".")) || 0;
      const avgPrice = parseFloat(String(row[col.avgPrice] || "0").replace(",", ".")) || 0;
      const costUnit = parseFloat(String(row[col.costUnit] || "0").replace(",", ".")) || 0;
      const costTotal= parseFloat(String(row[col.costTotal] || "0").replace(",", ".")) || 0;
      const costPct  = parseFloat(String(row[col.costPct] || "0").replace(",", ".")) || 0;

      if (qty === 0 && sum === 0) continue;

      records.push({
        date: dateStr,
        category: cat,
        group: grp,
        dish,
        qty,
        sum,
        discount,
        avgPrice,
        costUnit,
        costTotal,
        costPct,
        margin: sum > 0 ? (sum - costTotal) / sum : 0,
      });
    }

    return { records, error: null, date: dateStr, count: records.length };
  }

  return { parse };
})();

window.ProdMixParser = ProdMixParser;
