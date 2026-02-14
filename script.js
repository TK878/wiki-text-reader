/**
 * History Full-Text Reader - Robust Version
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
 * 【修正箇所】Wikipediaの実際のカテゴリ構造に基づいた探索ロジック
 */
async function getRandomTopic() {
    // 確実に存在する高レベルカテゴリ（種）
    const seedCategories = [
        "日本の歴史", "世界史", "中国史", "朝鮮の歴史", "東南アジア史", "中東史", 
        "ヨーロッパ史", "アメリカ合衆国の歴史", "アフリカ史", "ラテンアメリカ史", "オセアニア史",
        "軍事史", "海事史", "経済史", "文化史", "宗教史", "古代ギリシア", "古代ローマ"
    ];
    
    let currentCat = seedCategories[Math.floor(Math.random() * seedCategories.length)];
    let catUsed = currentCat;

    // 1. 再帰的に下位カテゴリを辿る（最大2回）
    for (let depth = 0; depth < 2; depth++) {
        const subCatUrl = `${CONFIG.API_URL}?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(currentCat)}&cmtype=subcat&cmlimit=30&format=json&origin=*`;
        try {
            const res = await fetchWithTimeout(subCatUrl);
            const data = await res.json();
            const subCats = data.query?.categorymembers || [];
            
            if (subCats.length > 0) {
                const filtered = subCats.filter(c => 
                    !["スタブ", "画像", "テンプレート", "Wikipedia", "一覧", "カテゴリ"].some(word => c.title.includes(word))
                );
                if (filtered.length > 0) {
                    currentCat = filtered[Math.floor(Math.random() * filtered.length)].title.replace("Category:", "");
                    catUsed = currentCat;
                }
            }
        } catch (e) { break; }
    }

    // 2. 記事取得時のランダム開始位置設定
    const chars = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわABCDE";
    const randomChar = chars[Math.floor(Math.random() * chars.length)];
    
    let members = [];
    
    // 方法A: ランダム開始位置で取得を試みる
    const urlA = `${CONFIG.API_URL}?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(currentCat)}&cmtype=page&cmstartsortkeyprefix=${encodeURIComponent(randomChar)}&cmlimit=50&format=json&origin=*`;
    try {
        const resA = await fetchWithTimeout(urlA);
        const dataA = await resA.json();
        members = (dataA.query?.categorymembers || []).filter(m => m.ns === 0);
    } catch (e) {}

    // 方法B: Aが空なら開始位置なしで再取得
    if (members.length === 0) {
        const urlB = `${CONFIG.API_URL}?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(currentCat)}&cmtype=page&cmlimit=50&format=json&origin=*`;
        try {
            const resB = await fetchWithTimeout(urlB);
            const dataB = await resB.json();
            members = (dataB.query?.categorymembers || []).filter(m => m.ns === 0);
        } catch (e) {}
    }

    if (members.length === 0) {
        throw new Error(`カテゴリ【${currentCat}】に有効な記事が見つかりませんでした`);
    }

    const randomPage = members[Math.floor(Math.random() * members.length)];
    return { title: randomPage.title, category: catUsed };
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

    genBtn.disabled = true;
    textArea.value = "検索開始...";
    updateUI('fetching');

    let retryCount = 0;
    const maxRetries = 3;
    let success = false;

    while (retryCount <= maxRetries && !success) {
        try {
            let topicInfo;
            if (retryCount < maxRetries) {
                topicInfo = await getRandomTopic();
            } else {
                topicInfo = { title: "日本の歴史", category: "最終手段" };
            }

            const { title: topic, category } = topicInfo;
            const retryLabel = retryCount > 0 ? `再試行中(${retryCount}/${maxRetries}): ` : "";
            textArea.value = `${retryLabel}カテゴリ【${category}】から\n【${topic}】を取得しています...`;

            // 本文取得API（redirects=1 を追加してリダイレクトを解決）
            const url = `${CONFIG.API_URL}?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(topic)}&redirects=1&format=json&origin=*`;

            const response = await fetchWithTimeout(url);
            const data = await response.json();
            const pages = data.query.pages;
            const pageId = Object.keys(pages)[0];
            
            if (pageId === "-1") throw new Error('該当記事なし');
            
            const fullText = pages[pageId].extract;
            if (!fullText || fullText.trim().length === 0) {
                throw new Error('内容が空でした');
            }

            const content = `【主題: ${topic}】\n(カテゴリ: ${category})\n\n${fullText}`;
            textArea.value = content;
            if (charCountDisplay) charCountDisplay.textContent = `${content.length.toLocaleString()} chars`;

            updateUI('complete');
            textArea.scrollTop = 0;
            success = true;

        } catch (error) {
            console.warn(`Attempt ${retryCount + 1} failed: ${error.message}`);
            retryCount++;
            if (retryCount > maxRetries) {
                textArea.value = "❌ 取得できませんでした。時間をおいて再度お試しください。";
                updateUI('error');
            } else {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
    }
    genBtn.disabled = false;
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
