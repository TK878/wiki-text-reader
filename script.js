/**
 * History Full-Text Reader - Minimal Logic (Copy Button Removed)
 */

// ========================================
// アプリケーション設定定数
// ========================================
const CONFIG = {
    FONT_SIZE_MIN: 8,
    FONT_SIZE_MAX: 50,
    FONT_SIZE_DEFAULT: 14,
    API_TIMEOUT_MS: 15000,
    API_URL: 'https://ja.wikipedia.org/w/api.php',
    STORAGE_KEY_PREFIX: 'historyReader_'
};

// ========================================
// ユーティリティ関数
// ========================================

function validateFontSize(value) {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < CONFIG.FONT_SIZE_MIN || num > CONFIG.FONT_SIZE_MAX) {
        return CONFIG.FONT_SIZE_DEFAULT;
    }
    return num;
}

function savePreferences() {
    const fontSize = document.getElementById('fontSize').value;
    const fontFamily = document.getElementById('fontFamily').value;
    localStorage.setItem(CONFIG.STORAGE_KEY_PREFIX + 'fontSize', fontSize);
    localStorage.setItem(CONFIG.STORAGE_KEY_PREFIX + 'fontFamily', fontFamily);
}

function loadPreferences() {
    const fontSize = localStorage.getItem(CONFIG.STORAGE_KEY_PREFIX + 'fontSize');
    const fontFamily = localStorage.getItem(CONFIG.STORAGE_KEY_PREFIX + 'fontFamily');
    if (fontSize) document.getElementById('fontSize').value = validateFontSize(fontSize);
    if (fontFamily) document.getElementById('fontFamily').value = fontFamily;
    updateStyle();
}

function updateStyle() {
    const textArea = document.getElementById('result');
    if (!textArea) return;
    const fontSize = validateFontSize(document.getElementById('fontSize').value);
    const fontFamily = document.getElementById('fontFamily').value;
    textArea.style.fontSize = fontSize + 'px';
    textArea.style.fontFamily = fontFamily;
    savePreferences();
}

function fetchWithTimeout(url, timeout = CONFIG.API_TIMEOUT_MS) {
    return Promise.race([
        fetch(url),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('APIタイムアウト')), timeout)
        )
    ]);
}

/**
 * ランダムに歴史カテゴリからタイトルを取得
 */
async function getRandomTopic() {
    const categories = ["歴史", "日本史", "世界史", "戦国武将", "フランスの歴史", "考古学"];
    const targetCat = categories[Math.floor(Math.random() * categories.length)];

    const url = new URL(CONFIG.API_URL);
    url.searchParams.append('format', 'json');
    url.searchParams.append('action', 'query');
    url.searchParams.append('list', 'categorymembers');
    url.searchParams.append('cmtitle', 'Category:' + targetCat);
    url.searchParams.append('cmlimit', '100');
    url.searchParams.append('origin', '*');

    const res = await fetchWithTimeout(url.toString());
    const data = await res.json();
    
    if (!data.query || !data.query.categorymembers || data.query.categorymembers.length === 0) {
        return "日本史"; 
    }

    const members = data.query.categorymembers;
    // 標準的な記事（Namespace 0）のみを抽出
    const pages = members.filter(m => m.ns === 0);
    const randomPage = pages[Math.floor(Math.random() * pages.length)];
    
    return randomPage ? randomPage.title : "日本の歴史";
}

function updateUI(status) {
    const statusText = document.getElementById('statusText');
    if (!statusText) return;
    statusText.textContent = status.toUpperCase();
    statusText.className = ''; 
    statusText.classList.add('status-' + status.toLowerCase());
}

// ========================================
// メイン処理
// ========================================

async function fetchFullText() {
    const textArea = document.getElementById('result');
    const genBtn = document.getElementById('genBtn');
    const charCountDisplay = document.getElementById('charCountDisplay');

    if (!textArea || !genBtn) return;

    // UI初期化
    genBtn.disabled = true;
    textArea.value = "検索中...";
    updateUI('fetching');

    try {
        // ステップ1: ランダムキーワード取得
        const topic = await getRandomTopic();
        textArea.value = `【${topic}】の詳細を読み込み中...`;

        // ステップ2: Wikipedia全文取得
        const url = new URL(CONFIG.API_URL);
        url.searchParams.append('format', 'json');
        url.searchParams.append('action', 'query');
        url.searchParams.append('prop', 'extracts');
        url.searchParams.append('explaintext', '1');
        url.searchParams.append('titles', topic);
        url.searchParams.append('origin', '*');

        const response = await fetchWithTimeout(url.toString());
        const data = await response.json();
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        const fullText = pages[pageId].extract;

        if (!fullText) throw new Error('記事が空、または取得できませんでした');

        const content = `【主題: ${topic}】\n\n${fullText}`;
        textArea.value = content;
        if (charCountDisplay) charCountDisplay.textContent = `${content.length.toLocaleString()} chars`;

        updateUI('complete');
        textArea.scrollTop = 0;

    } catch (error) {
        console.error(error);
        textArea.value = "❌ エラーが発生しました。\n再試行してください: " + error.message;
        updateUI('error');
    } finally {
        genBtn.disabled = false;
    }
}

// ========================================
// 初期化
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    const fontSizeEl = document.getElementById('fontSize');
    const fontFamilyEl = document.getElementById('fontFamily');
    const genBtnEl = document.getElementById('genBtn');

    if (fontSizeEl) fontSizeEl.addEventListener('change', updateStyle);
    if (fontFamilyEl) fontFamilyEl.addEventListener('change', updateStyle);
    if (genBtnEl) genBtnEl.addEventListener('click', fetchFullText);

    loadPreferences();
});
