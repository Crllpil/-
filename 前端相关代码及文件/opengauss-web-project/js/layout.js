/* ============================================
   智能校园课程排课与调度系统 - 角色导航布局
   ============================================ */
(function (global) {
    'use strict';

    const MENUS = {
        admin: [
            { id: 'dashboard', text: '系统概览', icon: 'bi-speedometer2', href: 'dashboard.html' },
            { id: 'users', text: '用户与权限', icon: 'bi-people-fill', href: 'users.html' },
            { id: 'logs', text: '操作日志', icon: 'bi-journal-text', href: 'logs.html' },
        ],
        scheduler: [
            { id: 'dashboard', text: '排课概览', icon: 'bi-speedometer2', href: 'dashboard.html' },
            {
                text: '基础数据', icon: 'bi-database-fill', children: [
                    { id: 'courses', text: '课程管理', icon: 'bi-book-fill', href: 'courses.html' },
                    { id: 'teachers', text: '教师管理', icon: 'bi-person-workspace', href: 'teachers.html' },
                    { id: 'classrooms', text: '教室管理', icon: 'bi-door-open-fill', href: 'classrooms.html' },
                    { id: 'base', text: '班级与时间段', icon: 'bi-calendar3', href: 'base.html' },
                ],
            },
            {
                text: '排课管理', icon: 'bi-calendar2-week-fill', children: [
                    { id: 'tasks', text: '排课任务', icon: 'bi-list-check', href: 'tasks.html' },
                    { id: 'schedule', text: '课表展示', icon: 'bi-grid-3x3-gap-fill', href: 'schedule.html' },
                    { id: 'adjust', text: '人工调整', icon: 'bi-pencil-square', href: 'adjust.html' },
                    { id: 'conflicts', text: '冲突检测', icon: 'bi-exclamation-triangle-fill', href: 'conflicts.html' },
                    { id: 'plans', text: '方案版本', icon: 'bi-layers-fill', href: 'plans.html' },
                ],
            },
            { id: 'reports', text: '统计报表', icon: 'bi-bar-chart-fill', href: 'reports.html' },
        ],
        teacher: [
            { id: 'dashboard', text: '我的概览', icon: 'bi-speedometer2', href: 'dashboard.html' },
            { id: 'schedule', text: '我的课表', icon: 'bi-calendar2-week-fill', href: 'schedule.html' },
            { id: 'preferences', text: '时间偏好', icon: 'bi-sliders', href: 'preferences.html' },
        ],
        student: [
            { id: 'dashboard', text: '我的概览', icon: 'bi-speedometer2', href: 'dashboard.html' },
            { id: 'timetable', text: '班级课表', icon: 'bi-calendar2-week-fill', href: 'timetable.html' },
        ],
    };

    function itemHtml(item) {
        return `<li class="nav-item"><a class="nav-link" id="nav-${item.id}" href="${item.href}">
            <i class="bi ${item.icon} me-1"></i>${item.text}</a></li>`;
    }

    function menuHtml(menu) {
        return menu.map(item => {
            if (!item.children) return itemHtml(item);
            const children = item.children.map(child =>
                `<li><a class="dropdown-item" id="nav-${child.id}" href="${child.href}">
                    <i class="bi ${child.icon} me-2"></i>${child.text}</a></li>`
            ).join('');
            return `<li class="nav-item dropdown">
                <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                    <i class="bi ${item.icon} me-1"></i>${item.text}
                </a>
                <ul class="dropdown-menu dropdown-menu-dark">${children}</ul>
            </li>`;
        }).join('');
    }

    function renderLayout(role, active) {
        const user = requireRole(role);
        if (!user) return null;
        const host = document.getElementById('appNav');
        if (!host) return user;
        host.innerHTML = `
            <nav class="navbar navbar-expand-lg navbar-custom sticky-top">
                <div class="container-fluid">
                    <a class="navbar-brand" href="dashboard.html">
                        <i class="bi bi-calendar2-week-fill"></i>智能校园排课与调度系统
                    </a>
                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                        <span class="navbar-toggler-icon"></span>
                    </button>
                    <div class="collapse navbar-collapse" id="navbarNav">
                        <ul class="navbar-nav me-auto">${menuHtml(MENUS[role] || [])}</ul>
                        <div class="d-flex align-items-center gap-3">
                            <span id="userDisplay" class="user-badge"></span>
                            <button class="btn-logout" id="btnLogout">
                                <i class="bi bi-box-arrow-right me-1"></i>退出
                            </button>
                        </div>
                    </div>
                </div>
            </nav>`;
        if (active) setActiveNav('nav-' + active);
        renderUserInfo();
        setupLogout();
        return user;
    }

    global.renderLayout = renderLayout;
})(window);
