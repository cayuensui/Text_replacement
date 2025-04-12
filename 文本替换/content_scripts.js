(() => {
    let floatWindowFrame = null;

    // 创建悬浮窗
    function createFloatWindow(data, windowType = 'float-window') {
        if (floatWindowFrame) {
            return;
        }

        // 创建iframe
        floatWindowFrame = document.createElement('iframe');
        floatWindowFrame.src = chrome.runtime.getURL(
            windowType === 'existing-rules' ? 'existing-rules-window.html' : 'float-window.html'
        );
        floatWindowFrame.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9999;
        `;

        document.body.appendChild(floatWindowFrame);

        // 等待iframe加载完成后发送数据
        floatWindowFrame.onload = () => {
            const messageType = windowType === 'existing-rules' ? 'initExistingRulesWindow' : 'initFloatWindow';
            console.log(`[Content] 发送消息类型: ${messageType}`, data);
            floatWindowFrame.contentWindow.postMessage({
                type: messageType,
                data: data
            }, '*');
        };
    }

    // 关闭悬浮窗
    function closeFloatWindow() {
        if (floatWindowFrame) {
            floatWindowFrame.remove();
            floatWindowFrame = null;
        }
    }

    // 监听来自background.js的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'showFloatingWindow') {
            createFloatWindow(request.data, request.data.windowType);
        } else if (request.type === 'ruleUpdated') {
            console.log('[Content] 收到规则更新通知:', request);
            // 立即重新执行文本替换
            replaceText();
        }
    });

    // 监听来自悬浮窗的消息
    window.addEventListener('message', (event) => {
        if (event.data.type === 'closeFloatWindow') {
            closeFloatWindow();
        } else if (event.data.type === 'reloadPage') {
            window.location.reload();
        }
    });

    // 文本替换逻辑
    function replaceText() {
        console.log('[Content] 开始执行文本替换...');
        chrome.storage.local.get(null, (result) => {
            let dictionaries = [];

            // 优先使用_DICT_格式数据
            const dictEntries = Object.entries(result)
                .filter(([key]) => key.startsWith('_DICT_') && key !== '_DICT_ID');

            if (dictEntries.length > 0) {
                dictionaries = dictEntries
                    .map(([key, value]) => {
                        // 从_DICT_key中提取规则ID
                        const ruleId = key.replace('_DICT_', '');
                        // 查找对应的规则
                        const rule = result.rules?.find(r => r.id === ruleId);

                        // 如果规则不存在或被禁用，返回null
                        if (!rule || !rule.enabled) {
                            console.log(`[Content] 规则 ${value.name} (${ruleId}) 未启用或不存在`);
                            return null;
                        }

                        console.log(`[Content] 应用规则 ${value.name} (${ruleId})`);
                        return value;
                    })
                    .filter(Boolean); // 过滤掉null值
            }
            // 如果没有_DICT_数据，尝试从rules转换
            else if (result.rules && result.rules.length > 0) {
                console.log('[Content] 使用rules数据');
                dictionaries = result.rules
                    .filter(rule => {
                        const isEnabled = rule.enabled;
                        console.log(`[Content] 规则 ${rule.name} (${rule.id}) ${isEnabled ? '已启用' : '已禁用'}`);
                        return isEnabled;
                    })
                    .map(rule => ({
                        name: rule.name,
                        words: {
                            [rule.pattern]: {
                                origin: rule.pattern,
                                mask: rule.replacement
                            }
                        },
                        scopes: rule.scope === 'all' ? [] : [{
                            type: 'host',
                            pattern: rule.scope,
                            useReg: false
                        }]
                    }));
            }

            console.log('[Content] 当前生效的词典数量:', dictionaries.length);
            if (!dictionaries.length) {
                console.log('[Content] 没有可用的替换规则');
                return;
            }

            const currentHost = window.location.hostname;

            // 遍历所有文本节点
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let node;
            while (node = walker.nextNode()) {
                // 跳过script和style标签内的文本
                if (node.parentElement.tagName === 'SCRIPT' ||
                    node.parentElement.tagName === 'STYLE') {
                    continue;
                }

                let text = node.textContent;
                let modified = false;

                // 应用所有词典规则
                for (const dict of dictionaries) {
                    // 检查作用域
                    if (dict.scopes && dict.scopes.length > 0) {
                        const matchScope = dict.scopes.some(scope => {
                            if (scope.type === 'host') {
                                return scope.useReg ?
                                    new RegExp(scope.pattern).test(currentHost) :
                                    currentHost.includes(scope.pattern);
                            }
                            return false;
                        });
                        if (!matchScope) continue;
                    }

                    // 替换文本
                    for (const [origin, replacement] of Object.entries(dict.words)) {
                        if (text.includes(origin)) {
                            text = text.split(origin).join(replacement.replacement || replacement.mask);
                            modified = true;
                        }
                    }
                }

                // 如果文本被修改，更新节点内容
                if (modified) {
                    node.textContent = text;
                }
            }
        });
    }

    // 等待DOM加载完成
    function initObserver() {
        if (document.body) {
            // 执行初始替换
            replaceText();

            // 设置观察器
            const observer = new MutationObserver((mutations) => {
                replaceText();
            });

            // 开始观察
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        } else {
            // 如果body还不存在，等待它加载完成
            document.addEventListener('DOMContentLoaded', initObserver);
        }
    }

    // 初始化观察器
    initObserver();
})();