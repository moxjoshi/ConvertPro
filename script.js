document.addEventListener('DOMContentLoaded', () => {
    console.log("Script loaded and initialized");

    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const targetId = tab.dataset.tab;
            if (targetId) {
                document.getElementById(targetId).classList.add('active');
            }

            resetInterface();
        });
    });

    let selectedFiles = [];
    let currentMode = 'img-converter';

    const dropZones = {
        'img-converter': document.getElementById('drop-zone-img'),
        'img-to-pdf': document.getElementById('drop-zone-pdf'),
        'pdf-to-img': document.getElementById('drop-zone-pdf-img')
    };

    const inputs = {
        'img-converter': document.getElementById('file-input-img'),
        'img-to-pdf': document.getElementById('file-input-pdf'),
        'pdf-to-img': document.getElementById('file-input-pdf-img')
    };

    const settingsAreas = {
        'img-converter': document.getElementById('settings-img'),
        'img-to-pdf': document.getElementById('settings-pdf'),
        'pdf-to-img': document.getElementById('settings-pdf-img')
    };

    const convertBtns = {
        'img-converter': document.getElementById('convert-btn-img'),
        'img-to-pdf': document.getElementById('convert-btn-pdf'),
        'pdf-to-img': document.getElementById('convert-btn-pdf-img')
    };

    const resultArea = document.getElementById('result-area');
    const downloadLinks = document.getElementById('download-links');
    const resetBtn = document.getElementById('reset-btn');

    try { setupDragAndDrop('img-converter'); } catch (e) { console.error(e); }
    try { setupDragAndDrop('img-to-pdf'); } catch (e) { console.error(e); }
    try { setupDragAndDrop('pdf-to-img'); } catch (e) { console.error(e); }

    if (resetBtn) resetBtn.addEventListener('click', resetInterface);

    if (convertBtns['img-converter']) {
        convertBtns['img-converter'].addEventListener('click', async () => {
            if (selectedFiles.length === 0) return;
            setProcessing(true, 'img-converter');

            const formatEl = document.getElementById('format-select-img');
            const format = formatEl ? formatEl.value : 'jpeg';
            const results = [];

            try {
                for (const file of selectedFiles) {
                    const dataUrl = await readFileAsDataURL(file);

                    const convertedDataUrl = await convertImage(dataUrl, format);
                    results.push({
                        name: file.name.split('.')[0] + '.' + format,
                        data: convertedDataUrl
                    });
                }
                showResults(results);
            } catch (error) {
                console.error(error);
                alert('Error converting images: ' + error.message);
            } finally {
                setProcessing(false, 'img-converter');
            }
        });
    }

    if (convertBtns['img-to-pdf']) {
        convertBtns['img-to-pdf'].addEventListener('click', async () => {
            if (selectedFiles.length === 0) return;
            setProcessing(true, 'img-to-pdf');

            try {
                if (!window.jspdf) throw new Error("jsPDF library not loaded");
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF();

                for (let i = 0; i < selectedFiles.length; i++) {
                    const file = selectedFiles[i];
                    const dataUrl = await readFileAsDataURL(file);
                    const imgProps = await getImageProperties(dataUrl);

                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = pdf.internal.pageSize.getHeight();
                    const ratio = Math.min(pdfWidth / imgProps.width, pdfHeight / imgProps.height);
                    const width = imgProps.width * ratio;
                    const height = imgProps.height * ratio;
                    const x = (pdfWidth - width) / 2;
                    const y = (pdfHeight - height) / 2;

                    if (i > 0) pdf.addPage();
                    pdf.addImage(dataUrl, 'JPEG', x, y, width, height);
                }

                const pdfBlob = pdf.output('blob');
                showResults([{
                    name: 'converted_images.pdf',
                    blob: pdfBlob
                }]);

            } catch (error) {
                console.error(error);
                alert('Error generating PDF: ' + error.message);
            } finally {
                setProcessing(false, 'img-to-pdf');
            }
        });
    }

    if (convertBtns['pdf-to-img']) {
        convertBtns['pdf-to-img'].addEventListener('click', async () => {
            if (selectedFiles.length === 0) return;
            setProcessing(true, 'pdf-to-img');
            const file = selectedFiles[0];
            const formatEl = document.getElementById('format-select-pdf-img');
            const format = formatEl ? formatEl.value : 'jpeg';

            try {
                if (typeof pdfjsLib === 'undefined') throw new Error("PDF.js library not loaded");

                const arrayBuffer = await readFileAsArrayBuffer(file);
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

                const results = [];

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 1.5 });

                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;

                    results.push({
                        name: 'page_' + i + '.' + format,
                        data: canvas.toDataURL('image/' + format)
                    });
                }

                if (results.length === 1) {
                    showResults(results);
                } else {
                    if (typeof JSZip === 'undefined') throw new Error("JSZip library not loaded");
                    const zip = new JSZip();
                    results.forEach(res => {
                        const base64Data = res.data.split(',')[1];
                        zip.file(res.name, base64Data, { base64: true });
                    });
                    const blob = await zip.generateAsync({ type: "blob" });
                    showResults([{
                        name: 'converted_pages.zip',
                        blob: blob
                    }]);
                }

            } catch (error) {
                console.error(error);
                alert('Error converting PDF to images: ' + error.message);
            } finally {
                setProcessing(false, 'pdf-to-img');
            }
        });
    }



    function setupDragAndDrop(mode) {
        const zone = dropZones[mode];
        const input = inputs[mode];

        if (!zone || !input) {
            console.error('Missing elements for mode: ' + mode);
            return;
        }

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                handleFiles(e.dataTransfer.files, mode);
            }
        });

        input.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFiles(e.target.files, mode);
            }
        });
    }

    function handleFiles(files, mode) {
        selectedFiles = Array.from(files);

        dropZones[mode].classList.add('hidden');
        settingsAreas[mode].classList.remove('hidden');

        if (mode === 'img-to-pdf') {
            const countEl = document.getElementById('pdf-file-count');
            if (countEl) countEl.innerText = selectedFiles.length + ' images selected';
        }
    }

    function setProcessing(isProcessing, mode) {
        const btn = convertBtns[mode];
        if (!btn) return;
        btn.disabled = isProcessing;
        btn.innerHTML = isProcessing ? 'Converting...' : (mode === 'img-converter' ? 'Convert Now' : (mode === 'img-to-pdf' ? 'Generate PDF' : 'Extract Images'));
        btn.style.opacity = isProcessing ? '0.7' : '1';
    }

    function resetInterface() {
        selectedFiles = [];
        resultArea.classList.add('hidden');
        downloadLinks.innerHTML = '';

        Object.keys(dropZones).forEach(key => {
            if (dropZones[key]) dropZones[key].classList.remove('hidden');
            if (settingsAreas[key]) settingsAreas[key].classList.add('hidden');
            if (inputs[key]) inputs[key].value = '';
        });
    }

    function showResults(items) {
        Object.values(settingsAreas).forEach(el => { if (el) el.classList.add('hidden'); });
        resultArea.classList.remove('hidden');

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'download-item';

            const nameSpan = document.createElement('span');
            nameSpan.innerText = item.name;

            const link = document.createElement('a');
            link.className = 'download-btn';
            link.innerText = 'Download';
            link.download = item.name;

            if (item.blob) {
                link.href = URL.createObjectURL(item.blob);
            } else {
                link.href = item.data;
            }

            div.appendChild(nameSpan);
            div.appendChild(link);
            downloadLinks.appendChild(div);
        });
    }

    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    function convertImage(dataUrl, format) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/' + format));
            };
            img.src = dataUrl;
        });
    }

    function getImageProperties(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.width, height: img.height });
            };
            img.src = dataUrl;
        });
    }
});
