(() => {
    // 数据迁移函数
    function migrateData() {
        chrome.storage.sync.get(['rules'], (syncData) => {
            if (syncData.rules && syncData.rules.length > 0) {
                // 迁移sync数据到local
                chrome.storage.local.get(['rules'], (localData) => {
                    if (!localData.rules || localData.rules.length === 0) {
                        // 转换数据格式
                        const newRules = syncData.rules.map(rule => ({
                            ...rule,
                            scope: rule.scope || 'all'
                        }));

                        // 创建_DICT_格式数据
                        const dictUpdates = {};
                        newRules.forEach(rule => {
                            const dictKey = `_DICT_${rule.id}`;
                            dictUpdates[dictKey] = {
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
                            };
                        });

                        // 保存新格式数据
                        chrome.storage.local.set({
                            rules: newRules,
                            ...dictUpdates
                        }, () => {
                            // 迁移完成后删除旧数据
                            chrome.storage.sync.remove('rules');
                        });
                    }
                });
            }
        });
    }

    // 扩展启动时执行数据迁移
    chrome.runtime.onStartup.addListener(() => {
        migrateData();
    });

    // 打开管理页面
    function openManagePage() {
        chrome.tabs.create({ url: "app.html" });
    }

    // 创建右键菜单
    function createContextMenus() {
        // 创建父菜单
        chrome.contextMenus.create({
            id: 'text-replace',
            title: '文本替换',
            contexts: ['selection']
        });

        // 创建子菜单
        chrome.contextMenus.create({
            id: 'add-to-dictionary',
            parentId: 'text-replace',
            title: '添加新规则',
            contexts: ['selection']
        });

        // 添加"保存到已有规则"菜单项
        chrome.contextMenus.create({
            id: 'save-to-existing',
            parentId: 'text-replace',
            title: '保存到已有规则',
            contexts: ['selection']
        });
    }

    // 处理右键菜单点击
    function handleContextMenuClick(info, tab) {
        if (info.menuItemId === 'add-to-dictionary') {
            // 获取选中的文本
            const selectedText = info.selectionText;
            // 获取当前网址
            const currentUrl = tab.url;

            // 创建悬浮窗
            chrome.tabs.sendMessage(tab.id, {
                type: 'showFloatingWindow',
                data: {
                    selectedText: selectedText,
                    currentUrl: currentUrl
                }
            });
        } else if (info.menuItemId === 'save-to-existing') {
            // 获取选中的文本
            const selectedText = info.selectionText;
            // 获取当前网址
            const currentUrl = tab.url;

            // 创建existing-rules窗口
            chrome.tabs.sendMessage(tab.id, {
                type: 'showFloatingWindow',
                data: {
                    selectedText: selectedText,
                    currentUrl: currentUrl,
                    windowType: 'existing-rules'
                }
            });
        }
    }

    // 监听扩展图标点击
    chrome.action.onClicked.addListener(openManagePage);

    // 监听安装事件
    chrome.runtime.onInstalled.addListener((details) => {
        if (details.reason === 'install') {
            openManagePage();
        }
        // 创建右键菜单
        createContextMenus();
    });

    // 监听右键菜单点击
    chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch (request.action) {
            case "getSelectionAndUrl":
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    const currentTab = tabs[0];
                    sendResponse({
                        selectedText: request.selectedText,
                        currentUrl: currentTab.url
                    });
                });
                return true;
            case "getRuleById":
                // 根据ID获取单个规则
                chrome.storage.local.get('rules', (data) => {
                    const rules = data.rules || [];
                    const rule = rules.find(r => r.id === request.id);
                    if (rule) {
                        sendResponse({ rule });
                    } else {
                        sendResponse({ error: '找不到指定的规则' });
                    }
                });
                return true;

            case "getRules":
                // 获取所有规则
                chrome.storage.local.get('rules', (data) => {
                    console.log('获取规则数据:', data.rules); // 调试日志
                    sendResponse({ rules: data.rules || [] });
                });
                return true;
            case "getRuleById":
                // 获取指定ID的规则
                chrome.storage.local.get('rules', (data) => {
                    const rules = data.rules || [];
                    const rule = rules.find(r => r.id === request.id);
                    if (!rule) {
                        console.error('[Background] 规则未找到:', request.id);
                        sendResponse({ error: 'Rule not found' });
                    } else {
                        console.debug('[Background] 获取到规则:', rule);
                        sendResponse({ rule: rule });
                    }
                });
                return true;
            case "addRule":
                console.debug('[Background] 开始添加规则:', request.rule);
                // 添加规则
                chrome.storage.local.get(['rules'], (data) => {
                    let rules = data.rules || [];
                    const newRule = {
                        id: Date.now().toString(),
                        name: request.rule.name,
                        pattern: request.rule.pattern,
                        replacement: request.rule.replacement,
                        group: request.rule.group || '默认',
                        priority: request.rule.priority || 0,
                        enabled: request.rule.enabled !== undefined ? request.rule.enabled : true,
                        scope: request.rule.scope || 'all'
                    };
                    rules.push(newRule);

                    // 同时更新_DICT_格式数据
                    const dictKey = `_DICT_${newRule.id}`;

                    // 处理多个关键词的情况（用|分隔）
                    const patterns = newRule.pattern.split('|');
                    const wordsObj = {};

                    // 为每个关键词创建替换规则
                    patterns.forEach(pattern => {
                        if (pattern.trim()) {
                            wordsObj[pattern.trim()] = {
                                origin: pattern.trim(),
                                mask: newRule.replacement
                            };
                        }
                    });

                    const dictValue = {
                        name: newRule.name,
                        words: wordsObj,
                        scopes: newRule.scope === 'all' ? [] : [{
                            type: 'host',
                            pattern: newRule.scope,
                            useReg: false
                        }]
                    };

                    console.debug('[Background] 准备存储规则:', { rules, [dictKey]: dictValue });
                    chrome.storage.local.set({
                        rules: rules,
                        [dictKey]: dictValue
                    }, () => {
                        // 验证存储结果
                        chrome.storage.local.get(['rules', dictKey], (result) => {
                            const storedRule = result.rules?.find(r => r.id === newRule.id);
                            const storedDict = result[dictKey];

                            if (!storedRule || !storedDict) {
                                console.error('[Background] 规则存储验证失败:', result);
                                sendResponse({ error: '规则存储失败' });
                            } else {
                                console.debug('[Background] 规则存储成功:', storedRule);
                                sendResponse({ success: true, rule: storedRule });
                            }
                        });
                    });
                });
                return true;
            case "updateRule":
                console.debug('[Background] 更新规则:', request.rule);

                // 更新前校验必填字段
                const requiredFields = ['id', 'name', 'pattern', 'replacement', 'enabled', 'scope'];
                const missingFields = requiredFields.filter(field => !request.rule.hasOwnProperty(field));

                if (missingFields.length > 0) {
                    console.error('[Background] 规则字段缺失:', missingFields);
                    sendResponse({ error: `缺少必填字段: ${missingFields.join(', ')}` });
                    return;
                }

                chrome.storage.local.get(['rules'], (data) => {
                    let rules = data.rules || [];
                    const index = rules.findIndex(r => r.id === request.rule.id);

                    if (index === -1) {
                        console.error('[Background] 规则未找到:', request.rule.id);
                        sendResponse({ error: 'Rule not found' });
                        return;
                    }

                    // 更新规则
                    const originalState = rules[index].enabled;
                    rules[index] = request.rule;
                    console.log(`[Background] 规则状态从 ${originalState} 更新为 ${request.rule.enabled}`);

                    // 同时更新_DICT_格式数据
                    const dictKey = `_DICT_${request.rule.id}`;

                    // 处理多个关键词的情况（用|分隔）
                    const patterns = request.rule.pattern.split('|');
                    const wordsObj = {};

                    // 为每个关键词创建替换规则
                    patterns.forEach(pattern => {
                        if (pattern.trim()) {
                            wordsObj[pattern.trim()] = {
                                origin: pattern.trim(),
                                mask: request.rule.replacement
                            };
                        }
                    });

                    const dictValue = {
                        name: request.rule.name,
                        words: wordsObj,
                        scopes: request.rule.scope === 'all' ? [] : [{
                            type: 'host',
                            pattern: request.rule.scope,
                            useReg: false
                        }]
                    };

                    // 保存更新
                    chrome.storage.local.set({
                        rules: rules,
                        [dictKey]: dictValue
                    }, () => {
                        console.log('[Background] 规则已保存到storage');
                        // 验证更新结果
                        chrome.storage.local.get(['rules', dictKey], (result) => {
                            const updatedRule = result.rules?.find(r => r.id === request.rule.id);
                            const updatedDict = result[dictKey];

                            if (!updatedRule || !updatedDict) {
                                console.error('[Background] 规则更新验证失败');
                                sendResponse({ error: '规则更新失败' });
                            } else {
                                console.log('[Background] 规则更新验证成功:', updatedRule);

                                // 通知所有标签页规则已更新
                                chrome.tabs.query({}, (tabs) => {
                                    tabs.forEach(tab => {
                                        chrome.tabs.sendMessage(tab.id, {
                                            type: 'ruleUpdated',
                                            ruleId: updatedRule.id,
                                            enabled: updatedRule.enabled
                                        }).catch(err => {
                                            console.debug(`[Background] 无法发送消息到标签页 ${tab.id}:`, err);
                                        });
                                    });
                                });

                                sendResponse({
                                    success: true,
                                    rule: updatedRule,
                                    message: `规则状态已${updatedRule.enabled ? '启用' : '禁用'}`
                                });
                            }
                        });
                    });
                });
                return true;
            case "deleteRule":
                // 删除规则
                chrome.storage.local.get('rules', (data) => {
                    let rules = data.rules || [];
                    const ruleId = request.id;
                    rules = rules.filter(r => r.id !== ruleId);

                    // 同时删除_DICT_格式数据
                    const dictKey = `_DICT_${ruleId}`;
                    chrome.storage.local.remove(dictKey, () => {
                        chrome.storage.local.set({ rules: rules }, () => {
                            sendResponse({ success: true });
                        });
                    });
                });
                return true; // 保持消息通道打开
            case "importRules":
                // 处理导入规则并生成缺失ID
                const processedRules = request.rules.map(rule => ({
                    ...rule,
                    id: rule.id || Date.now().toString(),
                    scope: rule.scope || 'all'
                }));

                // 创建字典更新对象
                const dictUpdates = {};
                processedRules.forEach(rule => {
                    const dictKey = `_DICT_${rule.id}`;
                    const patterns = rule.pattern.split('|');
                    const wordsObj = {};

                    patterns.forEach(pattern => {
                        if (pattern.trim()) {
                            wordsObj[pattern.trim()] = {
                                origin: pattern.trim(),
                                mask: rule.replacement
                            };
                        }
                    });

                    dictUpdates[dictKey] = {
                        name: rule.name,
                        words: wordsObj,
                        scopes: rule.scope === 'all' ? [] : [{
                            type: 'host',
                            pattern: rule.scope,
                            useReg: false
                        }]
                    };
                });

                // 保存规则和字典数据
                chrome.storage.local.set({
                    rules: processedRules,
                    ...dictUpdates
                }, () => {
                    chrome.storage.local.get('rules', (result) => {
                        if (chrome.runtime.lastError || !result.rules) {
                            console.error('规则导入失败:', chrome.runtime.lastError);
                            sendResponse({ success: false, error: '规则存储失败' });
                        } else {
                            console.log('成功导入', result.rules.length, '条规则');
                            sendResponse({ success: true, count: result.rules.length });
                        }
                    });
                });
                return true; // 保持消息通道打开
            case "exportRules":
                // 导出规则
                chrome.storage.sync.get('rules', (data) => {
                    sendResponse({ rules: data.rules || [] });
                });
                return true; // 保持消息通道打开
            default:
                sendResponse({ error: 'Unknown action' });
        }
    });
})();