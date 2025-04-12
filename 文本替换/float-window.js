// 获取DOM元素
const sensitiveWordInput = document.getElementById('sensitiveWord');
const safeWordInput = document.getElementById('safeWord');
const allSitesCheckbox = document.getElementById('allSites');
const currentSiteCheckbox = document.getElementById('currentSite');
const customSiteCheckbox = document.getElementById('customSite');
const currentUrlDisplay = document.getElementById('currentUrlDisplay');
const customUrlInput = document.getElementById('customUrl');
const saveButton = document.querySelector('.save-button');
const closeButton = document.querySelector('.close-button');

// 获取卡片元素
const allSitesCard = document.getElementById('allSitesCard');
const currentSiteCard = document.getElementById('currentSiteCard');
const customSiteCard = document.getElementById('customSiteCard');

// 初始化数据
let currentUrl = '';
let selectedText = '';

// 监听来自content_script的初始化消息
window.addEventListener('message', (event) => {
    if (event.data.type === 'initFloatWindow') {
        const { selectedText: text, currentUrl: url } = event.data.data;
        selectedText = text;
        currentUrl = url;
        initializeUI();
    }
});

// 初始化界面
function initializeUI() {
    // 设置选中的文本
    sensitiveWordInput.value = selectedText;

    // 显示当前网址
    try {
        const urlObj = new URL(currentUrl);
        currentUrlDisplay.textContent = urlObj.hostname;
    } catch (e) {
        currentUrlDisplay.textContent = currentUrl;
    }

    // 默认选中当前网址
    currentSiteCheckbox.checked = true;
    currentSiteCard.classList.add('active');
    currentUrlDisplay.style.display = 'block';
}

// 作为后备方案，如果未收到消息则主动获取数据
setTimeout(() => {
    if (!selectedText) {
        chrome.runtime.sendMessage({
            action: "getSelectionAndUrl",
            selectedText: selectedText
        }, function (response) {
            if (response) {
                selectedText = response.selectedText;
                currentUrl = response.currentUrl;
                initializeUI();
            }
        });
    }
}, 100);

// 更新卡片激活状态
function updateCardActiveState() {
    allSitesCard.classList.toggle('active', allSitesCheckbox.checked);
    currentSiteCard.classList.toggle('active', currentSiteCheckbox.checked);
    customSiteCard.classList.toggle('active', customSiteCheckbox.checked);
}

// 处理checkbox变化事件
function handleCheckboxChange(sourceCheckbox) {
    // 如果点击的是"全部网站"
    if (sourceCheckbox === allSitesCheckbox && allSitesCheckbox.checked) {
        currentSiteCheckbox.checked = false;
        customSiteCheckbox.checked = false;
        currentUrlDisplay.style.display = 'none';
        customUrlInput.style.display = 'none';
    }
    // 如果点击的是其他选项
    else if (sourceCheckbox !== allSitesCheckbox && (currentSiteCheckbox.checked || customSiteCheckbox.checked)) {
        allSitesCheckbox.checked = false;
    }

    // 处理当前网址显示
    if (currentSiteCheckbox.checked) {
        currentUrlDisplay.style.display = 'block';
    } else {
        currentUrlDisplay.style.display = 'none';
    }

    // 处理自定义网址输入框显示
    if (customSiteCheckbox.checked) {
        customUrlInput.style.display = 'block';
    } else {
        customUrlInput.style.display = 'none';
    }

    updateCardActiveState();
}

// 添加卡片点击事件
allSitesCard.addEventListener('click', (e) => {
    if (e.target !== allSitesCheckbox) {
        allSitesCheckbox.checked = !allSitesCheckbox.checked;
    }
    handleCheckboxChange(allSitesCheckbox);
});

currentSiteCard.addEventListener('click', (e) => {
    if (e.target !== currentSiteCheckbox) {
        currentSiteCheckbox.checked = !currentSiteCheckbox.checked;
    }
    handleCheckboxChange(currentSiteCheckbox);
});

customSiteCard.addEventListener('click', (e) => {
    if (e.target !== customSiteCheckbox) {
        customSiteCheckbox.checked = !customSiteCheckbox.checked;
    }
    handleCheckboxChange(customSiteCheckbox);
});

// 添加checkbox事件监听
allSitesCheckbox.addEventListener('change', () => handleCheckboxChange(allSitesCheckbox));
currentSiteCheckbox.addEventListener('change', () => handleCheckboxChange(currentSiteCheckbox));
customSiteCheckbox.addEventListener('change', () => handleCheckboxChange(customSiteCheckbox));

// 处理保存按钮点击
saveButton.addEventListener('click', () => {
    const safeWord = safeWordInput.value.trim();
    if (!safeWord) {
        alert('请输入安全词');
        return;
    }

    let scope = [];
    if (allSitesCheckbox.checked) {
        scope = []; // 空数组表示全部网站
    } else if (currentSiteCheckbox.checked) {
        try {
            const url = new URL(currentUrl);
            scope = [{
                type: 'host',
                pattern: url.hostname,
                useReg: false
            }];
        } catch (e) {
            alert('当前网址无效');
            return;
        }
    } else if (customSiteCheckbox.checked) {
        const customUrl = customUrlInput.value.trim();
        if (!customUrl) {
            alert('请输入自定义网址');
            return;
        }
        try {
            const url = new URL(customUrl.startsWith('http') ? customUrl : 'http://' + customUrl);
            scope = [{
                type: 'host',
                pattern: url.hostname,
                useReg: false
            }];
        } catch (e) {
            alert('请输入有效的网址');
            return;
        }
    } else {
        alert('请至少选择一个生效范围');
        return;
    }

    // 获取规则名称
    const ruleNameInput = document.getElementById('ruleName');
    const ruleName = ruleNameInput.value.trim() || `${selectedText} -> ${safeWord}`;

    // 获取规则分组
    const groupInput = document.getElementById('group');
    const group = groupInput.value.trim() || '默认';

    // 创建新的词典项
    const newDictItem = {
        name: ruleName,
        words: {
            [selectedText]: {
                origin: selectedText,
                mask: safeWord
            }
        },
        scopes: scope,
        group: group
    };

    // 准备规则数据
    const rule = {
        id: Date.now().toString(),
        name: ruleName,
        pattern: selectedText,
        replacement: safeWord,
        group: group,
        priority: 0,
        enabled: true,
        scope: scope.length ? scope[0].pattern : 'all'
    };

    // 通过background.js保存规则
    chrome.runtime.sendMessage({
        action: "addRule",
        rule: {
            id: Date.now().toString(),
            name: ruleName,
            pattern: selectedText,
            replacement: safeWord,
            group: group,
            priority: 0,
            enabled: true,
            scope: scope.length ? scope[0].pattern : 'all'
        }
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('保存失败:', chrome.runtime.lastError);
            alert('保存失败，请重试');
        } else {
            // 延迟关闭确保保存完成
            setTimeout(() => {
                window.parent.postMessage({ type: 'closeFloatWindow' }, '*');
            }, 300);
        }
    });
});

// 处理关闭按钮点击
closeButton.addEventListener('click', () => {
    window.parent.postMessage({ type: 'closeFloatWindow' }, '*');
});