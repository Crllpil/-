/* ============================================
   智能校园课程排课与调度系统 - 页面通用组件
   ============================================ */

function renderStatCards(containerId, cards) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = cards.map(c => `
        <div class="col-xl-3 col-lg-4 col-md-6">
            <div class="card stat-card h-100">
                <div class="card-body d-flex align-items-center gap-3">
                    <div class="stat-icon" style="background:${c.color || 'var(--sec)'};">
                        <i class="bi ${c.icon || 'bi-bar-chart'}"></i>
                    </div>
                    <div class="flex-grow-1">
                        <div class="stat-value">${c.value}</div>
                        <div class="stat-label">${c.label}</div>
                        ${c.sub ? `<div class="stat-sub">${c.sub}</div>` : ''}
                    </div>
                </div>
            </div>
        </div>`).join('');
}

function renderTimetable(containerId, items, options) {
    const el = document.getElementById(containerId);
    if (!el) return;
    options = options || {};
    const showClass = options.showClass !== false;
    const showTeacher = options.showTeacher !== false;
    const showRoom = options.showRoom !== false;
    const onItemClick = options.onItemClick || null;
    const conflictMap = options.conflictMap || {};
    const days = DAY_NAMES;

    let html = '<div class="timetable-wrap"><div class="timetable">';
    html += '<div class="tt-corner">节次 / 星期</div>';
    days.forEach(d => { html += `<div class="tt-day">${d}</div>`; });

    PERIODS.forEach(p => {
        html += `<div class="tt-time"><strong>${p.label}</strong><span>${p.start}-${p.end}</span></div>`;
        for (let day = 1; day <= 5; day++) {
            const cellItems = items.filter(it => Number(it.day) === day && Number(it.period) === p.period);
            html += `<div class="tt-cell ${cellItems.length ? 'has-item' : ''}" data-day="${day}" data-period="${p.period}">`;
            if (!cellItems.length) {
                html += '<div class="tt-empty">—</div>';
            } else {
                cellItems.forEach(it => {
                    const hard = conflictMap[it.item_id] === 'hard' || it.has_hard_conflict;
                    const soft = conflictMap[it.item_id] === 'soft' || it.has_soft_conflict;
                    const cls = hard ? 'conflict-hard' : (soft ? 'conflict-soft' : '');
                    html += `<div class="tt-item ${cls}" data-item-id="${it.item_id}">
                        <div class="tt-course">${escapeHtml(it.course_name)}</div>
                        <div class="tt-meta">
                            ${showClass ? `<span><i class="bi bi-people me-1"></i>${escapeHtml(it.class_name || it.class_id)}</span>` : ''}
                            ${showTeacher ? `<span><i class="bi bi-person me-1"></i>${escapeHtml(it.teacher_name || it.teacher_id)}</span>` : ''}
                            ${showRoom ? `<span><i class="bi bi-geo-alt me-1"></i>${escapeHtml(it.room_name || it.room_id)}</span>` : ''}
                        </div>
                    </div>`;
                });
            }
            html += '</div>';
        }
    });
    html += '</div></div>';
    el.innerHTML = html;
    if (onItemClick) {
        el.querySelectorAll('.tt-item').forEach(node => {
            node.addEventListener('click', () => onItemClick(node.getAttribute('data-item-id')));
        });
    }
}

function timetableLegend() {
    return `<div class="tt-legend">
        <span><i class="legend-dot normal"></i>正常课程</span>
        <span><i class="legend-dot hard"></i>硬约束冲突</span>
        <span><i class="legend-dot soft"></i>软约束未满足</span>
    </div>`;
}

function renderBarList(containerId, data, options) {
    const el = document.getElementById(containerId);
    if (!el) return;
    options = options || {};
    if (!data || !data.length) {
        el.innerHTML = '<p class="text-center text-muted py-4 mb-0">暂无数据</p>';
        return;
    }
    const max = Math.max(...data.map(d => Number(d.value) || 0), 1);
    el.innerHTML = data.map(d => {
        const value = Number(d.value) || 0;
        const width = Math.max(2, Math.round(value / max * 100));
        return `<div class="bar-row">
            <div class="bar-label" title="${escapeHtml(d.label)}">${escapeHtml(d.label)}</div>
            <div class="bar-track"><div class="bar-fill ${d.cls || ''}" style="width:${width}%;background:${d.color || 'var(--sec)'};">${options.showValue === false ? '' : escapeHtml(d.display != null ? d.display : value)}</div></div>
            <div class="bar-value">${escapeHtml(d.suffix || '')}</div>
        </div>`;
    }).join('');
}

function fillSelect(selectId, options, valueKey, textKey, placeholder) {
    const el = document.getElementById(selectId);
    if (!el) return;
    el.innerHTML = (placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : '') +
        (options || []).map(o => `<option value="${escapeHtml(o[valueKey])}">${escapeHtml(o[textKey])}</option>`).join('');
}

function renderPlanSelect(selectId, plans, selectedId) {
    const el = document.getElementById(selectId);
    if (!el) return;
    const list = (plans || []).slice().sort((a, b) => b.version - a.version);
    el.innerHTML = list.map(p =>
        `<option value="${p.plan_id}" ${String(p.plan_id) === String(selectedId) ? 'selected' : ''}>
            V${p.version} · ${p.gen_method} · 适应度 ${p.fitness}${p.is_active ? ' · 当前启用' : ''}
        </option>`).join('');
}

function itemConflictMap(conflicts) {
    const map = {};
    (conflicts || []).forEach(c => {
        if (!c.entity_id) return;
        if (c.severity === 'hard') map[c.entity_id] = 'hard';
        else if (!map[c.entity_id]) map[c.entity_id] = 'soft';
    });
    return map;
}

function printPage() { window.print(); }

function renderEmptyRow(tbody, colspan, text) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted py-4">${escapeHtml(text || '暂无数据')}</td></tr>`;
}
