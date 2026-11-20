/* ============================================
   智能校园课程排课与调度系统 - 演示数据与本地 API
   说明：当 Flask/openGauss 后端不可用时，前端自动切换到本文件，
        使用 localStorage 持久化演示数据，保证页面可独立运行。
   ============================================ */
(function (global) {
    'use strict';

    const DB_KEY = 'ccs_schedule_demo_db_v1';
    let memoryDB = null;
    let initPromise = null;

    function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
    function uid(prefix) { return prefix + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 90 + 10); }
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function nowString() {
        const d = new Date();
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    function ok(data, message) { return { code: 0, message: message || 'ok', data }; }
    function fail(message, status) { const e = new Error(message); e.status = status || 400; throw e; }

    function loadDB() {
        try {
            const raw = localStorage.getItem(DB_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) { /* ignore */ }
        return memoryDB;
    }
    function saveDB(db) {
        memoryDB = db;
        try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
    }

    function buildTimeSlots() {
        const days = ['周一', '周二', '周三', '周四', '周五'];
        const periods = [
            { period: 1, start_time: '08:00', end_time: '09:40', label: '第1-2节' },
            { period: 2, start_time: '10:00', end_time: '11:40', label: '第3-4节' },
            { period: 3, start_time: '14:00', end_time: '15:40', label: '第5-6节' },
            { period: 4, start_time: '16:00', end_time: '17:40', label: '第7-8节' },
            { period: 5, start_time: '19:00', end_time: '20:40', label: '第9-10节' },
        ];
        const slots = [];
        for (let d = 1; d <= 5; d++) {
            periods.forEach(p => {
                slots.push({
                    slot_id: 'S' + d + p.period,
                    day: d,
                    day_name: days[d - 1],
                    period: p.period,
                    start_time: p.start_time,
                    end_time: p.end_time,
                    label: days[d - 1] + p.label,
                });
            });
        }
        return slots;
    }

    function seedData() {
        const teachers = [
            { teacher_id: 'T001', teacher_no: 'T001', name: '王建国', title: '教授', department: '计算机学院', phone: '13800000001', max_weekly_hours: 12 },
            { teacher_id: 'T002', teacher_no: 'T002', name: '李慧', title: '副教授', department: '计算机学院', phone: '13800000002', max_weekly_hours: 12 },
            { teacher_id: 'T003', teacher_no: 'T003', name: '赵强', title: '讲师', department: '软件学院', phone: '13800000003', max_weekly_hours: 10 },
            { teacher_id: 'T004', teacher_no: 'T004', name: '陈静', title: '副教授', department: '计算机学院', phone: '13800000004', max_weekly_hours: 12 },
            { teacher_id: 'T005', teacher_no: 'T005', name: '刘洋', title: '讲师', department: '软件学院', phone: '13800000005', max_weekly_hours: 10 },
            { teacher_id: 'T006', teacher_no: 'T006', name: '孙梅', title: '教授', department: '人工智能学院', phone: '13800000006', max_weekly_hours: 10 },
            { teacher_id: 'T007', teacher_no: 'T007', name: '周敏', title: '副教授', department: '外国语学院', phone: '13800000007', max_weekly_hours: 12 },
            { teacher_id: 'T008', teacher_no: 'T008', name: '吴刚', title: '教授', department: '数学学院', phone: '13800000008', max_weekly_hours: 12 },
            { teacher_id: 'T009', teacher_no: 'T009', name: '郑凯', title: '讲师', department: '体育学院', phone: '13800000009', max_weekly_hours: 8 },
        ];
        const classes = [
            { class_id: 'CS2301', class_no: 'CS2301', name: '计算机2301班', grade: '2023', major: '计算机科学与技术', student_count: 42 },
            { class_id: 'CS2302', class_no: 'CS2302', name: '计算机2302班', grade: '2023', major: '计算机科学与技术', student_count: 40 },
            { class_id: 'SE2301', class_no: 'SE2301', name: '软件2301班', grade: '2023', major: '软件工程', student_count: 38 },
            { class_id: 'AI2301', class_no: 'AI2301', name: '人工智能2301班', grade: '2023', major: '人工智能', student_count: 36 },
        ];
        const courses = [
            { course_id: 'C001', course_no: 'CS101', course_name: '数据结构', course_type: '专业必修', credit: 4, total_hours: 64, weekly_hours: 4, teacher_id: 'T001', class_id: 'CS2301', room_type: '多媒体', student_count: 42 },
            { course_id: 'C002', course_no: 'CS201', course_name: '操作系统', course_type: '专业必修', credit: 3, total_hours: 48, weekly_hours: 3, teacher_id: 'T002', class_id: 'CS2301', room_type: '多媒体', student_count: 42 },
            { course_id: 'C003', course_no: 'CS202', course_name: '数据库系统', course_type: '专业必修', credit: 4, total_hours: 64, weekly_hours: 4, teacher_id: 'T003', class_id: 'CS2302', room_type: '机房', student_count: 40 },
            { course_id: 'C004', course_no: 'CS203', course_name: '计算机网络', course_type: '专业必修', credit: 3, total_hours: 48, weekly_hours: 3, teacher_id: 'T004', class_id: 'CS2302', room_type: '多媒体', student_count: 40 },
            { course_id: 'C005', course_no: 'SE301', course_name: '软件工程', course_type: '专业必修', credit: 4, total_hours: 64, weekly_hours: 4, teacher_id: 'T005', class_id: 'SE2301', room_type: '多媒体', student_count: 38 },
            { course_id: 'C006', course_no: 'AI101', course_name: '人工智能导论', course_type: '专业必修', credit: 3, total_hours: 48, weekly_hours: 3, teacher_id: 'T006', class_id: 'AI2301', room_type: '多媒体', student_count: 36 },
            { course_id: 'C007', course_no: 'GE101', course_name: '大学英语', course_type: '公共必修', credit: 2, total_hours: 32, weekly_hours: 2, teacher_id: 'T007', class_id: 'CS2301', room_type: '普通', student_count: 42 },
            { course_id: 'C008', course_no: 'MA101', course_name: '高等数学', course_type: '公共必修', credit: 4, total_hours: 64, weekly_hours: 4, teacher_id: 'T008', class_id: 'CS2302', room_type: '多媒体', student_count: 40 },
            { course_id: 'C009', course_no: 'PE101', course_name: '体育', course_type: '公共必修', credit: 2, total_hours: 32, weekly_hours: 2, teacher_id: 'T009', class_id: 'SE2301', room_type: '体育场', student_count: 38 },
            { course_id: 'C010', course_no: 'CS301', course_name: '编译原理', course_type: '专业选修', credit: 3, total_hours: 48, weekly_hours: 3, teacher_id: 'T002', class_id: 'AI2301', room_type: '机房', student_count: 36 },
            { course_id: 'C011', course_no: 'SE302', course_name: '软件测试', course_type: '专业选修', credit: 2, total_hours: 32, weekly_hours: 2, teacher_id: 'T003', class_id: 'SE2301', room_type: '实验室', student_count: 38 },
            { course_id: 'C012', course_no: 'MA201', course_name: '概率论', course_type: '公共必修', credit: 3, total_hours: 48, weekly_hours: 3, teacher_id: 'T008', class_id: 'AI2301', room_type: '多媒体', student_count: 36 },
        ];
        const classrooms = [
            { room_id: 'R101', room_no: 'A101', name: '教学楼A101', building: '教学楼A', floor: 1, room_type: '多媒体', capacity: 60, status: '可用' },
            { room_id: 'R102', room_no: 'A102', name: '教学楼A102', building: '教学楼A', floor: 1, room_type: '多媒体', capacity: 60, status: '可用' },
            { room_id: 'R201', room_no: 'B201', name: '实验楼B201', building: '实验楼B', floor: 2, room_type: '机房', capacity: 50, status: '可用' },
            { room_id: 'R202', room_no: 'B202', name: '实验楼B202', building: '实验楼B', floor: 2, room_type: '实验室', capacity: 40, status: '可用' },
            { room_id: 'R203', room_no: 'B203', name: '实验楼B203', building: '实验楼B', floor: 2, room_type: '机房', capacity: 45, status: '可用' },
            { room_id: 'R301', room_no: 'C301', name: '教学楼C301', building: '教学楼C', floor: 3, room_type: '普通', capacity: 120, status: '可用' },
            { room_id: 'R302', room_no: '操场', name: '东区体育场', building: '体育中心', floor: 1, room_type: '体育场', capacity: 200, status: '可用' },
        ];
        const time_slots = buildTimeSlots();
        const preferenceSpec = [
            ['T001', 'S11', 'avoid'], ['T001', 'S12', 'avoid'], ['T001', 'S31', 'prefer'], ['T001', 'S32', 'prefer'],
            ['T002', 'S55', 'forbid'], ['T002', 'S41', 'avoid'], ['T002', 'S21', 'prefer'],
            ['T003', 'S21', 'avoid'], ['T003', 'S11', 'prefer'],
            ['T004', 'S15', 'forbid'], ['T004', 'S51', 'avoid'],
            ['T005', 'S31', 'avoid'], ['T005', 'S41', 'prefer'],
            ['T006', 'S31', 'prefer'], ['T006', 'S55', 'avoid'],
            ['T007', 'S11', 'avoid'], ['T007', 'S21', 'prefer'],
            ['T008', 'S12', 'forbid'], ['T008', 'S51', 'avoid'],
            ['T009', 'S31', 'prefer'], ['T009', 'S11', 'avoid'],
        ];
        const teacher_preferences = preferenceSpec.map((x, i) => ({
            pref_id: 'P' + pad(i + 1),
            teacher_id: x[0], slot_id: x[1], level: x[2],
        }));
        const roles = [
            { role_id: 'admin', role_name: '系统管理员', description: '用户、角色、权限与系统日志管理' },
            { role_id: 'scheduler', role_name: '教务员', description: '基础数据、排课任务、方案与报表管理' },
            { role_id: 'teacher', role_name: '教师', description: '查看个人课表、维护时间偏好' },
            { role_id: 'student', role_name: '学生', description: '查看班级课表与教室信息' },
        ];
        const users = [
            { user_id: 'U001', username: 'admin_01', name: '系统管理员', role: 'admin', status: 1, phone: '13900000001', last_login: '2026-11-12 08:30', created_at: '2026-09-01 09:00' },
            { user_id: 'U002', username: 'jw_01', name: '张教务', role: 'scheduler', status: 1, phone: '13900000002', last_login: '2026-11-12 08:50', created_at: '2026-09-01 09:10' },
            { user_id: 'U003', username: 'T001', name: '王建国', role: 'teacher', teacher_id: 'T001', status: 1, phone: '13800000001', last_login: '2026-11-11 14:20', created_at: '2026-09-01 09:20' },
            { user_id: 'U004', username: 'T002', name: '李慧', role: 'teacher', teacher_id: 'T002', status: 1, phone: '13800000002', last_login: '2026-11-10 16:00', created_at: '2026-09-01 09:21' },
            { user_id: 'U005', username: 'S001', name: '陈晓', role: 'student', class_id: 'CS2301', status: 1, phone: '13700000001', last_login: '2026-11-12 09:00', created_at: '2026-09-01 10:00' },
            { user_id: 'U006', username: 'S002', name: '林悦', role: 'student', class_id: 'CS2302', status: 1, phone: '13700000002', last_login: '2026-11-11 19:30', created_at: '2026-09-01 10:05' },
        ];
        const schedule_tasks = [
            {
                task_id: 'ST2026111001', task_name: '2026-2027学年第一学期排课',
                semester: '2026-2027-1', algorithm: 'GA', status: 'completed',
                creator: '张教务', created_at: '2026-11-10 09:30',
                params: { populationSize: 20, generations: 50, timeLimit: 600, weights: { preference: 0.3, distribution: 0.2, utilization: 0.15, gap: 0.2, consecutive: 0.15 } },
            },
        ];
        const operation_logs = [
            { log_id: 'L001', op_time: '2026-11-10 09:12', op_user: 'admin_01', action: '登录系统', target: '系统', detail: '系统管理员登录后台' },
            { log_id: 'L002', op_time: '2026-11-10 09:30', op_user: 'jw_01', action: '创建排课任务', target: '2026-2027学年第一学期排课', detail: '配置算法：遗传算法' },
            { log_id: 'L003', op_time: '2026-11-10 09:45', op_user: 'jw_01', action: '运行自动排课', target: '2026-2027学年第一学期排课', detail: '生成排课方案 V1' },
            { log_id: 'L004', op_time: '2026-11-10 10:05', op_user: 'jw_01', action: '启用排课方案', target: '排课方案 V1', detail: '启用当前学期课表' },
            { log_id: 'L005', op_time: '2026-11-11 14:20', op_user: 'T001', action: '维护时间偏好', target: '教师 王建国', detail: '设置回避与偏好时段' },
            { log_id: 'L006', op_time: '2026-11-12 08:30', op_user: 'admin_01', action: '新增用户', target: 'S002', detail: '新增学生账号' },
        ];
        return {
            meta: { version: 1, seeded_at: nowString() },
            roles, users, teachers, classes, courses, classrooms, time_slots, teacher_preferences,
            schedule_tasks, schedule_plans: [], schedule_items: [], schedule_conflicts: [],
            operation_logs,
        };
    }

    function currentUser() {
        try {
            const s = sessionStorage.getItem('user');
            return s ? JSON.parse(s) : null;
        } catch (e) { return null; }
    }

    function addLog(db, action, target, detail) {
        const u = currentUser();
        db.operation_logs.unshift({
            log_id: uid('L'),
            op_time: nowString(),
            op_user: u ? u.uid : 'system',
            action, target: target || '', detail: detail || '',
        });
        db.operation_logs = db.operation_logs.slice(0, 200);
    }

    function teacherMap(db) { const m = {}; db.teachers.forEach(t => { m[t.teacher_id] = t; }); return m; }
    function classMap(db) { const m = {}; db.classes.forEach(c => { m[c.class_id] = c; }); return m; }
    function roomMap(db) { const m = {}; db.classrooms.forEach(r => { m[r.room_id] = r; }); return m; }
    function slotMap(db) { const m = {}; db.time_slots.forEach(s => { m[s.slot_id] = s; }); return m; }

    function activePlan(db) {
        return db.schedule_plans.find(p => p.is_active === 1) || null;
    }
    function planItems(db, planId) {
        return db.schedule_items.filter(i => i.plan_id === planId)
            .sort((a, b) => a.day - b.day || a.period - b.period || a.class_id.localeCompare(b.class_id));
    }
    function planConflicts(db, planId) {
        return db.schedule_conflicts.filter(c => c.plan_id === planId);
    }

    function createPlan(db, task, result, active) {
        const planId = uid('PLAN');
        const version = Math.max(0, ...db.schedule_plans.filter(p => p.task_id === task.task_id).map(p => p.version)) + 1;
        const items = result.items.map((it, idx) => Object.assign({}, it, {
            item_id: planId + '-I' + pad(idx + 1),
            plan_id: planId,
        }));
        const plan = {
            plan_id: planId,
            task_id: task.task_id,
            task_name: task.task_name,
            version,
            gen_method: (task.algorithm || 'GA') === 'GA' ? '自动排课（GA）' : '自动排课（' + task.algorithm + '）',
            fitness: result.stats.fitness,
            conflict_count: result.conflicts.length,
            hard_conflicts: result.stats.hard,
            soft_violations: result.stats.sessions ? result.stats.soft : 0,
            is_active: active ? 1 : 0,
            created_at: nowString(),
            stats: result.stats,
            params: clone(task.params || {}),
        };
        if (active) db.schedule_plans.forEach(p => { p.is_active = 0; });
        db.schedule_plans.push(plan);
        db.schedule_items.push(...items);
        result.conflicts.forEach((c, idx) => {
            db.schedule_conflicts.push(Object.assign({}, c, {
                conflict_id: planId + '-C' + pad(idx + 1),
                plan_id: planId,
                created_at: nowString(),
            }));
        });
        return plan;
    }

    async function ensureInit() {
        if (initPromise) return initPromise;
        initPromise = (async () => {
            let db = loadDB();
            if (!db) {
                db = seedData();
                saveDB(db);
            }
            if (!db.schedule_plans.length && global.CampusScheduler) {
                const task = db.schedule_tasks[0];
                const result = await global.CampusScheduler.run(db, Object.assign({ seed: 2026, timeLimit: 30 }, task.params));
                createPlan(db, task, result, true);
                saveDB(db);
            }
            return db;
        })();
        return initPromise;
    }

    function itemView(db, item, conflicts) {
        const t = teacherMap(db)[item.teacher_id];
        const c = classMap(db)[item.class_id];
        const r = roomMap(db)[item.room_id];
        const s = slotMap(db)[item.slot_id];
        const itemConflicts = conflicts.filter(x => x.entity_id === item.item_id);
        return Object.assign({}, item, {
            teacher_name: t ? t.name : item.teacher_id,
            class_name: c ? c.name : item.class_id,
            room_name: r ? r.name : item.room_id,
            day_name: s ? s.day_name : '',
            period_label: s ? s.label : '',
            has_hard_conflict: itemConflicts.some(x => x.severity === 'hard'),
            has_soft_conflict: itemConflicts.some(x => x.severity === 'soft'),
            conflicts: itemConflicts,
        });
    }

    function scanConflicts(db, planId) {
        const items = planItems(db, planId);
        const conflicts = [];
        const seen = new Set();
        const teacherSlot = new Map(), classSlot = new Map(), roomSlot = new Map();
        const tMap = teacherMap(db), cMap = classMap(db), rMap = roomMap(db), sMap = slotMap(db);
        const prefs = {};
        db.teacher_preferences.forEach(p => {
            if (!prefs[p.teacher_id]) prefs[p.teacher_id] = {};
            prefs[p.teacher_id][p.slot_id] = p.level;
        });
        function push(type, item, desc, severity) {
            const key = type + '|' + item.item_id;
            if (seen.has(key)) return;
            seen.add(key);
            conflicts.push({
                conflict_id: uid('CF'), plan_id: planId, conflict_type: type,
                entity_id: item.item_id, description: desc,
                severity: severity || 'hard', status: 'open', created_at: nowString(),
            });
        }
        items.forEach(it => {
            const t = tMap[it.teacher_id], c = cMap[it.class_id], r = rMap[it.room_id], s = sMap[it.slot_id];
            const slotLabel = s ? s.label : it.slot_id;
            const tk = it.teacher_id + '|' + it.slot_id;
            const ck = it.class_id + '|' + it.slot_id;
            const rk = it.room_id + '|' + it.slot_id;
            if (teacherSlot.has(tk)) push('教师冲突', it, `教师 ${t ? t.name : it.teacher_id} 在 ${slotLabel} 被安排多门课程`, 'hard');
            else teacherSlot.set(tk, it.item_id);
            if (classSlot.has(ck)) push('班级冲突', it, `班级 ${c ? c.name : it.class_id} 在 ${slotLabel} 同时安排多门课程`, 'hard');
            else classSlot.set(ck, it.item_id);
            if (roomSlot.has(rk)) push('教室冲突', it, `教室 ${r ? r.name : it.room_id} 在 ${slotLabel} 被多个教学任务占用`, 'hard');
            else roomSlot.set(rk, it.item_id);
            if (r && Number(r.capacity) < Number(it.student_count || 0)) push('教室容量不足', it, `${it.course_name} 修读人数 ${it.student_count} 超过 ${r.name} 容量 ${r.capacity}`, 'hard');
            if (r && it.room_type && it.room_type !== '不限' && r.room_type !== it.room_type) push('教室类型不匹配', it, `${it.course_name} 需要 ${it.room_type}，${r.name} 为 ${r.room_type}`, 'hard');
            if (prefs[it.teacher_id] && prefs[it.teacher_id][it.slot_id] === 'forbid') push('教师禁止时段', it, `教师 ${t ? t.name : it.teacher_id} 的禁止时段 ${slotLabel} 被安排课程`, 'hard');
            if (prefs[it.teacher_id] && prefs[it.teacher_id][it.slot_id] === 'avoid') push('教师时间偏好', it, `教师 ${t ? t.name : it.teacher_id} 的回避时段 ${slotLabel} 被安排 ${it.course_name}`, 'soft');
        });
        return conflicts;
    }

    function refreshPlanStats(db, planId) {
        const plan = db.schedule_plans.find(p => p.plan_id === planId);
        if (!plan) return;
        db.schedule_conflicts = db.schedule_conflicts.filter(c => c.plan_id !== planId);
        const cs = scanConflicts(db, planId);
        db.schedule_conflicts.push(...cs);
        plan.conflict_count = cs.length;
        plan.hard_conflicts = cs.filter(c => c.severity === 'hard').length;
        plan.soft_violations = cs.filter(c => c.severity === 'soft').length;
    }

    function computeStats(db, planId) {
        const items = planItems(db, planId);
        const rooms = db.classrooms.filter(r => r.status !== '停用');
        const totalRoomSlots = rooms.length * db.time_slots.length;
        const tMap = teacherMap(db), cMap = classMap(db), rMap = roomMap(db);
        const teacherHours = {}, classHours = {}, roomUse = {}, courseSet = new Set();
        items.forEach(it => {
            teacherHours[it.teacher_id] = (teacherHours[it.teacher_id] || 0) + 1;
            classHours[it.class_id] = (classHours[it.class_id] || 0) + 1;
            roomUse[it.room_id] = (roomUse[it.room_id] || 0) + 1;
            courseSet.add(it.course_id);
        });
        const conflicts = planConflicts(db, planId);
        const conflictByType = {};
        conflicts.forEach(c => { conflictByType[c.conflict_type] = (conflictByType[c.conflict_type] || 0) + 1; });
        return {
            items: items.length,
            courses: courseSet.size,
            total_courses: db.courses.length,
            utilization: totalRoomSlots ? Number((items.length / totalRoomSlots * 100).toFixed(1)) : 0,
            room_total: totalRoomSlots,
            hard_conflicts: conflicts.filter(c => c.severity === 'hard').length,
            soft_conflicts: conflicts.filter(c => c.severity === 'soft').length,
            teacher_hours: Object.keys(teacherHours).map(id => ({
                teacher_id: id,
                name: tMap[id] ? tMap[id].name : id,
                hours: teacherHours[id],
                max: tMap[id] ? tMap[id].max_weekly_hours : null,
            })).sort((a, b) => b.hours - a.hours),
            class_hours: Object.keys(classHours).map(id => ({
                class_id: id, name: cMap[id] ? cMap[id].name : id, hours: classHours[id],
            })).sort((a, b) => b.hours - a.hours),
            rooms: rooms.map(r => ({
                room_id: r.room_id, name: r.name, room_type: r.room_type, capacity: r.capacity,
                used: roomUse[r.room_id] || 0, total: db.time_slots.length,
                rate: Number(((roomUse[r.room_id] || 0) / db.time_slots.length * 100).toFixed(1)),
            })).sort((a, b) => b.rate - a.rate),
            conflict_by_type: Object.keys(conflictByType).map(k => ({ type: k, count: conflictByType[k] })),
            courses_detail: db.courses.map(c => ({
                course_id: c.course_id, course_name: c.course_name,
                class_id: c.class_id, class_name: cMap[c.class_id] ? cMap[c.class_id].name : c.class_id,
                teacher_id: c.teacher_id, teacher_name: tMap[c.teacher_id] ? tMap[c.teacher_id].name : c.teacher_id,
                weekly_hours: c.weekly_hours,
            })),
        };
    }

    function planSummary(db, plan) {
        if (!plan) return null;
        const t = db.schedule_tasks.find(x => x.task_id === plan.task_id);
        return Object.assign({}, plan, {
            task_name: t ? t.task_name : plan.task_name,
            item_count: db.schedule_items.filter(i => i.plan_id === plan.plan_id).length,
        });
    }

    function parseQuery(query) {
        const p = new URLSearchParams(query || '');
        const obj = {};
        p.forEach((v, k) => { obj[k] = v; });
        return obj;
    }

    function findById(list, key, id) { return list.find(x => x[key] === id); }

    // ---------------- main router ----------------
    async function handle(endpoint, method, body, onProgress) {
        const db = await ensureInit();
        method = (method || 'GET').toUpperCase();
        body = body || {};
        const [path, query] = endpoint.split('?');
        const q = parseQuery(query);
        const seg = path.split('/').filter(Boolean);

        // ---- auth ----
        if (path === '/login' && method === 'POST') {
            const user = db.users.find(u => u.username === body.uid && u.role === body.role);
            if (!user) fail('账号或角色不匹配');
            if (user.status !== 1) fail('账号已停用，请联系管理员');
            if (body.password !== '123456') fail('密码错误');
            user.last_login = nowString();
            db.operation_logs.unshift({
                log_id: uid('L'), op_time: nowString(), op_user: user.username,
                action: '登录系统', target: '系统', detail: `${user.name} 登录系统`,
            });
            db.operation_logs = db.operation_logs.slice(0, 200);
            saveDB(db);
            return ok({
                user_id: user.user_id, uid: user.username, name: user.name, role: user.role,
                teacher_id: user.teacher_id || null, class_id: user.class_id || null,
                token: 'demo-token-' + user.user_id,
            }, '登录成功');
        }
        if (path === '/logout') {
            return ok(null, '已退出');
        }

        // ---- common ----
        if (path === '/api/meta') {
            const plan = activePlan(db);
            return ok({
                counts: {
                    courses: db.courses.length, teachers: db.teachers.length,
                    classes: db.classes.length, classrooms: db.classrooms.length,
                    users: db.users.length,
                },
                active_plan: planSummary(db, plan),
            });
        }

        // ---- admin ----
        if (path === '/api/admin/dashboard') {
            const plan = activePlan(db);
            const stats = plan ? computeStats(db, plan.plan_id) : null;
            const roleCount = {};
            db.users.forEach(u => { roleCount[u.role] = (roleCount[u.role] || 0) + 1; });
            return ok({
                total_users: db.users.length,
                total_teachers: db.teachers.length,
                total_courses: db.courses.length,
                total_classes: db.classes.length,
                total_rooms: db.classrooms.length,
                active_plan: planSummary(db, plan),
                conflicts: stats ? { hard: stats.hard_conflicts, soft: stats.soft_conflicts } : { hard: 0, soft: 0 },
                role_stats: roleCount,
                recent_logs: db.operation_logs.slice(0, 8),
            });
        }
        if (path === '/api/admin/users') {
            if (method === 'GET') return ok(db.users.slice());
            if (method === 'POST') {
                if (!body.username || !body.name || !body.role) fail('请填写用户名、姓名和角色');
                if (db.users.some(u => u.username === body.username)) fail('用户名已存在');
                const u = Object.assign({
                    user_id: uid('U'), status: 1, created_at: nowString(), last_login: '',
                }, body);
                db.users.push(u);
                addLog(db, '新增用户', u.username, `角色：${u.role}`);
                saveDB(db);
                return ok(u, '新增成功');
            }
        }
        if (seg[0] === 'api' && seg[1] === 'admin' && seg[2] === 'users' && seg[3]) {
            const u = findById(db.users, 'user_id', seg[3]);
            if (!u) fail('用户不存在', 404);
            if (method === 'PUT') {
                Object.assign(u, body, { user_id: u.user_id });
                addLog(db, '修改用户', u.username, '更新用户信息');
                saveDB(db);
                return ok(u, '更新成功');
            }
            if (method === 'DELETE') {
                if (u.username === 'admin_01') fail('不能删除内置管理员账号');
                db.users = db.users.filter(x => x.user_id !== u.user_id);
                addLog(db, '删除用户', u.username, '删除用户账号');
                saveDB(db);
                return ok(null, '删除成功');
            }
        }
        if (path === '/api/admin/roles') return ok(db.roles.slice());
        if (path === '/api/admin/logs') {
            let logs = db.operation_logs.slice();
            if (q.keyword) {
                const kw = q.keyword.toLowerCase();
                logs = logs.filter(l => (l.op_user + l.action + l.target + l.detail).toLowerCase().includes(kw));
            }
            return ok(logs);
        }

        // ---- scheduler dashboard ----
        if (path === '/api/scheduler/dashboard') {
            const plan = activePlan(db);
            const stats = plan ? computeStats(db, plan.plan_id) : null;
            return ok({
                total_courses: db.courses.length,
                total_teachers: db.teachers.length,
                total_classes: db.classes.length,
                total_rooms: db.classrooms.length,
                active_plan: planSummary(db, plan),
                conflicts: stats ? { hard: stats.hard_conflicts, soft: stats.soft_conflicts } : { hard: 0, soft: 0 },
                utilization: stats ? stats.utilization : 0,
                recent_tasks: db.schedule_tasks.slice().reverse().slice(0, 5),
                recent_logs: db.operation_logs.slice(0, 6),
            });
        }

        // ---- base data CRUD ----
        function crud(collection, idKey, label, decorate) {
            if (path === '/api/' + collection) {
                if (method === 'GET') {
                    let list = db[collection].slice();
                    if (decorate) list = list.map(decorate);
                    return ok(list);
                }
                if (method === 'POST') {
                    const id = body[idKey];
                    if (!id) fail(label + '编号不能为空');
                    if (db[collection].some(x => x[idKey] === id)) fail(label + '编号已存在');
                    const item = Object.assign({}, body);
                    db[collection].push(item);
                    addLog(db, '新增' + label, id, '新增基础数据');
                    saveDB(db);
                    return ok(item, '新增成功');
                }
            }
            if (seg[0] === 'api' && seg[1] === collection && seg[2]) {
                const item = findById(db[collection], idKey, seg[2]);
                if (!item) fail(label + '不存在', 404);
                if (method === 'PUT') {
                    Object.assign(item, body, { [idKey]: item[idKey] });
                    addLog(db, '修改' + label, item[idKey], '更新基础数据');
                    saveDB(db);
                    return ok(item, '更新成功');
                }
                if (method === 'DELETE') {
                    if (collection === 'courses' && db.schedule_items.some(i => i.course_id === item.course_id)) {
                        fail('该课程已参与排课，受排课方案约束不可删除');
                    }
                    if (collection === 'teachers' && db.courses.some(c => c.teacher_id === item.teacher_id)) {
                        fail('该教师仍承担课程，请先调整课程授课教师');
                    }
                    if (collection === 'classes' && db.courses.some(c => c.class_id === item.class_id)) {
                        fail('该班级仍有课程，请先调整课程授课班级');
                    }
                    if (collection === 'classrooms' && db.schedule_items.some(i => i.room_id === item.room_id)) {
                        fail('该教室已被排课方案使用，不可删除');
                    }
                    if (collection === 'teachers') {
                        db.teacher_preferences = db.teacher_preferences.filter(p => p.teacher_id !== item.teacher_id);
                    }
                    db[collection] = db[collection].filter(x => x[idKey] !== item[idKey]);
                    addLog(db, '删除' + label, item[idKey], '删除基础数据');
                    saveDB(db);
                    return ok(null, '删除成功');
                }
            }
            return null;
        }

        const tMap = teacherMap(db), cMap = classMap(db);
        let r = crud('courses', 'course_id', '课程', c => Object.assign({}, c, {
            teacher_name: tMap[c.teacher_id] ? tMap[c.teacher_id].name : c.teacher_id,
            class_name: cMap[c.class_id] ? cMap[c.class_id].name : c.class_id,
        }));
        if (r) return r;
        r = crud('teachers', 'teacher_id', '教师', t => Object.assign({}, t, {
            pref_count: db.teacher_preferences.filter(p => p.teacher_id === t.teacher_id).length,
        }));
        if (r) return r;
        r = crud('classes', 'class_id', '班级');
        if (r) return r;
        r = crud('classrooms', 'room_id', '教室');
        if (r) return r;

        if (path === '/api/time-slots') return ok(db.time_slots.slice());

        // ---- preferences ----
        if (path === '/api/preferences') {
            const list = db.teacher_preferences.filter(p => !q.teacher_id || p.teacher_id === q.teacher_id);
            return ok(list);
        }
        if (path === '/api/teacher/preferences') {
            if (method === 'GET') {
                const tid = q.teacher_id || (currentUser() && currentUser().teacher_id) || 'T001';
                return ok(db.teacher_preferences.filter(p => p.teacher_id === tid));
            }
            if (method === 'PUT') {
                const tid = body.teacher_id;
                if (!tid) fail('缺少教师编号');
                db.teacher_preferences = db.teacher_preferences.filter(p => p.teacher_id !== tid);
                (body.preferences || []).forEach((p, i) => {
                    if (!p.slot_id || !p.level || p.level === 'none') return;
                    db.teacher_preferences.push({
                        pref_id: tid + '-P' + pad(i + 1), teacher_id: tid,
                        slot_id: p.slot_id, level: p.level,
                    });
                });
                addLog(db, '维护时间偏好', tid, '更新教师时间偏好');
                saveDB(db);
                return ok(null, '时间偏好保存成功');
            }
        }

        // ---- schedule tasks ----
        if (path === '/api/schedule-tasks') {
            if (method === 'GET') return ok(db.schedule_tasks.slice().reverse());
            if (method === 'POST') {
                const task = {
                    task_id: uid('ST'), task_name: body.task_name || '未命名排课任务',
                    semester: body.semester || '2026-2027-1', algorithm: body.algorithm || 'GA',
                    status: 'pending', creator: (currentUser() && currentUser().name) || '教务员',
                    created_at: nowString(),
                    params: Object.assign({
                        populationSize: 20, generations: 50, timeLimit: 600,
                        weights: { preference: 0.3, distribution: 0.2, utilization: 0.15, gap: 0.2, consecutive: 0.15 },
                    }, body.params || {}),
                };
                db.schedule_tasks.push(task);
                addLog(db, '创建排课任务', task.task_name, `${task.semester} / ${task.algorithm}`);
                saveDB(db);
                return ok(task, '创建成功');
            }
        }
        if (seg[0] === 'api' && seg[1] === 'schedule-tasks' && seg[2] && !seg[3]) {
            const task = findById(db.schedule_tasks, 'task_id', seg[2]);
            if (!task) fail('排课任务不存在', 404);
            if (method === 'DELETE') {
                db.schedule_tasks = db.schedule_tasks.filter(t => t.task_id !== task.task_id);
                const planIds = db.schedule_plans.filter(p => p.task_id === task.task_id).map(p => p.plan_id);
                db.schedule_plans = db.schedule_plans.filter(p => p.task_id !== task.task_id);
                db.schedule_items = db.schedule_items.filter(i => !planIds.includes(i.plan_id));
                db.schedule_conflicts = db.schedule_conflicts.filter(c => !planIds.includes(c.plan_id));
                saveDB(db);
                return ok(null, '任务已删除');
            }
        }
        if (seg[0] === 'api' && seg[1] === 'schedule-tasks' && seg[2] && seg[3] === 'run' && method === 'POST') {
            const task = findById(db.schedule_tasks, 'task_id', seg[2]);
            if (!task) fail('排课任务不存在', 404);
            task.status = 'running';
            saveDB(db);
            try {
                const runParams = Object.assign({}, task.params, body.params || {});
                if (!runParams.seed) runParams.seed = Date.now() % 100000;
                const result = await global.CampusScheduler.run(db, runParams, onProgress);
                const haveActive = !!activePlan(db);
                const plan = createPlan(db, task, result, !haveActive);
                task.status = 'completed';
                addLog(db, '运行自动排课', task.task_name, `生成方案 V${plan.version}，适应度 ${plan.fitness}`);
                saveDB(db);
                return ok({
                    plan_id: plan.plan_id, version: plan.version,
                    fitness: plan.fitness, conflict_count: plan.conflict_count,
                    hard_conflicts: plan.hard_conflicts, stats: result.stats, logs: result.logs,
                }, '排课完成');
            } catch (e) {
                task.status = 'failed';
                saveDB(db);
                throw e;
            }
        }

        // ---- plans ----
        if (path === '/api/plans') {
            let plans = db.schedule_plans.slice().sort((a, b) =>
                b.created_at.localeCompare(a.created_at) || (b.version || 0) - (a.version || 0)
            );
            if (q.task_id) plans = plans.filter(p => p.task_id === q.task_id);
            return ok(plans.map(p => planSummary(db, p)));
        }
        if (seg[0] === 'api' && seg[1] === 'plans' && seg[2]) {
            const plan = findById(db.schedule_plans, 'plan_id', seg[2]);
            if (!plan) fail('排课方案不存在', 404);
            if (seg[3] === 'items') {
                const items = planItems(db, plan.plan_id).map(it => itemView(db, it, planConflicts(db, plan.plan_id)));
                return ok({ plan: planSummary(db, plan), items });
            }
            if (seg[3] === 'conflicts') {
                let cs = planConflicts(db, plan.plan_id);
                if (q.severity) cs = cs.filter(c => c.severity === q.severity);
                if (q.keyword) {
                    const kw = q.keyword.toLowerCase();
                    cs = cs.filter(c => (c.conflict_type + c.description).toLowerCase().includes(kw));
                }
                return ok(cs);
            }
            if (seg[3] === 'activate' && method === 'POST') {
                if (plan.hard_conflicts > 0) fail('该方案仍存在硬约束冲突，不能启用');
                db.schedule_plans.forEach(p => { p.is_active = 0; });
                plan.is_active = 1;
                addLog(db, '启用排课方案', `方案 V${plan.version}`, '设为当前启用方案');
                saveDB(db);
                return ok(planSummary(db, plan), '方案已启用');
            }
            if (seg[3] === 'compare') {
                const other = findById(db.schedule_plans, 'plan_id', q.other || '');
                if (!other) fail('对比方案不存在');
                const aItems = planItems(db, plan.plan_id);
                const bItems = planItems(db, other.plan_id);
                const keyOf = it => it.course_id + '|' + it.class_id + '|' + it.session_index;
                const aMap = {}, bMap = {};
                aItems.forEach(it => { aMap[keyOf(it)] = it; });
                bItems.forEach(it => { bMap[keyOf(it)] = it; });
                const changes = [];
                Object.keys(aMap).forEach(k => {
                    const a = aMap[k], b = bMap[k];
                    if (!b) {
                        changes.push({ course_name: a.course_name, class_id: a.class_id, type: '仅当前方案存在', from: '', to: '' });
                    } else if (a.slot_id !== b.slot_id || a.room_id !== b.room_id) {
                        const sa = slotMap(db)[a.slot_id], sb = slotMap(db)[b.slot_id];
                        changes.push({
                            course_name: a.course_name, class_id: a.class_id, type: '时间/教室变更',
                            from: (sa ? sa.label : a.slot_id) + ' / ' + a.room_id,
                            to: (sb ? sb.label : b.slot_id) + ' / ' + b.room_id,
                        });
                    }
                });
                Object.keys(bMap).forEach(k => {
                    if (!aMap[k]) changes.push({ course_name: bMap[k].course_name, class_id: bMap[k].class_id, type: '仅对比方案存在', from: '', to: '' });
                });
                return ok({
                    plan_a: planSummary(db, plan), plan_b: planSummary(db, other),
                    changed: changes.length, changes,
                });
            }
        }

        // ---- manual adjust item ----
        if (seg[0] === 'api' && seg[1] === 'items' && seg[2] && method === 'PUT') {
            const item = findById(db.schedule_items, 'item_id', seg[2]);
            if (!item) fail('课表条目不存在', 404);
            const newItem = Object.assign({}, item, {
                slot_id: body.slot_id || item.slot_id,
                room_id: body.room_id || item.room_id,
            });
            const s = slotMap(db)[newItem.slot_id], r = roomMap(db)[newItem.room_id];
            if (!s || !r) fail('时间段或教室不存在');
            const others = db.schedule_items.filter(x => x.plan_id === item.plan_id && x.item_id !== item.item_id);
            const hard = [];
            if (others.some(x => x.teacher_id === item.teacher_id && x.slot_id === newItem.slot_id)) hard.push('教师时间冲突');
            if (others.some(x => x.class_id === item.class_id && x.slot_id === newItem.slot_id)) hard.push('班级时间冲突');
            if (others.some(x => x.room_id === newItem.room_id && x.slot_id === newItem.slot_id)) hard.push('教室时间冲突');
            if (Number(r.capacity) < Number(item.student_count || 0)) hard.push('教室容量不足');
            if (item.room_type && item.room_type !== '不限' && r.room_type !== item.room_type) hard.push('教室类型不匹配');
            const pref = db.teacher_preferences.find(p => p.teacher_id === item.teacher_id && p.slot_id === newItem.slot_id);
            if (pref && pref.level === 'forbid') hard.push('教师禁止时段');
            if (hard.length) fail('存在硬约束冲突：' + hard.join('、'));
            Object.assign(item, {
                slot_id: newItem.slot_id, room_id: newItem.room_id,
                day: s.day, period: s.period,
            });
            refreshPlanStats(db, item.plan_id);
            addLog(db, '人工调整课表', item.course_name, `调整为 ${s.label} / ${r.name}`);
            saveDB(db);
            return ok(itemView(db, item, planConflicts(db, item.plan_id)), pref && pref.level === 'avoid' ? '已保存，但该时段为教师回避时段' : '调整成功');
        }

        // ---- conflicts ----
        if (seg[0] === 'api' && seg[1] === 'conflicts' && seg[2] && seg[3] === 'resolve' && method === 'POST') {
            const c = findById(db.schedule_conflicts, 'conflict_id', seg[2]);
            if (!c) fail('冲突记录不存在', 404);
            c.status = 'resolved';
            saveDB(db);
            return ok(c, '已标记为处理完成');
        }

        // ---- reports ----
        if (path === '/api/reports') {
            const plan = q.plan_id ? findById(db.schedule_plans, 'plan_id', q.plan_id) : activePlan(db);
            if (!plan) return ok(null);
            return ok(Object.assign({ plan: planSummary(db, plan) }, computeStats(db, plan.plan_id)));
        }

        // ---- teacher ----
        if (path === '/api/teacher/dashboard') {
            const user = currentUser() || {};
            const tid = q.teacher_id || user.teacher_id || 'T001';
            const t = findById(db.teachers, 'teacher_id', tid);
            const plan = activePlan(db);
            const items = plan ? planItems(db, plan.plan_id).filter(i => i.teacher_id === tid).map(i => itemView(db, i, planConflicts(db, plan.plan_id))) : [];
            const courses = db.courses.filter(c => c.teacher_id === tid);
            const prefs = db.teacher_preferences.filter(p => p.teacher_id === tid);
            const avoidCount = items.filter(i => {
                const p = prefs.find(x => x.slot_id === i.slot_id);
                return p && p.level === 'avoid';
            }).length;
            return ok({
                teacher: t,
                plan: plan ? planSummary(db, plan) : null,
                items,
                courses: courses.map(c => Object.assign({}, c, {
                    class_name: cMap[c.class_id] ? cMap[c.class_id].name : c.class_id,
                })),
                stats: {
                    course_count: courses.length,
                    weekly_hours: courses.reduce((s, c) => s + Number(c.weekly_hours || 0), 0),
                    class_count: new Set(courses.map(c => c.class_id)).size,
                    preference_count: prefs.length,
                    avoid_conflicts: avoidCount,
                },
            });
        }
        if (path === '/api/teacher/schedule') {
            const user = currentUser() || {};
            const tid = q.teacher_id || user.teacher_id || 'T001';
            let plan = q.plan_id ? findById(db.schedule_plans, 'plan_id', q.plan_id) : activePlan(db);
            if (!plan) return ok({ plan: null, items: [] });
            const items = planItems(db, plan.plan_id).filter(i => i.teacher_id === tid).map(i => itemView(db, i, planConflicts(db, plan.plan_id)));
            return ok({ plan: planSummary(db, plan), items });
        }

        // ---- student ----
        if (path === '/api/student/dashboard' || path === '/api/student/schedule') {
            const user = currentUser() || {};
            const cid = q.class_id || user.class_id || 'CS2301';
            const cls = findById(db.classes, 'class_id', cid);
            const plan = activePlan(db);
            const items = plan ? planItems(db, plan.plan_id).filter(i => i.class_id === cid).map(i => itemView(db, i, planConflicts(db, plan.plan_id))) : [];
            const courses = db.courses.filter(c => c.class_id === cid).map(c => Object.assign({}, c, {
                teacher_name: tMap[c.teacher_id] ? tMap[c.teacher_id].name : c.teacher_id,
                class_name: cMap[c.class_id] ? cMap[c.class_id].name : c.class_id,
            }));
            if (path === '/api/student/schedule') return ok({ plan: plan ? planSummary(db, plan) : null, items, class_info: cls });
            return ok({
                class_info: cls,
                plan: plan ? planSummary(db, plan) : null,
                items, courses,
                stats: {
                    course_count: courses.length,
                    weekly_hours: courses.reduce((s, c) => s + Number(c.weekly_hours || 0), 0),
                    teacher_count: new Set(courses.map(c => c.teacher_id)).size,
                },
            });
        }

        fail('接口不存在：' + method + ' ' + path, 404);
    }

    const MockAPI = { handle, ensureInit, seedData, loadDB, saveDB, refreshPlanStats };
    global.MockAPI = MockAPI;
})(typeof window !== 'undefined' ? window : globalThis);
