
// 现有规则窗口逻辑
document.addEventListener('DOMContentLoaded', function () {
    // 获取DOM元素
    const closeButton = document.querySelector('.close-button');
    const searchInput = document.getElementById('searchInput');
    const rulesList = document.getElementById('rulesList');
    const selectedTextInput = document.getElementById('selectedText');
    const saveButton = document.getElementById('saveButton');

    // 监听来自content_scripts.js的消息
    window.addEventListener('message', function (event) {
        if (event.data.type === 'initExistingRulesWindow') {
            selectedTextInput.value = event.data.data.selectedText || '';
        }
    });

    // 关闭窗口
    closeButton.addEventListener('click', function () {
        window.close();
    });

    // 获取所有规则
    chrome.runtime.sendMessage({ action: 'getRules' }, function (response) {
        if (response && response.rules) {
            renderRulesList(response.rules);
        } else {
            rulesList.innerHTML = '<div class="no-rules">没有可用的规则</div>';
        }
    });

    // 搜索过滤
    searchInput.addEventListener('input', function (e) {
        const searchTerm = e.target.value.toLowerCase();
        const ruleItems = document.querySelectorAll('.rule-item');

        ruleItems.forEach(item => {
            const name = item.querySelector('.rule-name').textContent.toLowerCase();
            const pattern = item.querySelector('.rule-pattern').textContent.toLowerCase();
            if (name.includes(searchTerm) || pattern.includes(searchTerm)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });

    // 渲染规则列表
    function renderRulesList(rules) {
        if (rules.length === 0) {
            rulesList.innerHTML = '<div class="no-rules">没有可用的规则</div>';
            return;
        }

        rulesList.innerHTML = '';
        rules.forEach(rule => {
            const ruleItem = document.createElement('div');
            ruleItem.className = 'rule-item';
            ruleItem.setAttribute('data-rule-id', rule.id);
            ruleItem.innerHTML = `
                <div class="rule-name">${rule.name || '未命名规则'}</div>
                <div class="rule-pattern">原文本: ${rule.pattern}</div>
                <div class="rule-replacement">替换为: ${rule.replacement}</div>
            `;
            ruleItem.addEventListener('click', function () {
                document.querySelectorAll('.rule-item').forEach(item => {
                    item.classList.remove('active');
                });
                this.classList.add('active');
            });
            rulesList.appendChild(ruleItem);
        });
    }

    // 保存到选中规则
    saveButton.addEventListener('click', function () {
        const selectedRule = document.querySelector('.rule-item.active');
        if (!selectedRule) {
            alert('请先选择一个规则');
            return;
        }

        const ruleName = selectedRule.querySelector('.rule-name').textContent;
        const currentPattern = selectedRule.querySelector('.rule-pattern').textContent.replace('原文本: ', '');
        const newText = selectedTextInput.value.trim();

        if (!newText) {
            alert('请输入有效的替换文本');
            return;
        }

        // 获取规则ID (从DOM元素的自定义属性中)
        const ruleId = selectedRule.getAttribute('data-rule-id');

        // 处理模式字符串，添加新的文本并用|分隔
        let updatedPattern = currentPattern;
        if (!currentPattern.includes(newText)) {
            updatedPattern = currentPattern ? `${currentPattern}|${newText}` : newText;
        }

        // 先获取完整的规则数据
        chrome.runtime.sendMessage({
            action: 'getRuleById',
            id: ruleId
        }, function (response) {
            if (response.error) {
                alert('获取规则失败: ' + response.error);
                return;
            }

            // 更新规则
            const updatedRule = {
                ...response.rule,
                pattern: updatedPattern
            };

            chrome.runtime.sendMessage({
                action: 'updateRule',
                rule: updatedRule
            }, function (response) {
                if (response.success) {
                    alert('规则更新成功');
                    // 通知content_scripts.js关闭悬浮窗
                    window.parent.postMessage({ type: 'closeFloatWindow' }, '*');
                } else {
                    alert('规则更新失败: ' + (response.error || '未知错误'));
                }
            });
        });
    });
});