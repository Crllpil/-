-- ============================================
-- 智能校园课程排课与调度系统 — 演示数据
-- DBMS: openGauss（兼容 PostgreSQL）
-- 在 01~06 脚本执行完成后运行
-- 所有账号初始密码均为 123456（MD5 存储）
-- ============================================

SET search_path TO campus_schedule;

TRUNCATE operation_log, conflict, schedule_item, schedule_plan, schedule_task,
         teacher_preference, course, classroom, time_slot, sys_user, class, teacher
RESTART IDENTITY CASCADE;

-- 教师
INSERT INTO teacher (teacher_id, teacher_no, name, title, department, phone, max_weekly_hours) VALUES
(1, 'T001', '王建国', '教授',   '计算机学院',   '13800000001', 12),
(2, 'T002', '李慧',   '副教授', '计算机学院',   '13800000002', 12),
(3, 'T003', '赵强',   '讲师',   '软件学院',     '13800000003', 10),
(4, 'T004', '陈静',   '副教授', '计算机学院',   '13800000004', 12),
(5, 'T005', '刘洋',   '讲师',   '软件学院',     '13800000005', 10),
(6, 'T006', '孙梅',   '教授',   '人工智能学院', '13800000006', 10),
(7, 'T007', '周敏',   '副教授', '外国语学院',   '13800000007', 12),
(8, 'T008', '吴刚',   '教授',   '数学学院',     '13800000008', 12),
(9, 'T009', '郑凯',   '讲师',   '体育学院',     '13800000009', 8);

-- 班级
INSERT INTO class (class_id, class_no, name, grade, major, student_count) VALUES
(1, 'CS2301', '计算机2301班',   '2023', '计算机科学与技术', 42),
(2, 'CS2302', '计算机2302班',   '2023', '计算机科学与技术', 40),
(3, 'SE2301', '软件2301班',     '2023', '软件工程',         38),
(4, 'AI2301', '人工智能2301班', '2023', '人工智能',         36);

-- 用户：管理员、教务员、教师、学生
INSERT INTO sys_user (user_id, username, password_hash, name, role_id, teacher_id, class_id, status, phone, last_login) VALUES
(1,  'admin_01', md5('123456'), '系统管理员', 'admin',     NULL, NULL, 1, '13900000001', NULL),
(2,  'jw_01',    md5('123456'), '张教务',     'scheduler', NULL, NULL, 1, '13900000002', NULL),
(3,  'T001',     md5('123456'), '王建国',     'teacher',   1,    NULL, 1, '13800000001', NULL),
(4,  'T002',     md5('123456'), '李慧',       'teacher',   2,    NULL, 1, '13800000002', NULL),
(5,  'T003',     md5('123456'), '赵强',       'teacher',   3,    NULL, 1, '13800000003', NULL),
(6,  'T004',     md5('123456'), '陈静',       'teacher',   4,    NULL, 1, '13800000004', NULL),
(7,  'T005',     md5('123456'), '刘洋',       'teacher',   5,    NULL, 1, '13800000005', NULL),
(8,  'T006',     md5('123456'), '孙梅',       'teacher',   6,    NULL, 1, '13800000006', NULL),
(9,  'T007',     md5('123456'), '周敏',       'teacher',   7,    NULL, 1, '13800000007', NULL),
(10, 'T008',     md5('123456'), '吴刚',       'teacher',   8,    NULL, 1, '13800000008', NULL),
(11, 'T009',     md5('123456'), '郑凯',       'teacher',   9,    NULL, 1, '13800000009', NULL),
(12, 'S001',     md5('123456'), '陈晓',       'student',   NULL, 1,    1, '13700000001', NULL),
(13, 'S002',     md5('123456'), '林悦',       'student',   NULL, 2,    1, '13700000002', NULL);

-- 课程（课程—教师—班级）
INSERT INTO course (course_id, course_no, course_name, course_type, credit, total_hours, weekly_hours, teacher_id, class_id, room_type, student_count, semester) VALUES
(1,  'CS101', '数据结构',       '专业必修', 4, 64, 4, 1, 1, '多媒体', 42, '2026-2027-1'),
(2,  'CS201', '操作系统',       '专业必修', 3, 48, 3, 2, 1, '多媒体', 42, '2026-2027-1'),
(3,  'CS202', '数据库系统',     '专业必修', 4, 64, 4, 3, 2, '机房',   40, '2026-2027-1'),
(4,  'CS203', '计算机网络',     '专业必修', 3, 48, 3, 4, 2, '多媒体', 40, '2026-2027-1'),
(5,  'SE301', '软件工程',       '专业必修', 4, 64, 4, 5, 3, '多媒体', 38, '2026-2027-1'),
(6,  'AI101', '人工智能导论',   '专业必修', 3, 48, 3, 6, 4, '多媒体', 36, '2026-2027-1'),
(7,  'GE101', '大学英语',       '公共必修', 2, 32, 2, 7, 1, '普通',   42, '2026-2027-1'),
(8,  'MA101', '高等数学',       '公共必修', 4, 64, 4, 8, 2, '多媒体', 40, '2026-2027-1'),
(9,  'PE101', '体育',           '公共必修', 2, 32, 2, 9, 3, '体育场', 38, '2026-2027-1'),
(10, 'CS301', '编译原理',       '专业选修', 3, 48, 3, 2, 4, '机房',   36, '2026-2027-1'),
(11, 'SE302', '软件测试',       '专业选修', 2, 32, 2, 3, 3, '实验室', 38, '2026-2027-1'),
(12, 'MA201', '概率论',         '公共必修', 3, 48, 3, 8, 4, '多媒体', 36, '2026-2027-1');

-- 教室
INSERT INTO classroom (room_id, room_no, name, building, floor, room_type, capacity, status) VALUES
(1, 'A101', '教学楼A101', '教学楼A', 1, '多媒体', 60,  '可用'),
(2, 'A102', '教学楼A102', '教学楼A', 1, '多媒体', 60,  '可用'),
(3, 'B201', '实验楼B201', '实验楼B', 2, '机房',   50,  '可用'),
(4, 'B202', '实验楼B202', '实验楼B', 2, '实验室', 40,  '可用'),
(5, 'B203', '实验楼B203', '实验楼B', 2, '机房',   45,  '可用'),
(6, 'C301', '教学楼C301', '教学楼C', 3, '普通',   120, '可用'),
(7, '操场', '东区体育场', '体育中心', 1, '体育场', 200, '可用');

-- 时间段（5 天 × 5 段）
INSERT INTO time_slot (slot_id, day, period, start_time, end_time, label) VALUES
('S11', 1, 1, '08:00', '09:40', '周一第1-2节'),
('S12', 1, 2, '10:00', '11:40', '周一第3-4节'),
('S13', 1, 3, '14:00', '15:40', '周一第5-6节'),
('S14', 1, 4, '16:00', '17:40', '周一第7-8节'),
('S15', 1, 5, '19:00', '20:40', '周一第9-10节'),
('S21', 2, 1, '08:00', '09:40', '周二第1-2节'),
('S22', 2, 2, '10:00', '11:40', '周二第3-4节'),
('S23', 2, 3, '14:00', '15:40', '周二第5-6节'),
('S24', 2, 4, '16:00', '17:40', '周二第7-8节'),
('S25', 2, 5, '19:00', '20:40', '周二第9-10节'),
('S31', 3, 1, '08:00', '09:40', '周三第1-2节'),
('S32', 3, 2, '10:00', '11:40', '周三第3-4节'),
('S33', 3, 3, '14:00', '15:40', '周三第5-6节'),
('S34', 3, 4, '16:00', '17:40', '周三第7-8节'),
('S35', 3, 5, '19:00', '20:40', '周三第9-10节'),
('S41', 4, 1, '08:00', '09:40', '周四第1-2节'),
('S42', 4, 2, '10:00', '11:40', '周四第3-4节'),
('S43', 4, 3, '14:00', '15:40', '周四第5-6节'),
('S44', 4, 4, '16:00', '17:40', '周四第7-8节'),
('S45', 4, 5, '19:00', '20:40', '周四第9-10节'),
('S51', 5, 1, '08:00', '09:40', '周五第1-2节'),
('S52', 5, 2, '10:00', '11:40', '周五第3-4节'),
('S53', 5, 3, '14:00', '15:40', '周五第5-6节'),
('S54', 5, 4, '16:00', '17:40', '周五第7-8节'),
('S55', 5, 5, '19:00', '20:40', '周五第9-10节');

-- 教师时间偏好
INSERT INTO teacher_preference (pref_id, teacher_id, slot_id, level) VALUES
(1,  1, 'S11', 'avoid'), (2,  1, 'S12', 'avoid'), (3,  1, 'S31', 'prefer'), (4,  1, 'S32', 'prefer'),
(5,  2, 'S55', 'forbid'),(6,  2, 'S41', 'avoid'), (7,  2, 'S21', 'prefer'),
(8,  3, 'S21', 'avoid'), (9,  3, 'S11', 'prefer'),
(10, 4, 'S15', 'forbid'),(11, 4, 'S51', 'avoid'),
(12, 5, 'S31', 'avoid'), (13, 5, 'S41', 'prefer'),
(14, 6, 'S31', 'prefer'),(15, 6, 'S55', 'avoid'),
(16, 7, 'S11', 'avoid'), (17, 7, 'S21', 'prefer'),
(18, 8, 'S12', 'forbid'),(19, 8, 'S51', 'avoid'),
(20, 9, 'S31', 'prefer'),(21, 9, 'S11', 'avoid');

-- 排课任务（初始状态：待运行，由教务员在系统中运行算法）
INSERT INTO schedule_task (task_id, task_name, semester, algorithm, params, status, creator_id, creator_name, created_at) VALUES
(1, '2026-2027学年第一学期排课', '2026-2027-1', 'GA',
 '{"populationSize":20,"generations":50,"timeLimit":600,"weights":{"preference":0.30,"distribution":0.20,"utilization":0.15,"gap":0.20,"consecutive":0.15}}',
 'pending', 2, '张教务', '2026-11-10 09:30:00');

-- 操作日志
INSERT INTO operation_log (log_id, op_time, op_user, action, target, detail) VALUES
(1, '2026-11-10 09:12:00', 'admin_01', '登录系统', '系统', '系统管理员登录后台'),
(2, '2026-11-10 09:30:00', 'jw_01',    '创建排课任务', '2026-2027学年第一学期排课', '配置算法：遗传算法'),
(3, '2026-11-10 09:45:00', 'jw_01',    '运行自动排课', '2026-2027学年第一学期排课', '等待生成排课方案'),
(4, '2026-11-11 14:20:00', 'T001',     '维护时间偏好', '教师 王建国', '设置偏好/回避/禁止时段'),
(5, '2026-11-12 08:30:00', 'admin_01', '新增用户', 'S002', '新增学生账号'),
(6, '2026-11-12 09:00:00', 'S001',     '登录系统', '系统', '学生登录系统');

-- 重置序列
SELECT setval('campus_schedule.teacher_teacher_id_seq', 9, true);
SELECT setval('campus_schedule.class_class_id_seq', 4, true);
SELECT setval('campus_schedule.sys_user_user_id_seq', 13, true);
SELECT setval('campus_schedule.course_course_id_seq', 12, true);
SELECT setval('campus_schedule.classroom_room_id_seq', 7, true);
SELECT setval('campus_schedule.teacher_preference_pref_id_seq', 21, true);
SELECT setval('campus_schedule.schedule_task_task_id_seq', 1, true);
SELECT setval('campus_schedule.schedule_plan_plan_id_seq', 1, false);
SELECT setval('campus_schedule.schedule_item_item_id_seq', 1, false);
SELECT setval('campus_schedule.conflict_conflict_id_seq', 1, false);
SELECT setval('campus_schedule.operation_log_log_id_seq', 6, true);
