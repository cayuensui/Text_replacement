/**
 * 规则管理系统主脚本 - 现代化版本
 * 采用模块化设计和现代UI交互
 */

class RuleManager {
    constructor() {
        this.currentRuleId = null;
        this.sortConfig = { column: 'name', ascending: true };
        this.elements = {};
        this.currentUrl = ''; // 存储当前URL
        this.init();
        this.getCurrentUrl().catch(error => {
            console.error('获取当前URL失败:', error);
        });
    }

    // 获取当前标签页URL
    getCurrentUrl() {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }
                if (!tabs || tabs.length === 0) {
                    reject(new Error('未找到活动标签页'));
                    return;
                }
                this.currentUrl = tabs[0].url;
                resolve(this.currentUrl);
            });
        });
    }

    // 初始化应用
    init() {
        try {
            this.cacheElements();
            this.bindEvents();
            this.loadRules();
            this.initScopeCards();
        } catch (error) {
            this.showError('初始化失败', error.message);
        }
    }

    // 缓存DOM元素
    cacheElements() {
        this.elements = {
            addRuleBtn: document.getElementById('addRule'),
            rulesTable: document.querySelector('#rulesTable tbody'),
            ruleModal: document.getElementById('ruleModal'),
            modalTitle: document.getElementById('modalTitle'),
            ruleForm: document.getElementById('ruleForm'),
            modalCloseBtn: document.getElementById('modalCloseBtn'),
            cancelBtn: document.getElementById('cancelBtn'),
            searchInput: document.getElementById('searchInput'),
            groupSelect: document.getElementById('groupSelect'),
            nameHeader: document.getElementById('nameHeader'),
            patternHeader: document.getElementById('patternHeader'),
            replacementHeader: document.getElementById('replacementHeader'),
            scopeHeader: document.getElementById('scopeHeader')
        };
    }

    // 绑定事件监听
    bindEvents() {
        this.elements.addRuleBtn.addEventListener('click', () => this.showAddModal());
        this.elements.cancelBtn.addEventListener('click', (e) => {
            console.log('Cancel button clicked');
            e.preventDefault(); // 明确阻止默认行为
            this.hideModal();
        });
        this.elements.modalCloseBtn.addEventListener('click', (e) => {
            console.log('Modal close button clicked');
            e.preventDefault(); // 明确阻止默认行为
            this.hideModal();
        });
        this.elements.searchInput.addEventListener('input', () => this.loadRules());
        this.elements.groupSelect.addEventListener('change', () => this.loadRules());

        // 表头排序
        this.elements.nameHeader.addEventListener('click', () => this.sortRules('name'));
        this.elements.patternHeader.addEventListener('click', () => this.sortRules('pattern'));
        this.elements.replacementHeader.addEventListener('click', () => this.sortRules('replacement'));
        this.elements.scopeHeader.addEventListener('click', () => this.sortRules('scope'));

        // 表单提交
        this.elements.ruleForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveRule();
        });

        // 导入导出按钮
        this.elements.exportRules = document.getElementById('exportRules');
        const importInput = document.getElementById('importRules');

        if (this.elements.exportRules) {
            this.elements.exportRules.addEventListener('click', () => this.exportRules());
        }

        if (importInput) {
            importInput.addEventListener('change', (e) => this.importRules(e));
        }

        // 添加关于按钮事件
        const aboutBtn = document.getElementById('aboutBtn');
        if (aboutBtn) {
            aboutBtn.addEventListener('click', showAboutModal);
        }

        function showAboutModal() {
            // 创建模态框容器
            const modal = document.createElement('div');
            modal.className = 'modal show';
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.right = '0';
            modal.style.bottom = '0';
            modal.style.zIndex = '1000';

            modal.innerHTML = `
                <div class="modal-content" style="max-width: 650px; width: 90%; max-height: 90vh; overflow: auto;">
                    <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid #e9ecef;">
                        <h3 class="modal-title" style="margin: 0;"><i class="fas fa-info-circle"></i> 关于</h3>
                        <button class="modal-close" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body" style="padding: 0;">
                        <iframe src="about.html" style="width: 100%; height: 500px; border: none;"></iframe>
                    </div>
                </div>
            `;

            // 添加到body
            document.body.appendChild(modal);

            // 关闭按钮事件
            modal.querySelector('.modal-close').addEventListener('click', () => {
                document.body.removeChild(modal);
            });

            // 点击模态框外部关闭
            modal.addEventListener('click', function (e) {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                }
            });
        }
    }

    // 更新分组下拉菜单 - 修复选择状态保持问题
    async updateGroupSelect() {
        try {
            const response = await this.sendMessage({ action: "getRules" });
            if (!response?.rules) return;

            // 1. 保存当前选中的分组值
            const currentSelectedGroup = this.elements.groupSelect.value;

            // 2. 提取所有唯一分组名称，包括"默认"分组
            const groups = new Set(['默认']);
            response.rules.forEach(rule => {
                groups.add(rule.group || '默认');
            });

            // 3. 保留"所有分组"选项
            const allGroupsOption = this.elements.groupSelect.querySelector('option[value="all"]');
            this.elements.groupSelect.innerHTML = '';
            this.elements.groupSelect.appendChild(allGroupsOption);

            // 4. 添加分组选项并按字母排序
            Array.from(groups).sort().forEach(group => {
                const option = document.createElement('option');
                option.value = group;
                option.textContent = group;
                this.elements.groupSelect.appendChild(option);
            });

            // 5. 恢复之前选中的分组值
            if (currentSelectedGroup && groups.has(currentSelectedGroup)) {
                this.elements.groupSelect.value = currentSelectedGroup;
            } else {
                // 默认选中"所有分组"
                this.elements.groupSelect.value = 'all';
            }

            console.debug('分组下拉菜单更新完成，当前选择:', this.elements.groupSelect.value);
        } catch (error) {
            console.error('更新分组下拉菜单失败:', error);
        }
    }

    // 加载规则列表
    async loadRules() {
        try {
            console.debug(`[${new Date().toISOString()}] 开始加载规则列表`);

            // 显示加载状态
            this.elements.rulesTable.innerHTML = `
                <tr>
                    <td colspan="7" class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i> 加载中...
                    </td>
                </tr>
            `;

            // 更新分组下拉菜单
            await this.updateGroupSelect();

            console.debug(`[${new Date().toISOString()}] 发送获取规则请求`);
            const response = await this.sendMessage({ action: "getRules" });
            console.debug(`[${new Date().toISOString()}] 收到规则响应`, response);

            if (!response?.rules) {
                console.error('无效的规则数据:', response);
                throw new Error('无效的规则数据');
            }

            // 验证规则数据完整性
            const invalidRules = response.rules.filter(rule =>
                !rule.id || !rule.name || !rule.pattern || !rule.replacement ||
                typeof rule.enabled === 'undefined' || !rule.scope
            );

            // 自动修复缺失ID的旧数据
            const fixedRules = response.rules.map(rule => ({
                ...rule,
                id: rule.id || Date.now().toString()
            }));
            response.rules = fixedRules;

            if (invalidRules.length > 0) {
                console.error('发现无效规则数据:', invalidRules.map(r => `ID:${r.id} 缺失字段:${[
                    !r.id ? 'id' : null,
                    typeof r.enabled === 'undefined' ? 'enabled' : null,
                    !r.name ? 'name' : null,
                    !r.pattern ? 'pattern' : null,
                    !r.replacement ? 'replacement' : null,
                    typeof r.enabled === 'undefined' ? 'enabled' : null,
                    !r.scope ? 'scope' : null
                ].filter(Boolean).join(',')}`));
                response.rules = response.rules.filter(rule =>
                    rule.id && rule.name && rule.pattern && rule.replacement
                );
            }

            console.debug(`[${new Date().toISOString()}] 原始规则数量: ${response.rules.length}`);
            const filteredRules = this.filterRules(response.rules);
            console.debug(`[${new Date().toISOString()}] 过滤后规则数量: ${filteredRules.length}`);

            const sortedRules = this.sortRulesList(filteredRules);
            console.debug(`[${new Date().toISOString()}] 排序完成，准备渲染`);

            this.renderRulesTable(sortedRules);

            // 返回加载结果用于验证
            return {
                success: true,
                count: sortedRules.length,
                firstRule: sortedRules[0] || null
            };
        } catch (error) {
            this.showError('加载规则失败', error.message);
            this.elements.rulesTable.innerHTML = `
                <tr>
                    <td colspan="7" class="error-state">
                        <i class="fas fa-exclamation-triangle"></i> 加载失败
                    </td>
                </tr>
            `;
        }
    }

    // 过滤规则
    filterRules(rules) {
        const searchTerm = this.elements.searchInput.value.toLowerCase();
        const groupFilter = this.elements.groupSelect.value;

        return rules.filter(rule => {
            const matchesSearch = rule.name.toLowerCase().includes(searchTerm);
            const matchesGroup = groupFilter === 'all' ||
                (rule.group || '默认') === groupFilter;
            return matchesSearch && matchesGroup;
        });
    }

    // 排序规则
    sortRules(column) {
        if (this.sortConfig.column === column) {
            this.sortConfig.ascending = !this.sortConfig.ascending;
        } else {
            this.sortConfig = { column, ascending: true };
        }
        this.loadRules();
    }

    // 排序规则列表
    sortRulesList(rules) {
        return [...rules].sort((a, b) => {
            const aValue = a[this.sortConfig.column];
            const bValue = b[this.sortConfig.column];

            if (aValue < bValue) return this.sortConfig.ascending ? -1 : 1;
            if (aValue > bValue) return this.sortConfig.ascending ? 1 : -1;
            return 0;
        });
    }

    // 渲染规则表格
    renderRulesTable(rules) {
        this.elements.rulesTable.innerHTML = '';

        if (rules.length === 0) {
            this.elements.rulesTable.innerHTML = `
        <tr>
          <td colspan="8" class="text-center">没有找到规则</td>
        </tr>
      `;
            return;
        }

        rules.forEach(rule => {
            const row = document.createElement('tr');
            row.innerHTML = `
        <td>${rule.name || '-'}</td>
        <td><code>${rule.pattern || '-'}</code></td>
        <td><code>${rule.replacement || '-'}</code></td>
        <td>${rule.group || '默认'}</td>
        <td>${rule.priority || 0}</td>
        <td>
          <span class="scope-badge ${rule.scope === 'all' ? 'scope-all' : 'scope-custom'}" 
                title="${rule.scope === 'all' ? '全部网站' : rule.scope || '全部网站'}">
            ${rule.scope === 'all' ? '全部网站' :
                    rule.scope ? this.formatScopeDisplay(rule.scope) : '全部网站'}
          </span>
        </td>
        <td>
          <span class="status ${rule.enabled ? 'status-active' : 'status-inactive'}">
            ${rule.enabled ? '启用' : '禁用'}
          </span>
        </td>
        <td>
          <div class="action-buttons">
            <button class="action-btn toggle-status" data-id="${rule.id}" title="${rule.enabled ? '禁用' : '启用'}">
              <i class="fas fa-power-off"></i>
            </button>
            <button class="action-btn edit" data-id="${rule.id}" title="编辑">
              <i class="fas fa-edit"></i>
            </button>
            <button class="action-btn delete" data-id="${rule.id}" title="删除">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      `;
            this.elements.rulesTable.appendChild(row);
        });

        // 绑定行内按钮事件
        document.querySelectorAll('.toggle-status').forEach(btn => {
            btn.addEventListener('click', (e) => this.toggleRuleStatus(e));
        });
        document.querySelectorAll('.edit').forEach(btn => {
            btn.addEventListener('click', (e) => this.editRule(e));
        });
        document.querySelectorAll('.delete').forEach(btn => {
            btn.addEventListener('click', (e) => this.deleteRule(e));
        });
    }

    // 显示添加规则模态框
    showAddModal() {
        this.currentRuleId = null;
        this.elements.modalTitle.textContent = '添加新规则';
        this.elements.ruleForm.reset();
        document.getElementById('enabled').checked = true;
        this.showModal();
    }

    // 编辑规则
    async editRule(event) {
        const ruleId = event.currentTarget.getAttribute('data-id');

        try {
            const response = await this.sendMessage({ action: "getRuleById", id: ruleId });
            if (!response?.rule) throw new Error('规则数据无效');

            this.currentRuleId = ruleId;
            this.elements.modalTitle.textContent = '编辑规则';

            const form = this.elements.ruleForm;
            form.querySelector('#ruleName').value = response.rule.name;
            form.querySelector('#pattern').value = response.rule.pattern;
            form.querySelector('#replacement').value = response.rule.replacement;
            form.querySelector('#group').value = response.rule.group || '';
            form.querySelector('#priority').value = response.rule.priority || 0;
            form.querySelector('#enabled').checked = response.rule.enabled !== false;

            // 设置生效范围
            const allSitesRadio = form.querySelector('#allSites');
            const customSiteRadio = form.querySelector('#customSite');
            const customUrlInput = form.querySelector('#customUrl');

            if (response.rule.scope === 'all' || !response.rule.scope) {
                allSitesRadio.checked = true;
                customUrlInput.style.display = 'none';
                customUrlInput.value = '';
            } else {
                customSiteRadio.checked = true;
                customUrlInput.style.display = 'block';
                customUrlInput.value = response.rule.scope;
            }
            this.handleScopeChange();

            this.showModal();
        } catch (error) {
            this.showError('加载规则失败', error.message);
        }
    }

    // 切换规则状态
    async toggleRuleStatus(event) {
        event.stopPropagation(); // 阻止事件冒泡
        const toggleBtn = event.currentTarget;
        const ruleId = toggleBtn.getAttribute('data-id');

        // 显示加载状态（使用CSS类）
        const originalHTML = toggleBtn.innerHTML;
        toggleBtn.className = 'toggle-btn';
        toggleBtn.innerHTML = '<i class="fas fa-spinner fa-spin icon"></i>';
        toggleBtn.disabled = true;

        try {
            // 获取当前规则状态
            const response = await this.sendMessage({ action: "getRuleById", id: ruleId });
            if (!response?.rule) throw new Error('规则数据无效');

            // 准备更新数据
            const updatedRule = {
                ...response.rule,
                enabled: !response.rule.enabled
            };

            console.log('准备更新规则状态:', updatedRule);

            // 发送更新请求
            const updateResponse = await this.sendMessage({
                action: "updateRule",
                rule: updatedRule
            });

            if (!updateResponse?.success) {
                throw new Error(updateResponse?.error || '更新规则状态失败');
            }

            console.log('规则状态更新成功:', updateResponse.message);

            // 更新UI状态
            toggleBtn.innerHTML = updatedRule.enabled ?
                '<i class="fas fa-power-off"></i>' :
                '<i class="fas fa-power-off" style="color: #ef476f"></i>';

            // 显示成功提示（优化横排布局）
            toggleBtn.style.display = 'flex';
            toggleBtn.style.alignItems = 'center';
            toggleBtn.style.justifyContent = 'center';

            const statusText = document.createElement('span');
            statusText.textContent = updateResponse.message;
            statusText.style.marginLeft = '6px';
            statusText.style.color = updatedRule.enabled ? '#06d6a0' : '#ef476f';
            statusText.style.fontSize = '12px';
            toggleBtn.appendChild(statusText);

            // 2秒后恢复按钮状态
            setTimeout(() => {
                statusText.remove();
                toggleBtn.disabled = false;
                this.loadRules(); // 刷新规则列表
            }, 2000);

        } catch (error) {
            console.error('切换规则状态出错:', error);

            // 恢复按钮状态
            toggleBtn.innerHTML = originalHTML;
            toggleBtn.disabled = false;

            // 显示错误提示
            this.showError('更新状态失败', error.message);
        }
    }

    // 删除规则
    async deleteRule(event) {
        const ruleId = event.currentTarget.getAttribute('data-id');

        if (confirm('确定要删除此规则吗？此操作不可撤销。')) {
            try {
                await this.sendMessage({ action: "deleteRule", id: ruleId });
                this.loadRules();
            } catch (error) {
                this.showError('删除规则失败', error.message);
            }
        }
    }

    // 格式化生效范围显示
    formatScopeDisplay(scope) {
        if (!scope) return '全部网站';
        const domain = scope.replace(/^https?:\/\//, '').split('/')[0];
        return domain.length > 15 ? `${domain.substring(0, 12)}...` : domain;
    }

    // 保存规则
    async saveRule() {
        const form = this.elements.ruleForm;
        const ruleName = form.querySelector('#ruleName').value.trim();
        let pattern = form.querySelector('#pattern').value.trim();
        const replacement = form.querySelector('#replacement').value.trim();
        const allSitesRadio = form.querySelector('#allSites');
        const customUrlInput = form.querySelector('#customUrl');

        if (!ruleName || !pattern || !replacement) {
            this.showError('验证失败', '请填写所有必填字段');
            return;
        }

        // 处理多个关键词，确保格式正确
        pattern = pattern.split('|')
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .join('|');

        if (!pattern) {
            this.showError('验证失败', '请输入有效的匹配模式');
            return;
        }

        // 获取生效范围
        let scope = 'all';

        if (!allSitesRadio.checked && customUrlInput.value.trim()) {
            scope = customUrlInput.value.trim();
            try {
                // 验证域名格式
                const url = new URL(scope.startsWith('http') ? scope : 'http://' + scope);
                scope = url.hostname;
            } catch (e) {
                this.showError('验证失败', '请输入有效的域名');
                return;
            }
        }

        const rule = {
            name: ruleName,
            pattern: pattern,
            replacement: replacement,
            group: form.querySelector('#group').value.trim() || '默认',
            priority: parseInt(form.querySelector('#priority').value) || 0,
            enabled: form.querySelector('#enabled').checked,
            scope: scope
        };

        try {
            if (this.currentRuleId) {
                rule.id = this.currentRuleId;
                await this.sendMessage({ action: "updateRule", rule: rule });
            } else {
                await this.sendMessage({ action: "addRule", rule: rule });
            }

            this.hideModal();
            this.loadRules();
        } catch (error) {
            this.showError('保存失败', error.message);
        }
    }

    // 显示模态框
    showModal() {
        this.elements.ruleModal.classList.add('show');
    }

    // 隐藏模态框
    hideModal() {
        this.elements.ruleModal.classList.remove('show');
    }

    // 发送消息到background
    sendMessage(message) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('请求超时：后台服务未响应'));
            }, 5000);

            chrome.runtime.sendMessage(message, (response) => {
                clearTimeout(timeoutId);
                if (chrome.runtime.lastError) {
                    console.error('后台通信错误:', {
                        message: message.action,
                        error: chrome.runtime.lastError
                    });
                    reject(chrome.runtime.lastError);
                } else {
                    console.debug('收到后台响应:', {
                        request: message.action,
                        response: response
                    });
                    resolve(response);
                }
            });
        });
    }

    // 显示错误信息
    showError(title, message) {
        console.error(`${title}: ${message}`);
        alert(`${title}: ${message}`);
    }

    // 导出规则
    async exportRules() {
        try {
            const rules = await this.sendMessage({ action: "getRules" });
            // 确保每条规则都有scope字段
            const processedRules = rules.rules.map(rule => ({
                ...rule,
                scope: rule.scope || 'all'
            }));
            const dataStr = JSON.stringify(processedRules, null, 2);
            const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;

            const exportFileDefaultName = `rules-${new Date().toISOString().slice(0, 10)}.json`;
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
        } catch (error) {
            this.showError('导出失败', error.message);
        }
    }

    // 导入规则
    async importRules(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const fileContent = await file.text();
            const rules = JSON.parse(fileContent);

            if (!Array.isArray(rules)) {
                throw new Error('无效的规则文件格式');
            }

            // 验证并处理导入的规则
            const processedRules = rules.map(rule => {
                // 确保必填字段存在
                if (!rule.name || !rule.pattern || !rule.replacement) {
                    throw new Error('规则缺少必填字段');
                }

                // 处理scope字段
                let scope = 'all';
                if (rule.scope && rule.scope !== 'all') {
                    try {
                        // 验证域名格式
                        const url = new URL(rule.scope.startsWith('http') ? rule.scope : 'http://' + rule.scope);
                        scope = url.hostname;
                    } catch (e) {
                        console.warn(`规则 "${rule.name}" 的scope字段格式无效，已设置为全部网站`);
                    }
                }

                return {
                    name: rule.name,
                    pattern: rule.pattern,
                    replacement: rule.replacement,
                    group: rule.group || '默认',
                    priority: rule.priority || 0,
                    enabled: rule.enabled !== false,
                    scope: scope
                };
            });

            const result = await this.sendMessage({
                action: "importRules",
                rules: processedRules
            });

            // 添加空值检查
            if (!result) {
                throw new Error('后台服务未响应，请检查扩展运行状态');
            }

            if (result.success) {
                this.showSuccess('导入成功', `已导入 ${processedRules.length} 条规则`);
                this.loadRules();
            } else {
                throw new Error(result.message || '导入失败');
            }
        } catch (error) {
            this.showError('导入失败', error.message);
        } finally {
            event.target.value = '';
        }
    }

    // 初始化生效范围卡片 (新版)
    initScopeCards() {
        console.log('初始化生效范围卡片...');
        const scopeContainer = document.querySelector('.scope-options');
        if (!scopeContainer) {
            console.error('找不到.scope-options容器');
            return;
        }

        const allSitesCard = document.getElementById('allSitesCard');
        const customSiteCard = document.getElementById('customSiteCard');
        const allSitesCheckbox = document.getElementById('allSites');
        const customSiteCheckbox = document.getElementById('customSite');
        const customUrlInput = document.getElementById('customUrl');

        // 使用事件委托处理卡片点击
        scopeContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.scope-card');
            if (!card) return;

            const checkbox = card.querySelector('.scope-card-checkbox');
            if (!checkbox) {
                console.error('找不到对应的checkbox', card.id);
                return;
            }

            console.log('点击卡片:', card.id);
            checkbox.checked = true;
            this.handleScopeChange(checkbox);
        });

        // 处理范围变化
        this.handleScopeChange = (sourceCheckbox) => {
            console.log('处理范围变化...');

            // 更新卡片状态
            allSitesCard.classList.toggle('active', allSitesCheckbox.checked);
            customSiteCard.classList.toggle('active', customSiteCheckbox.checked);

            // 显示/隐藏自定义输入
            customUrlInput.style.display = customSiteCheckbox.checked ? 'block' : 'none';
            console.log('自定义输入显示:', customUrlInput.style.display);

            // 自动聚焦到自定义输入框
            if (customSiteCheckbox.checked) {
                setTimeout(() => {
                    customUrlInput.focus();
                }, 100);
            }
        };

        // 初始化状态
        console.log('初始化状态...');
        this.handleScopeChange(allSitesCheckbox);
    }

    // 显示成功信息
    showSuccess(title, message) {
        console.log(`${title}: ${message}`);
        alert(`${title}: ${message}`);
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    const ruleManager = new RuleManager();

    // 绑定导入导出按钮
    document.getElementById('exportBtn')?.addEventListener('click', () => ruleManager.exportRules());
    document.getElementById('importBtn')?.addEventListener('change', (e) => ruleManager.importRules(e));
});