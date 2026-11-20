/* ============================================
   智能校园课程排课与调度系统 - 通用工具函数
   ============================================ */

const ROLE_LABELS = {
    admin: '系统管理员',
    scheduler: '教务员',
    teacher: '教师',
    student: '学生',
};
const ROLE_BADGES = {
    admin: 'badge bg-danger',
    scheduler: 'badge bg-warning text-dark',
    teacher: 'badge bg-success',
    student: 'badge bg-primary',
};
const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五'];
const PERIODS = [
    { period: 1, label: '第1-2节', start: '08:00', end: '09:40' },
    { period: 2, label: '第3-4节', start: '10:00', end: '11:40' },
    { period: 3, label: '第5-6节', start: '14:00', end: '15:40' },
    { period: 4, label: '第7-8节', start: '16:00', end: '17:40' },
    { period: 5, label: '第9-10节', start: '19:00', end: '20:40' },
];

// ---- Session ----
function getSession() {
    const s = sessionStorage.getItem('user');
    return s ? JSON.parse(s) : null;
}
function setSession(user) { sessionStorage.setItem('user', JSON.stringify(user)); }
function clearSession() { sessionStorage.clear(); }
function requireAuth() {
    const user = getSession();
    if (!user) {
        window.location.href = '../index.html';
        return null;
    }
    return user;
}
function requireRole(role) {
    const user = requireAuth();
    if (!user) return null;
    if (Array.isArray(role) ? !role.includes(user.role) : user.role !== role) {
        showToast('无权访问此页面', 'danger');
        setTimeout(() => window.location.href = '../index.html', 1200);
        return null;
    }
    return user;
}

// ---- Toast ----
function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const id = 'toast_' + Date.now() + '_' + Math.floor(Math.random() * 100);
    const bgMap = { success: 'bg-success', danger: 'bg-danger', warning: 'bg-warning text-dark', info: 'bg-info text-dark' };
    const iconMap = {
        success: 'bi-check-circle-fill', danger: 'bi-x-circle-fill',
        warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill',
    };
    container.insertAdjacentHTML('beforeend', `
        <div id="${id}" class="toast align-items-center text-white ${bgMap[type] || 'bg-info'} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body"><i class="bi ${iconMap[type] || 'bi-info-circle-fill'} me-2"></i>${escapeHtml(message)}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>`);
    const el = document.getElementById(id);
    new bootstrap.Toast(el, { delay: 3200 }).show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
}

// ---- Loading ----
function showLoading() {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'spinner-overlay';
        overlay.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">加载中...</span></div>';
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
}
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

// ---- Confirm ----
function confirmAction(title, message) {
    return new Promise(resolve => {
        const id = 'confirm_' + Date.now();
        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="${id}" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header"><h5 class="modal-title">${escapeHtml(title)}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                        <div class="modal-body">${escapeHtml(message)}</div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                            <button type="button" class="btn btn-danger" id="${id}_ok">确定</button>
                        </div>
                    </div>
                </div>
            </div>`);
        const el = document.getElementById(id);
        const modal = new bootstrap.Modal(el);
        document.getElementById(id + '_ok').onclick = () => { modal.hide(); resolve(true); };
        el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(false); }, { once: true });
        modal.show();
    });
}

// ---- Format ----
function formatDate(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(String(dateStr).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(dateStr).slice(0, 10);
    return d.toLocaleDateString('zh-CN');
}
function formatDateTime(dateStr) {
    if (!dateStr) return '--';
    return String(dateStr);
}
function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function statusBadge(status) {
    const map = {
        '成功': 'bg-success', '启用': 'bg-success', '可用': 'bg-success', '完成': 'bg-success', 'completed': 'bg-success',
        '草稿': 'bg-secondary', '待处理': 'bg-secondary', 'pending': 'bg-secondary', '停用': 'bg-secondary',
        '运行中': 'bg-info text-dark', 'running': 'bg-info text-dark',
        '警告': 'bg-warning text-dark', '失败': 'bg-danger', 'failed': 'bg-danger', '冲突': 'bg-danger',
    };
    return `<span class="badge ${map[status] || 'bg-secondary'}">${escapeHtml(status)}</span>`;
}
function dayLabel(day) { return DAY_NAMES[day - 1] || '--'; }
function periodLabel(period) {
    const p = PERIODS.find(x => x.period === Number(period));
    return p ? p.label : '第' + period + '节';
}

// ---- CSV ----
function downloadCSV(filename, rows) {
    const content = rows.map(row => row.map(cell => {
        const s = String(cell == null ? '' : cell);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}
function parseCSV(text) {
    const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
    return lines.map(line => {
        const cells = [];
        let cur = '', quoted = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
                else quoted = !quoted;
            } else if (ch === ',' && !quoted) {
                cells.push(cur); cur = '';
            } else cur += ch;
        }
        cells.push(cur);
        return cells;
    });
}

function debounce(fn, wait) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait || 250);
    };
}

// ---- Nav / user ----
function setActiveNav(navId) {
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(navId);
    if (el) {
        el.classList.add('active');
        const dd = el.closest('.dropdown-menu');
        if (dd) {
            const toggle = dd.parentElement.querySelector('.dropdown-toggle');
            if (toggle) toggle.classList.add('active');
        }
    }
}
function renderUserInfo() {
    const user = getSession();
    if (!user) return;
    const el = document.getElementById('userDisplay');
    if (el) {
        el.innerHTML = `<span class="${ROLE_BADGES[user.role] || 'badge bg-secondary'} me-2">${ROLE_LABELS[user.role] || user.role}</span><strong>${escapeHtml(user.name || user.uid)}</strong>`;
    }
}
function setupLogout() {
    const btn = document.getElementById('btnLogout');
    if (btn) {
        btn.addEventListener('click', () => {
            clearSession();
            window.location.href = '../index.html';
        });
    }
}

