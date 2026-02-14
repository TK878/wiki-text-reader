// ========================================
// アプリケーション設定定数
// ========================================
const CONFIG = {
    FONT_SIZE_MIN: 8,
    FONT_SIZE_MAX: 50,
    FONT_SIZE_DEFAULT: 14,
    API_TIMEOUT_MS: 10000,
    API_URL: 'https://ja.wikipedia.org/w/api.php',
    STORAGE_KEY_PREFIX: 'historyReader_'
};

// ========================================
// 歴史キーワードデータ
// ========================================
const KEYWORDS = Object.freeze([
    "日本史", "世界史", "織田信長", "豊臣秀吉", "徳川家康", "坂本龍馬", "明治維新", "江戸幕府", "戦国時代", "鎌倉時代",
    "フランス革命", "産業革命", "ルネサンス", "大航海時代", "宗教改革", "アメリカ独立戦争", "ナポレオン", "第一次世界大戦",
    "第二次世界大戦", "ローマ帝国", "ビザンツ帝国", "オスマン帝国", "モンゴル帝国", "チンギス・ハン", "アレクサンドロス大王",
    "シーザー", "クレオパトラ", "秦の始皇帝", "三国志", "諸葛亮", "十字軍", "シルクロード", "ピラミッド", "アステカ", "インカ帝国",
    "科学史", "哲学史", "芸術史", "音楽史", "宗教史", "仏教", "キリスト教", "イスラム教", "ヒンドゥー教",
    "関ヶ原の戦い", "本能寺の変", "黒船来航", "真珠湾攻撃", "ノルマンディー上陸作戦", "ベルリンの壁", "アポロ11号", "黒死病",
    "自由民権運動", "冷戦", "市民革命", "絶対王政", "封建制", "武士道", "安土桃山時代", "奈良時代", "平安時代", "万葉集",
    "産業史", "航海術", "植民地", "アパルトヘイト", "ソ連", "アメリカ合衆国の歴史", "イギリスの歴史", "中国の歴史"
]);

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
    
    if (fontSize) {
        document.getElementById('fontSize').value = validateFontSize(fontSize);
    }
    if (fontFamily) {
        document.getElementById('fontFamily').value = fontFamily;
    }
    updateStyle();
}

function updateStyle() {
    const textArea = document.getElementById('result');
    const fontSize = validateFontSize(document.getElementById('fontSize').value);
    const fontFamily = document.getElementById('fontFamily').value;
    
    textArea.style.fontSize = fontSize + 'px';
    textArea.style.fontFamily = fontFamily;
    
    document.getElementById('fontSize').value = fontSize;
    
    savePreferences();
}

function fetchWithTimeout(url, timeout = CONFIG.API_TIMEOUT_MS) {
    return Promise.race([
        fetch(url),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('APIリクエストがタイムアウトしました')), timeout)
        )
    ]);
}

function validateApiResponse(data) {
    if (!data || !data.query || !data.query.pages) {
        throw new Error('無効なAPIレスポンス形式です');
    }
    
    const pageId = Object.keys(data.query.pages)[0];
    if (!pageId) {
        throw new Error('ページデータが見つかりません');
    }
    
    const page = data.query.pages[pageId];
    if (page.missing) {
        throw new Error('指定されたページが存在しません');
    }
    
    return page.extract || null;
}

function updateUI(status, message = '') {
    const statusText = document.getElementById('statusText');
    
    statusText.textContent = status.toUpperCase();
    statusText.className = ''; 
    statusText.classList.add('status-' + status.toLowerCase());
    
    if (message) {
        console.log(`[${status}] ${message}`);
    }
}

function displayError(error) {
    const textArea = document.getElementById('result');
    const errorMessages = {
        'APIリクエストがタイムアウトしました': 'ネットワークが遅いか、APIが応答しません。もう一度お試しください。',
        '無効なAPIレスポンス形式です': 'Wikipedia APIからのデータが予期した形式ではありません。',
        'ページデータが見つかりません': '選択されたキーワードのデータが取得できませんでした。',
        '指定されたページが存在しません': '選択されたキーワードのページが見つかりません。'
    };
    
    const userMessage = errorMessages[error.message] || error.message || '不明なエラーが発生しました';
    textArea.value = `❌ エラーが発生しました\n\n${userMessage}`;
    updateUI('error', error.message);
}

// ========================================
// メイン処理
// ========================================

async function fetchFullText() {
    const textArea = document.getElementById('result');
    const genBtn = document.getElementById('genBtn');
    const copyBtn = document.getElementById('copyBtn');

    genBtn.disabled = true;
    copyBtn.classList.add('hidden');

    try {
        const topic = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
        updateUI('fetching', `Fetching: ${topic}`);
        textArea.value = "読み込み中...";

        const url = new URL(CONFIG.API_URL);
        url.searchParams.append('format', 'json');
        url.searchParams.append('action', 'query');
        url.searchParams.append('prop', 'extracts');
        url.searchParams.append('explaintext', '1');
        url.searchParams.append('titles', topic);
        url.searchParams.append('origin', '*');

        const response = await fetchWithTimeout(url.toString());
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const fullText = validateApiResponse(data);

        const content = `【主題: ${topic}】\n\n${fullText || '（記事内容が見つかりません）'}`;
        textArea.value = content;

        const charCount = document.getElementById('charCountDisplay');
        charCount.textContent = `${content.length.toLocaleString()} chars`;

        updateUI('complete');
        textArea.scrollTop = 0;
        copyBtn.classList.remove('hidden');

    } catch (error) {
        displayError(error);
    } finally {
        genBtn.disabled = false;
    }
}

async function copyText() {
    const textArea = document.getElementById('result');
    const copyBtn = document.getElementById('copyBtn');
    
    if (!textArea.value.trim()) {
        return;
    }

    try {
        await navigator.clipboard.writeText(textArea.value);
        
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓ Copied';
        copyBtn.disabled = true;
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.disabled = false;
        }, 2000);
        
    } catch (error) {
        console.error('クリップボードコピーに失敗しました:', error);
        alert('クリップボードへのコピーに失敗しました。');
    }
}

// ========================================
// 初期化
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    const fontSizeInput = document.getElementById('fontSize');
    const fontFamilySelect = document.getElementById('fontFamily');
    const genBtn = document.getElementById('genBtn');
    const copyBtn = document.getElementById('copyBtn');

    fontSizeInput.addEventListener('change', updateStyle);
    fontFamilySelect.addEventListener('change', updateStyle);
    genBtn.addEventListener('click', fetchFullText);
    copyBtn.addEventListener('click', copyText);

    loadPreferences();
    updateStyle();
});