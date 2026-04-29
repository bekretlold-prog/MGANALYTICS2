// ============================================================
//  modules/upload/upload.js — главный обработчик загрузки
// ============================================================

const Upload = (() => {

    async function processFiles(files) {
        Utils.showLoader("Обработка файлов...");

        let addedSales = 0;
        let addedMenu  = 0;

        for (const file of files) {
            try {
                const buffer = await file.arrayBuffer();
                const filename = file.name.toLowerCase();

                let result = null;

                // Определяем тип отчёта
                if (filename.includes("час") || filename.includes("hourly") || 
                    filename.includes("выручка") || filename.includes("чеков")) {
                    result = HourlyParser.parse(buffer);
                    if (result.records.length) {
                        addedSales += await DB.addHourly(result.records);
                    }
                } 
                else if (filename.includes("prod") || filename.includes("mix") || 
                         filename.includes("блюдо") || filename.includes("меню")) {
                    result = ProdMixParser.parse(buffer);
                    if (result.records.length) {
                        addedMenu += await DB.addMenu(result.records);
                    }
                }

                if (result && result.error) {
                    Utils.toast(`Ошибка в файле ${file.name}: ${result.error}`, "error");
                } else if (result) {
                    Utils.toast(`Загружено: ${file.name} (${result.count || 0} записей)`, "success");
                }

            } catch (e) {
                console.error(e);
                Utils.toast(`Не удалось обработать ${file.name}`, "error");
            }
        }

        Utils.hideLoader();

        if (addedSales + addedMenu > 0) {
            Utils.toast(`Успешно добавлено: ${addedSales} почасовых + ${addedMenu} блюд`, "success");
            // Обновляем все модули
            if (window.Dashboard) Dashboard.render();
            if (window.Menu) Menu.render();
        }
    }

    function init() {
        const dropzone = document.getElementById("dropzone");
        const fileInput = document.getElementById("file-input");
        const processBtn = document.getElementById("process-btn");

        if (!dropzone || !fileInput) return;

        // Drag & Drop
        dropzone.addEventListener("dragover", e => {
            e.preventDefault();
            dropzone.classList.add("drag-over");
        });
        dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
        dropzone.addEventListener("drop", e => {
            e.preventDefault();
            dropzone.classList.remove("drag-over");
            if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
        });

        dropzone.addEventListener("click", () => fileInput.click());

        fileInput.addEventListener("change", e => {
            if (e.target.files.length) processFiles(e.target.files);
        });

        if (processBtn) {
            processBtn.addEventListener("click", () => {
                // Можно добавить логику для уже выбранных файлов
                Utils.toast("Выберите файлы через drag & drop или кнопку", "info");
            });
        }

        // Кнопки очистки
        document.getElementById("clear-sales")?.addEventListener("click", async () => {
            if (confirm("Очистить все почасовые данные?")) {
                await DB.clearHourly();
                Utils.toast("Почасовые данные очищены");
                if (window.Dashboard) Dashboard.render();
            }
        });

        document.getElementById("clear-menu")?.addEventListener("click", async () => {
            if (confirm("Очистить все данные меню?")) {
                await DB.clearMenu();
                Utils.toast("Данные меню очищены");
                if (window.Menu) Menu.render();
            }
        });
    }

    return { init, processFiles };
})();

window.Upload = Upload;
