/* ============================================
   学生选课管理系统 - 通用工具函数
   ============================================ */

// ---- Session 管理 ----
function getSession() {
    const s = sessionStorage.getItem('user');
    return s ? JSON.parse(s) : null;
}
function setSession(user) {
    sessionStorage.setItem('user', JSON.stringify(user));
}
function clearSession() {
    sessionStorage.clear();
}
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
    if (!user || user.role !== role) {
        showToast('无权访问此页面', 'danger');
        setTimeout(() => window.location.href = '../index.html', 1500);
        return null;
    }
    return user;
}

// ---- Toast 提示 ----
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        // Create container if not exists
        const div = document.createElement('div');
        div.id = 'toastContainer';
        div.className = 'toast-container';
        document.body.appendChild(div);
    }
    const tc = document.getElementById('toastContainer');
    const id = 'toast_' + Date.now();
    const bgMap = {
        success: 'bg-success',
        danger: 'bg-danger',
        warning: 'bg-warning text-dark',
        info: 'bg-info text-dark',
    };
    const iconMap = {
        success: 'bi-check-circle-fill',
        danger: 'bi-x-circle-fill',
        warning: 'bi-exclamation-triangle-fill',
        info: 'bi-info-circle-fill',
    };
    const html = `
        <div id="${id}" class="toast align-items-center text-white ${bgMap[type] || 'bg-info'} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">
                    <i class="bi ${iconMap[type] || 'bi-info-circle-fill'} me-2"></i>${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>`;
    tc.insertAdjacentHTML('beforeend', html);
    const toastEl = document.getElementById(id);
    const toast = new bootstrap.Toast(toastEl, { delay: 3500 });
    toast.show();
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

// ---- 加载状态 ----
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

// ---- 确认对话框 ----
async function confirmAction(title, message) {
    const result = await Swal ? Swal.fire({
        title: title,
        text: message,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '确 定',
        cancelButtonText: '取 消',
        confirmButtonColor: '#E74C3C',
        cancelButtonColor: '#7F8C8D',
    }) : confirm(message);
    return Swal ? result.isConfirmed : result;
}

// ---- 格式化 ----
function formatDate(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
function formatDateTime(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return d.toLocaleString('zh-CN');
}

// ---- 获取选课状态标签 ----
function getCapacityBadge(remaining, enrolled, capacity) {
    if (remaining <= 0) {
        return '<span class="badge badge-full">已满</span>';
    } else if (enrolled >= capacity * 0.8) {
        return '<span class="badge badge-tight">紧张</span>';
    } else {
        return '<span class="badge badge-available">有余</span>';
    }
}

// ---- 获取成绩状态 ----
function getGradeBadge(grade) {
    if (grade === null || grade === undefined || grade === '') {
        return '<span class="badge badge-nograde">未录入</span>';
    } else if (parseFloat(grade) >= 60) {
        return '<span class="badge badge-pass">及格</span>';
    } else {
        return '<span class="badge badge-fail">不及格</span>';
    }
}

// ---- 计算绩点 ----
function calcGradePoint(grade) {
    if (!grade || grade < 60) return 0;
    return ((grade - 50) / 10).toFixed(1);
}

// ---- 设置导航激活状态 ----
function setActiveNav(navId) {
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(navId);
    if (el) el.classList.add('active');
}

// ---- 显示当前用户信息 ----
function renderUserInfo() {
    const user = getSession();
    if (!user) return;
    const roleMap = { student: '学生', teacher: '教师', admin: '管理员' };
    const roleBadgeMap = { student: 'badge bg-primary', teacher: 'badge bg-success', admin: 'badge bg-danger' };
    const el = document.getElementById('userDisplay');
    if (el) {
        el.innerHTML = `
            <span class="${roleBadgeMap[user.role]} me-2">${roleMap[user.role]}</span>
            <strong>${user.name || user.uid}</strong>`;
    }
}

// ---- 退出 ----
function setupLogout() {
    const btn = document.getElementById('btnLogout');
    if (btn) {
        btn.addEventListener('click', () => {
            clearSession();
            window.location.href = '../index.html';
        });
    }
}

// ---- 页面初始化 ----
document.addEventListener('DOMContentLoaded', () => {
    renderUserInfo();
    setupLogout();
});
