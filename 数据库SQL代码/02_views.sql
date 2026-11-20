-- ============================================
-- 智能校园课程排课与调度系统 — 视图定义
-- DBMS: openGauss（兼容 PostgreSQL）
-- 覆盖课表展示、教师工作量、教室利用率、冲突统计等查询
-- ============================================

SET search_path TO campus_schedule;

-- 按依赖顺序删除
DROP VIEW IF EXISTS v_conflict_summary;
DROP VIEW IF EXISTS v_room_utilization;
DROP VIEW IF EXISTS v_teacher_workload;
DROP VIEW IF EXISTS v_teacher_timetable;
DROP VIEW IF EXISTS v_class_timetable;
DROP VIEW IF EXISTS v_room_timetable;
DROP VIEW IF EXISTS v_plan_item_detail;
DROP VIEW IF EXISTS v_plan_summary;
DROP VIEW IF EXISTS v_teacher_preference_detail;
DROP VIEW IF EXISTS v_active_plan;

-- ============================================
-- 视图1：当前启用方案 v_active_plan
-- ============================================
CREATE VIEW v_active_plan AS
SELECT p.*
FROM schedule_plan p
WHERE p.is_active = 1;

-- ============================================
-- 视图2：方案汇总 v_plan_summary
-- ============================================
CREATE VIEW v_plan_summary AS
SELECT
    p.plan_id,
    p.task_id,
    p.version,
    p.gen_method,
    p.fitness,
    p.conflict_count,
    p.hard_conflicts,
    p.soft_violations,
    p.is_active,
    p.created_at,
    t.task_name,
    t.semester,
    t.algorithm,
    COUNT(i.item_id) AS item_count
FROM schedule_plan p
JOIN schedule_task t ON p.task_id = t.task_id
LEFT JOIN schedule_item i ON p.plan_id = i.plan_id
GROUP BY p.plan_id, p.task_id, p.version, p.gen_method, p.fitness,
         p.conflict_count, p.hard_conflicts, p.soft_violations,
         p.is_active, p.created_at, t.task_name, t.semester, t.algorithm;

-- ============================================
-- 视图3：课表条目明细 v_plan_item_detail
-- 连接课程、教师、班级、教室、时间段
-- ============================================
CREATE VIEW v_plan_item_detail AS
SELECT
    i.item_id,
    i.plan_id,
    i.course_id,
    i.teacher_id,
    i.class_id,
    i.room_id,
    i.slot_id,
    i.week_no,
    i.day,
    i.period,
    i.session_index,
    c.course_no,
    c.course_name,
    c.course_type,
    c.credit,
    c.weekly_hours,
    c.room_type,
    c.student_count,
    t.teacher_no,
    t.name          AS teacher_name,
    t.title         AS teacher_title,
    cl.class_no,
    cl.name         AS class_name,
    cl.grade        AS class_grade,
    cl.major        AS class_major,
    r.room_no,
    r.name          AS room_name,
    r.room_type     AS actual_room_type,
    r.capacity      AS room_capacity,
    s.label         AS slot_label,
    s.start_time,
    s.end_time,
    CASE s.day
        WHEN 1 THEN '周一'
        WHEN 2 THEN '周二'
        WHEN 3 THEN '周三'
        WHEN 4 THEN '周四'
        WHEN 5 THEN '周五'
    END             AS day_name,
    p.version       AS plan_version,
    p.task_id,
    p.fitness,
    EXISTS (
        SELECT 1 FROM conflict cf
        WHERE cf.plan_id = i.plan_id
          AND cf.entity_id = i.item_id::VARCHAR
          AND cf.severity = 'hard'
    ) AS has_hard_conflict,
    EXISTS (
        SELECT 1 FROM conflict cf
        WHERE cf.plan_id = i.plan_id
          AND cf.entity_id = i.item_id::VARCHAR
          AND cf.severity = 'soft'
    ) AS has_soft_conflict
FROM schedule_item i
JOIN course      c  ON i.course_id  = c.course_id
JOIN teacher     t  ON i.teacher_id = t.teacher_id
JOIN class       cl ON i.class_id   = cl.class_id
JOIN classroom   r  ON i.room_id    = r.room_id
JOIN time_slot   s  ON i.slot_id    = s.slot_id
JOIN schedule_plan p ON i.plan_id   = p.plan_id;

-- ============================================
-- 视图4：班级课表 v_class_timetable（当前启用方案）
-- ============================================
CREATE VIEW v_class_timetable AS
SELECT d.*
FROM v_plan_item_detail d
JOIN v_active_plan p ON d.plan_id = p.plan_id;

-- ============================================
-- 视图5：教师课表 v_teacher_timetable（当前启用方案）
-- ============================================
CREATE VIEW v_teacher_timetable AS
SELECT d.*
FROM v_plan_item_detail d
JOIN v_active_plan p ON d.plan_id = p.plan_id;

-- ============================================
-- 视图6：教室课表 v_room_timetable（当前启用方案）
-- ============================================
CREATE VIEW v_room_timetable AS
SELECT d.*
FROM v_plan_item_detail d
JOIN v_active_plan p ON d.plan_id = p.plan_id;

-- ============================================
-- 视图7：教师工作量 v_teacher_workload（当前启用方案）
-- ============================================
CREATE VIEW v_teacher_workload AS
SELECT
    t.teacher_id,
    t.teacher_no,
    t.name                                      AS teacher_name,
    t.title,
    t.department,
    t.max_weekly_hours,
    COUNT(DISTINCT i.course_id)                 AS course_count,
    COUNT(i.item_id)                            AS weekly_hours,
    COUNT(DISTINCT i.class_id)                  AS class_count,
    CASE
        WHEN COUNT(i.item_id) > t.max_weekly_hours THEN '超课时'
        WHEN COUNT(i.item_id) = t.max_weekly_hours THEN '满课时'
        WHEN COUNT(i.item_id) > 0                  THEN '正常'
        ELSE '暂无授课'
    END                                         AS workload_status
FROM teacher t
LEFT JOIN schedule_item i
       ON t.teacher_id = i.teacher_id
      AND i.plan_id IN (SELECT plan_id FROM v_active_plan)
GROUP BY t.teacher_id, t.teacher_no, t.name, t.title, t.department, t.max_weekly_hours;

-- ============================================
-- 视图8：教室利用率 v_room_utilization（当前启用方案）
-- 总可用时段 = 25（5 天 × 5 个时间段）
-- ============================================
CREATE VIEW v_room_utilization AS
SELECT
    r.room_id,
    r.room_no,
    r.name,
    r.room_type,
    r.capacity,
    COALESCE(u.used_count, 0)                                  AS used_count,
    25                                                         AS total_slots,
    ROUND(COALESCE(u.used_count, 0) * 100.0 / 25, 1)           AS utilization_pct
FROM classroom r
LEFT JOIN (
    SELECT i.room_id, COUNT(*) AS used_count
    FROM schedule_item i
    JOIN v_active_plan p ON i.plan_id = p.plan_id
    GROUP BY i.room_id
) u ON r.room_id = u.room_id
WHERE r.status = '可用'
ORDER BY utilization_pct DESC;

-- ============================================
-- 视图9：冲突汇总 v_conflict_summary
-- ============================================
CREATE VIEW v_conflict_summary AS
SELECT
    plan_id,
    severity,
    conflict_type,
    COUNT(*) AS conflict_count
FROM conflict
GROUP BY plan_id, severity, conflict_type;

-- ============================================
-- 视图10：教师时间偏好明细 v_teacher_preference_detail
-- ============================================
CREATE VIEW v_teacher_preference_detail AS
SELECT
    p.pref_id,
    p.teacher_id,
    t.name      AS teacher_name,
    p.slot_id,
    s.day,
    s.period,
    s.label     AS slot_label,
    p.level
FROM teacher_preference p
JOIN teacher t   ON p.teacher_id = t.teacher_id
JOIN time_slot s ON p.slot_id = s.slot_id;
