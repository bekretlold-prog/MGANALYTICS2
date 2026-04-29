// core/upload.js — для почасового файла (формат как в ЧАСПОЛГОДДЕК.xlsx)

async function handleHourlyUpload(file) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    // Определяем, где начинаются данные (ищем строку с "Час закрытия")
    let startRow = -1;
    let headerRow = null;
    for (let i = 0; i < rows.length; i++) {
        const firstCell = String(rows[i][0] || "").trim();
        if (firstCell === "Час закрытия") {
            startRow = i + 1;
            headerRow = rows[i];
            break;
        }
    }
    if (startRow === -1) {
        alert("Не найден заголовок 'Час закрытия'");
        return;
    }

    // Ищем индексы колонок с чеками и выручкой для каждого типа оплаты
    // В вашем файле колонки: Час закрытия, затем для каждого типа оплаты: "Чеков", "Сумма со скидкой без НДС, р.", "Себестоимость(%)", "Средняя сумма заказа, р."
    // Нам нужны только "Чеков" и "Сумма со скидкой без НДС, р." для каждого типа.
    const typeColumns = [];
    for (let col = 1; col < headerRow.length; col++) {
        const cell = String(headerRow[col] || "").trim();
        if (cell === "Чеков") {
            // Ищем предыдущую колонку с названием типа оплаты (обычно на 2-3 колонки левее)
            let typeName = "";
            for (let t = col-1; t >= 0; t--) {
                const prev = String(headerRow[t] || "").trim();
                if (prev && !prev.includes("Чеков") && !prev.includes("Сумма") && !prev.includes("Средняя") && !prev.includes("Себестоимость")) {
                    typeName = prev;
                    break;
                }
            }
            typeColumns.push({ type: typeName, checksCol: col, sumCol: col+1 });
        }
    }

    const hourlyMap = new Map(); // key = "date|hour", value = { revenue, checks }

    // Проходим по строкам
    for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;
        const hour = parseInt(row[0]);
        if (isNaN(hour) || hour < 0 || hour > 23) continue; // не час

        // Определяем дату – она может быть в первых колонках или в метаданных.
        // Упростим: дата находится в строке, где есть "Учетный день" над часами. 
        // Лучше получать дату из первой строки данных (например, столбец с датой есть в шапке).
        // В вашем файле дата указана в строке над группами. Сложно парсить.
        // Для простоты будем брать дату из строки, где она явно написана.
        // Предположим, что дата записана в ячейке над колонками типа оплат. 
        // Альтернатива: требовать, чтобы пользователь выбрал дату вручную. Но это неудобно.
        
        // Самый надёжный способ: файл называется "ЧАСПОЛГОДДЕК.xlsx" – можно извлечь даты из диапазона.
        // Но для демонстрации сделаем так: будем считать, что дата указана в одной из первых колонок этой же строки (например, в колонке A есть дата).
        let date = "";
        // Пытаемся найти дату в формате ГГГГ-ММ-ДД в первых 5 ячейках строки
        for (let c = 0; c < Math.min(5, row.length); c++) {
            const val = String(row[c] || "").trim();
            if (val.match(/\d{4}-\d{2}-\d{2}/)) {
                date = val;
                break;
            }
        }
        if (!date) {
            // Если дата не найдена, пропускаем
            continue;
        }

        let totalChecks = 0;
        let totalRevenue = 0;
        for (const tc of typeColumns) {
            const checks = parseFloat(row[tc.checksCol]);
            const sum = parseFloat(row[tc.sumCol]);
            if (!isNaN(checks)) totalChecks += checks;
            if (!isNaN(sum)) totalRevenue += sum;
        }
        if (totalChecks === 0 && totalRevenue === 0) continue;

        const key = `${date}|${hour}`;
        if (hourlyMap.has(key)) {
            const existing = hourlyMap.get(key);
            existing.revenue += totalRevenue;
            existing.checks += totalChecks;
        } else {
            hourlyMap.set(key, { date, hour, revenue: totalRevenue, checks: totalChecks });
        }
    }

    const records = Array.from(hourlyMap.values());
    const added = await DB.addHourly(records);
    alert(`Загружено почасовых данных: ${added} записей (${records.length} уникальных часов)`);
}

// Прикрепляем обработчик к input с id="hourlyUpload", если он есть
document.getElementById('hourlyUpload')?.addEventListener('change', (e) => {
    if (e.target.files.length) handleHourlyUpload(e.target.files[0]);
});
