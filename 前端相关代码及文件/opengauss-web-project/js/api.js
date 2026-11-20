/* ============================================
   智能校园课程排课与调度系统 - API 封装
   后端：Python Flask + openGauss（默认 http://localhost:5000）
   演示：后端不可用时自动切换到 js/mock.js 的本地数据
   ============================================ */

const API_BASE = 'http://localhost:5000';
const USE_MOCK_WHEN_OFFLINE = true;

function qs(params) {
    if (!params) return '';
    const s = new URLSearchParams();
    Object.keys(params).forEach(k => {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '') s.append(k, params[k]);
    });
    const str = s.toString();
    return str ? '?' + str : '';
}

async function apiRequest(endpoint, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body || null;
    const onProgress = options.onProgress || null;
    const config = {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) config.body = JSON.stringify(body);

    try {
        const response = await fetch(API_BASE + endpoint, config);
        const text = await response.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { message: text }; }
        if (!response.ok) throw new Error(data.message || data.error || `请求失败(${response.status})`);
        return data;
    } catch (err) {
        const offline = err instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(err.message || '');
        if (offline && USE_MOCK_WHEN_OFFLINE && window.MockAPI) {
            await new Promise(resolve => setTimeout(resolve, 120));
            return window.MockAPI.handle(endpoint, method, body, onProgress);
        }
        if (offline) throw new Error('无法连接到服务器，请检查后端是否已启动');
        throw err;
    }
}

// ---- 登录认证 ----
function loginAPI(uid, password, role) {
    return apiRequest('/login', { method: 'POST', body: { uid, password, role } });
}
function logoutAPI() {
    return apiRequest('/logout', { method: 'POST' });
}

const SystemAPI = {
    getMeta() { return apiRequest('/api/meta'); },
};

// ---- 系统管理员 ----
const AdminAPI = {
    getDashboard() { return apiRequest('/api/admin/dashboard'); },
    getUsers(filters) { return apiRequest('/api/admin/users' + qs(filters)); },
    addUser(data) { return apiRequest('/api/admin/users', { method: 'POST', body: data }); },
    updateUser(id, data) { return apiRequest(`/api/admin/users/${id}`, { method: 'PUT', body: data }); },
    deleteUser(id) { return apiRequest(`/api/admin/users/${id}`, { method: 'DELETE' }); },
    getRoles() { return apiRequest('/api/admin/roles'); },
    getLogs(filters) { return apiRequest('/api/admin/logs' + qs(filters)); },
};

// ---- 教务员 ----
const SchedulerAPI = {
    getDashboard() { return apiRequest('/api/scheduler/dashboard'); },

    getCourses(filters) { return apiRequest('/api/courses' + qs(filters)); },
    addCourse(data) { return apiRequest('/api/courses', { method: 'POST', body: data }); },
    updateCourse(id, data) { return apiRequest(`/api/courses/${id}`, { method: 'PUT', body: data }); },
    deleteCourse(id) { return apiRequest(`/api/courses/${id}`, { method: 'DELETE' }); },

    getTeachers(filters) { return apiRequest('/api/teachers' + qs(filters)); },
    addTeacher(data) { return apiRequest('/api/teachers', { method: 'POST', body: data }); },
    updateTeacher(id, data) { return apiRequest(`/api/teachers/${id}`, { method: 'PUT', body: data }); },
    deleteTeacher(id) { return apiRequest(`/api/teachers/${id}`, { method: 'DELETE' }); },

    getClasses() { return apiRequest('/api/classes'); },
    addClass(data) { return apiRequest('/api/classes', { method: 'POST', body: data }); },
    updateClass(id, data) { return apiRequest(`/api/classes/${id}`, { method: 'PUT', body: data }); },
    deleteClass(id) { return apiRequest(`/api/classes/${id}`, { method: 'DELETE' }); },

    getClassrooms(filters) { return apiRequest('/api/classrooms' + qs(filters)); },
    addClassroom(data) { return apiRequest('/api/classrooms', { method: 'POST', body: data }); },
    updateClassroom(id, data) { return apiRequest(`/api/classrooms/${id}`, { method: 'PUT', body: data }); },
    deleteClassroom(id) { return apiRequest(`/api/classrooms/${id}`, { method: 'DELETE' }); },

    getTimeSlots() { return apiRequest('/api/time-slots'); },
    getPreferences(teacherId) { return apiRequest('/api/preferences' + qs({ teacher_id: teacherId })); },

    getTasks() { return apiRequest('/api/schedule-tasks'); },
    addTask(data) { return apiRequest('/api/schedule-tasks', { method: 'POST', body: data }); },
    runTask(id, params, onProgress) {
        return apiRequest(`/api/schedule-tasks/${id}/run`, { method: 'POST', body: params || {}, onProgress });
    },
    deleteTask(id) { return apiRequest(`/api/schedule-tasks/${id}`, { method: 'DELETE' }); },

    getPlans(filters) { return apiRequest('/api/plans' + qs(filters)); },
    getPlanItems(planId) { return apiRequest(`/api/plans/${planId}/items`); },
    getPlanConflicts(planId, filters) { return apiRequest(`/api/plans/${planId}/conflicts` + qs(filters)); },
    activatePlan(planId) { return apiRequest(`/api/plans/${planId}/activate`, { method: 'POST' }); },
    comparePlans(planId, otherId) { return apiRequest(`/api/plans/${planId}/compare` + qs({ other: otherId })); },

    updateItem(itemId, data) { return apiRequest(`/api/items/${itemId}`, { method: 'PUT', body: data }); },
    resolveConflict(conflictId) { return apiRequest(`/api/conflicts/${conflictId}/resolve`, { method: 'POST' }); },

    getReport(planId) { return apiRequest('/api/reports' + qs({ plan_id: planId })); },
};

// ---- 教师 ----
const TeacherAPI = {
    getDashboard(teacherId) { return apiRequest('/api/teacher/dashboard' + qs({ teacher_id: teacherId })); },
    getSchedule(teacherId, planId) { return apiRequest('/api/teacher/schedule' + qs({ teacher_id: teacherId, plan_id: planId })); },
    getPreferences(teacherId) { return apiRequest('/api/teacher/preferences' + qs({ teacher_id: teacherId })); },
    savePreferences(teacherId, preferences) {
        return apiRequest('/api/teacher/preferences', {
            method: 'PUT',
            body: { teacher_id: teacherId, preferences },
        });
    },
};

// ---- 学生 ----
const StudentAPI = {
    getDashboard(classId) { return apiRequest('/api/student/dashboard' + qs({ class_id: classId })); },
    getSchedule(classId, planId) { return apiRequest('/api/student/schedule' + qs({ class_id: classId, plan_id: planId })); },
};
