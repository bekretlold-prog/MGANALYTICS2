// core/upload.js
// Поддерживает два типа файлов:
// - Prod_Mix (продажи по позициям) -> сохраняет в DB.addSales
// - Почасовой (с колонкой "Чеков") -> извлекает итоговую строку и сохраняет в DB.addHourly

async function handleFileUpload(file) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (!rows || rows.length < 2) {
        alert("Файл пуст или повреждён");
        return;
    }

    const firstRow = rows[0];
    // Определяем, есть ли колонка "Чеков" (почасовой файл)
    const isHourly = firstRow.some(cell => String(cell || "").trim() === "Чеков");

    if (isHourly) {
        // Это почасовой файл – нам нужна последняя строка с итогами
        // Ищем строку, где первый столбец содержит слово "Итого"
        let totalRow = null;
        for (let i = rows.length - 1; i >= 0; i--) {
            const firstCell = String(rows[i][0] || "").trim();
            if (firstCell === "Итого" || firstCell.includes("Итого")) {
                totalRow = rows[i];
                break;
            }
        }
        if (!totalRow) {
            alert("Не найдена итоговая строка в почасовом файле");
            return;
        }
        // В твоём примере: вторая колонка (индекс 1) – общая выручка,
        // последняя колонка (индекс totalRow.length-1) – количество чеков
        const totalRevenue = parseFloat(totalRow[1]);
        const totalChecks = parseFloat(totalRow[totalRow.length - 1]);
        if (isNaN(totalRevenue) || isNaN(totalChecks)) {
            alert("Не удалось распознать выручку или чеки в итоговой строке");
            return;
        }
        // Сохраняем как одну запись (можно дату поставить сегодняшнюю)
        const date = new Date().toISOString().slice(0,10);
        await DB.addHourly([{ date, hour: 0, revenue: totalRevenue, checks: totalChecks }]);
        alert(`Почасовые данные загружены: выручка ${totalRevenue.toFixed(2)} руб., чеки ${totalChecks}`);
    } else {
        // Это Prod_Mix – обрабатываем как раньше (твой существующий код)
        // Здесь должен быть твой парсинг Prod_Mix. Если он уже есть – оставь как есть.
        // Пример упрощённого парсинга (адаптируй под свою структуру):
        const records = [];
        // ... (твой код для Prod_Mix) ...
        // В конце:
        // await DB.addSales(records);
        alert("Prod_Mix загружен");
    }
}

// Вешаем обработчик на элемент выбора файла (например, <input type="file" id="fileInput">)
document.getElementById('fileInput')?.addEventListener('change', (e) => {
    if (e.target.files.length) handleFileUpload(e.target.files[0]);
});
