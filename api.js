/* ============================================
   学生选课管理系统 - API 配置与请求封装
   后端: Python Flask (默认 http://localhost:5000)
   部署: WSL2 + openEuler + openGauss
   注: WSL2 会自动转发 localhost，浏览器可直接访问
   ============================================ */

const API_BASE = 'http://localhost:5000';

// ---- 通用请求函数 ----
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    };
    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }
    try {
        const response = await fetch(url, config);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || data.error || `请求失败(${response.status})`);
        }
        return data;
    } catch (err) {
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            throw new Error('无法连接到服务器，请检查网络或后端是否已启动');
        }
        throw err;
    }
}

// ---- 登录认证 ----
async function loginAPI(uid, password, role) {
    return apiRequest('/login', {
        method: 'POST',
        body: { uid, password, role },
    });
}

async function logoutAPI() {
    return apiRequest('/logout', { method: 'POST' });
}

// ---- 学生接口 ----
const StudentAPI = {
    // 获取可选课程列表（含余量信息）
    getCourses(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        return apiRequest(`/api/courses?${params}`);
    },

    // 选课
    enroll(courseId) {
        return apiRequest('/api/enroll', {
            method: 'POST',
            body: { course_id: courseId },
        });
    },

    // 退课
    drop(courseId) {
        return apiRequest('/api/drop', {
            method: 'POST',
            body: { course_id: courseId },
        });
    },

    // 获取我的课表
    getMySchedule() {
        return apiRequest('/api/student/schedule');
    },

    // 获取我的成绩单
    getMyGrades() {
        return apiRequest('/api/student/grades');
    },

    // 获取GPA
    getMyGPA() {
        return apiRequest('/api/student/gpa');
    },
};

// ---- 教师接口 ----
const TeacherAPI = {
    // 获取我的授课列表
    getMyCourses() {
        return apiRequest('/api/teacher/courses');
    },

    // 获取某门课的学生名单
    getStudentRoster(courseId) {
        return apiRequest(`/api/teacher/roster/${courseId}`);
    },

    // 录入/更新成绩
    updateGrade(enrollId, grade) {
        return apiRequest('/api/teacher/grade', {
            method: 'PUT',
            body: { enroll_id: enrollId, grade },
        });
    },

    // 获取工作量统计
    getWorkload() {
        return apiRequest('/api/teacher/workload');
    },
};

// ---- 管理员接口 ----
const AdminAPI = {
    // 学生管理
    getStudents() { return apiRequest('/api/admin/students'); },
    addStudent(data) { return apiRequest('/api/admin/students', { method: 'POST', body: data }); },
    updateStudent(id, data) { return apiRequest(`/api/admin/students/${id}`, { method: 'PUT', body: data }); },
    deleteStudent(id) { return apiRequest(`/api/admin/students/${id}`, { method: 'DELETE' }); },

    // 教师管理
    getTeachers() { return apiRequest('/api/admin/teachers'); },
    addTeacher(data) { return apiRequest('/api/admin/teachers', { method: 'POST', body: data }); },
    updateTeacher(id, data) { return apiRequest(`/api/admin/teachers/${id}`, { method: 'PUT', body: data }); },
    deleteTeacher(id) { return apiRequest(`/api/admin/teachers/${id}`, { method: 'DELETE' }); },

    // 课程管理
    getCourses() { return apiRequest('/api/admin/courses'); },
    addCourse(data) { return apiRequest('/api/admin/courses', { method: 'POST', body: data }); },
    updateCourse(id, data) { return apiRequest(`/api/admin/courses/${id}`, { method: 'PUT', body: data }); },
    deleteCourse(id) { return apiRequest(`/api/admin/courses/${id}`, { method: 'DELETE' }); },

    // 学院统计
    getCollegeStats() { return apiRequest('/api/admin/stats/college'); },

    // 系统概览
    getDashboard() { return apiRequest('/api/admin/dashboard'); },
};
