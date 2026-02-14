/**
 * History Full-Text Reader - Dynamic Category Crawling Logic (Fixed)
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
 * 【大幅変更箇所】
 * 「Category:歴史」から再帰的に下位カテゴリを辿り、最終的なキーワードを抽出する
 * ランダムな開始文字を追加して多様性を確保
 */
async function getRandomTopic() {
    // 起点となるカテゴリ（確実に存在するものを指定）
    let targetCat = "歴史";
    const maxDepth = 2; // 潜る深さ

    // 1. 再帰的に下位カテゴリをランダムに辿る
    for (let i = 0; i < maxDepth; i++) {
        const subCatUrl = new URL(CONFIG.API_URL);
        subCatUrl.searchParams.append('format', 'json');
        subCatUrl.searchParams.append('action', 'query');
        subCatUrl.searchParams.append('list', 'categorymembers');
        subCatUrl.searchParams.append('cmtitle', 'Category:' + targetCat);
        subCatUrl.searchParams.append('cmtype', 'subcat'); // 子カテゴリのみ
        subCatUrl.searchParams.append('cmlimit', '50'); // 取得数を少し増やす
        subCatUrl.searchParams.append('origin', '*');

        try {
            const res = await fetchWithTimeout(subCatUrl.toString());
            const data = await res.json();
            const subCats = data.query ? data.query.categorymembers : [];

            if (subCats && subCats.length > 0) {
                // スタブカテゴリや管理用カテゴリを除外する簡易フィルタ
                const filtered = subCats.filter(c => 
                    !c.title.includes('スタブ') && 
                    !c.title.includes('画像') && 
                    !c.title.includes('テンプレート') &&
                    !c.title.includes('ウィキ') &&
                    !c.title.includes('Wikipedia')
                );
                
                const pool = filtered.length > 0 ? filtered : subCats;
                // ランダムに1つ選んで次の深さの起点にする
                const nextCat = pool[Math.floor(Math.random() * pool.length)];
                targetCat = nextCat.title.replace(/^Category:/, "");
            } else {
                break; // 下位がなければ現在のカテゴリで確定
            }
        } catch (e) {
            console.warn(`サブカテゴリ取得失敗: ${targetCat}`, e);
            break; // エラーなら現状維持で進む
        }
    }

    // 2. 確定したカテゴリからランダムな文字位置で記事を取得
    // 「あ～わ」「A～Z」などをランダムに選定
    const chars = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわABCDE";
    const randomStart = chars[Math.floor(Math.random() * chars.length)];

    const url = new URL(CONFIG.API_URL);
    url.searchParams.append('format', 'json');
    url.searchParams.append('action', 'query');
    url.searchParams.append('list', 'categorymembers');
    url.searchParams.append('cmtitle', 'Category:' + targetCat);
    url.searchParams.append('cmstartsortkeyprefix', randomStart); // ランダム開始位置
    url.searchParams.append('cmlimit', '100');
    url.searchParams.append('origin', '*');

    const res = await fetchWithTimeout(url.toString());
    const data = await res.json();
    
    if (!data.query || !data.query.categorymembers || data.query.categorymembers.length === 0) {
        // ランダム開始位置でヒットしなかった場合、開始位置指定なしで再トライ
        // (カテゴリ自体は存在するが、指定した文字から始まる記事がない場合のため)
        const fallbackUrl = new URL(CONFIG.API_URL);
        fallbackUrl.searchParams.append('format', 'json');
        fallbackUrl.searchParams.append('action', 'query');
        fallbackUrl.searchParams.append('list', 'categorymembers');
        fallbackUrl.searchParams.append('cmtitle', 'Category:' + targetCat);
        fallbackUrl.searchParams.append('cmlimit', '100');
        fallbackUrl.searchParams.append('origin', '*');
        
        const fallbackRes = await fetchWithTimeout(fallbackUrl.toString());
        const fallbackData = await fallbackRes.json();
        
        if (!fallbackData.query || !fallbackData.query.categorymembers || fallbackData.query.categorymembers.length === 0) {
             throw new Error(`カテゴリ【${targetCat}】の記事リスト取得に失敗しました`);
        }
        
        const members = fallbackData.query.categorymembers;
        const pages = members.filter(m => m.ns === 0);
        if (pages.length === 0) throw new Error(`カテゴリ【${targetCat}】内に記事が見つかりませんでした`);
        const randomPage = pages[Math.floor(Math.random() * pages.length)];
        return { title: randomPage.title, category: targetCat };
    }

    const members = data.query.categorymembers;
    const pages = members.filter(m => m.ns === 0);
    
    if (pages.length === 0) {
        // ランダム開始位置では記事が見つからなかった（サブカテゴリしかなかった等）場合
        throw new Error(`カテゴリ【${targetCat}】内の検索位置に記事がありませんでした`);
    }

    const randomPage = pages[Math.floor(Math.random() * pages.length)];
    return { title: randomPage.title, category: targetCat };
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
            let topic, category;

            if (retryCount < maxRetries) {
                const result = await getRandomTopic();
                topic = result.title;
                category = result.category;
            } else {
                topic = "日本の歴史";
                category = "";
            }

            const retryLabel = retryCount > 0 ? `再試行中(${retryCount}/${maxRetries}): ` : "";
            textArea.value = `${retryLabel}カテゴリ【${category}】から\n【${topic}】を取得しています...`;

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
            
            if (pageId === "-1") throw new Error('該当記事なし');
            
            const fullText = pages[pageId].extract;
            if (!fullText) throw new Error('内容が空');

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
                textArea.value = "❌ 取得できませんでした。\nエラー: " + error.message;
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
