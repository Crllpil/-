-- ============================================
-- 智能校园课程排课与调度系统 — 存储过程与函数
-- DBMS: openGauss（兼容 PostgreSQL）
-- 功能：启用方案、刷新冲突、人工调整、教师/班级课时、教室利用率
-- ============================================

SET search_path TO campus_schedule;

DROP PROCEDURE IF EXISTS sp_activate_plan(BIGINT, VARCHAR);
DROP PROCEDURE IF EXISTS sp_refresh_plan_conflicts(BIGINT, INT, INT);
DROP PROCEDURE IF EXISTS sp_manual_adjust_item(BIGINT, VARCHAR, BIGINT, VARCHAR);
DROP FUNCTION  IF EXISTS fn_teacher_weekly_hours(BIGINT, BIGINT);
DROP FUNCTION  IF EXISTS fn_class_weekly_hours(BIGINT, BIGINT);
DROP FUNCTION  IF EXISTS fn_room_utilization(BIGINT);
DROP FUNCTION  IF EXISTS fn_plan_summary(BIGINT);

-- ============================================
-- 存储过程1：启用排课方案
-- ============================================
CREATE OR REPLACE PROCEDURE sp_activate_plan(
    IN  p_plan_id BIGINT,
    OUT p_result  VARCHAR(200)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_hard INT;
BEGIN
    SELECT hard_conflicts INTO v_hard
    FROM schedule_plan WHERE plan_id = p_plan_id;

    IF NOT FOUND THEN
        p_result := '方案不存在';
        RETURN;
    END IF;
    IF v_hard > 0 THEN
        p_result := '方案仍有 ' || v_hard || ' 条硬约束冲突，不能启用';
        RETURN;
    END IF;

    -- 触发器 trg_single_active_plan 会自动将其他方案置为未启用
    UPDATE schedule_plan SET is_active = 1 WHERE plan_id = p_plan_id;
    p_result := '方案启用成功';
EXCEPTION WHEN OTHERS THEN
    p_result := '启用失败：' || SQLERRM;
END;
$$;

-- ============================================
-- 存储过程2：重新扫描并刷新方案冲突记录
-- ============================================
CREATE OR REPLACE PROCEDURE sp_refresh_plan_conflicts(
    IN  p_plan_id BIGINT,
    OUT p_hard    INT,
    OUT p_soft    INT
)
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM conflict WHERE plan_id = p_plan_id;

    -- 教师冲突
    INSERT INTO conflict (plan_id, conflict_type, entity_id, description, severity, status)
    SELECT i.plan_id, '教师冲突', i.item_id::VARCHAR,
           '教师 ' || t.name || ' 在 ' || s.label || ' 被安排多门课程', 'hard', 'open'
    FROM schedule_item i
    JOIN teacher t   ON i.teacher_id = t.teacher_id
    JOIN time_slot s ON i.slot_id = s.slot_id
    WHERE i.plan_id = p_plan_id
      AND EXISTS (
          SELECT 1 FROM schedule_item j
          WHERE j.plan_id = i.plan_id
            AND j.teacher_id = i.teacher_id
            AND j.slot_id = i.slot_id
            AND j.item_id <> i.item_id
      );

    -- 班级冲突
    INSERT INTO conflict (plan_id, conflict_type, entity_id, description, severity, status)
    SELECT i.plan_id, '班级冲突', i.item_id::VARCHAR,
           '班级 ' || c.name || ' 在 ' || s.label || ' 同时安排多门课程', 'hard', 'open'
    FROM schedule_item i
    JOIN class c     ON i.class_id = c.class_id
    JOIN time_slot s ON i.slot_id = s.slot_id
    WHERE i.plan_id = p_plan_id
      AND EXISTS (
          SELECT 1 FROM schedule_item j
          WHERE j.plan_id = i.plan_id
            AND j.class_id = i.class_id
            AND j.slot_id = i.slot_id
            AND j.item_id <> i.item_id
      );

    -- 教室冲突
    INSERT INTO conflict (plan_id, conflict_type, entity_id, description, severity, status)
    SELECT i.plan_id, '教室冲突', i.item_id::VARCHAR,
           '教室 ' || r.name || ' 在 ' || s.label || ' 被多个教学任务占用', 'hard', 'open'
    FROM schedule_item i
    JOIN classroom r ON i.room_id = r.room_id
    JOIN time_slot s ON i.slot_id = s.slot_id
    WHERE i.plan_id = p_plan_id
      AND EXISTS (
          SELECT 1 FROM schedule_item j
          WHERE j.plan_id = i.plan_id
            AND j.room_id = i.room_id
            AND j.slot_id = i.slot_id
            AND j.item_id <> i.item_id
      );

    -- 教室容量不足
    INSERT INTO conflict (plan_id, conflict_type, entity_id, description, severity, status)
    SELECT i.plan_id, '教室容量不足', i.item_id::VARCHAR,
           '课程 ' || c.course_name || ' 修读人数 ' || c.student_count
           || ' 超过 ' || r.name || ' 容量 ' || r.capacity, 'hard', 'open'
    FROM schedule_item i
    JOIN course c    ON i.course_id = c.course_id
    JOIN classroom r ON i.room_id = r.room_id
    WHERE i.plan_id = p_plan_id AND r.capacity < c.student_count;

    -- 教室类型不匹配
    INSERT INTO conflict (plan_id, conflict_type, entity_id, description, severity, status)
    SELECT i.plan_id, '教室类型不匹配', i.item_id::VARCHAR,
           '课程 ' || c.course_name || ' 需要 ' || c.room_type
           || '，当前教室为 ' || r.room_type, 'hard', 'open'
    FROM schedule_item i
    JOIN course c    ON i.course_id = c.course_id
    JOIN classroom r ON i.room_id = r.room_id
    WHERE i.plan_id = p_plan_id
      AND c.room_type <> '不限' AND c.room_type <> r.room_type;

    -- 教师禁止时段
    INSERT INTO conflict (plan_id, conflict_type, entity_id, description, severity, status)
    SELECT i.plan_id, '教师禁止时段', i.item_id::VARCHAR,
           '教师 ' || t.name || ' 的禁止时段 ' || s.label || ' 被安排 ' || c.course_name,
           'hard', 'open'
    FROM schedule_item i
    JOIN teacher t           ON i.teacher_id = t.teacher_id
    JOIN time_slot s         ON i.slot_id = s.slot_id
    JOIN course c            ON i.course_id = c.course_id
    JOIN teacher_preference p ON p.teacher_id = i.teacher_id AND p.slot_id = i.slot_id
    WHERE i.plan_id = p_plan_id AND p.level = 'forbid';

    -- 教师回避时段（软约束）
    INSERT INTO conflict (plan_id, conflict_type, entity_id, description, severity, status)
    SELECT i.plan_id, '教师时间偏好', i.item_id::VARCHAR,
           '教师 ' || t.name || ' 的回避时段 ' || s.label || ' 被安排 ' || c.course_name,
           'soft', 'open'
    FROM schedule_item i
    JOIN teacher t           ON i.teacher_id = t.teacher_id
    JOIN time_slot s         ON i.slot_id = s.slot_id
    JOIN course c            ON i.course_id = c.course_id
    JOIN teacher_preference p ON p.teacher_id = i.teacher_id AND p.slot_id = i.slot_id
    WHERE i.plan_id = p_plan_id AND p.level = 'avoid';

    SELECT
        COALESCE(SUM(CASE WHEN severity = 'hard' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN severity = 'soft' THEN 1 ELSE 0 END), 0)
    INTO p_hard, p_soft
    FROM conflict WHERE plan_id = p_plan_id;

    UPDATE schedule_plan
    SET conflict_count = p_hard + p_soft,
        hard_conflicts = p_hard,
        soft_violations = p_soft
    WHERE plan_id = p_plan_id;
END;
$$;

-- ============================================
-- 存储过程3：人工调整课表条目（触发器负责校验）
-- ============================================
CREATE OR REPLACE PROCEDURE sp_manual_adjust_item(
    IN  p_item_id BIGINT,
    IN  p_slot_id VARCHAR(10),
    IN  p_room_id BIGINT,
    OUT p_result  VARCHAR(300)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_day    SMALLINT;
    v_period SMALLINT;
BEGIN
    SELECT day, period INTO v_day, v_period
    FROM time_slot WHERE slot_id = p_slot_id;

    IF NOT FOUND THEN
        p_result := '时间段不存在';
        RETURN;
    END IF;

    UPDATE schedule_item
    SET slot_id = p_slot_id,
        room_id = p_room_id,
        day = v_day,
        period = v_period
    WHERE item_id = p_item_id;

    IF NOT FOUND THEN
        p_result := '课表条目不存在';
        RETURN;
    END IF;

    p_result := '调整成功';
EXCEPTION WHEN OTHERS THEN
    p_result := '调整失败：' || SQLERRM;
END;
$$;

-- ============================================
-- 函数1：教师周课时
-- ============================================
CREATE OR REPLACE FUNCTION fn_teacher_weekly_hours(
    p_teacher_id BIGINT,
    p_plan_id    BIGINT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_hours INT;
    v_plan  BIGINT;
BEGIN
    v_plan := p_plan_id;
    IF v_plan IS NULL THEN
        SELECT plan_id INTO v_plan FROM v_active_plan LIMIT 1;
    END IF;
    SELECT COUNT(*) INTO v_hours
    FROM schedule_item
    WHERE teacher_id = p_teacher_id AND plan_id = v_plan;
    RETURN COALESCE(v_hours, 0);
END;
$$;

-- ============================================
-- 函数2：班级周课时
-- ============================================
CREATE OR REPLACE FUNCTION fn_class_weekly_hours(
    p_class_id BIGINT,
    p_plan_id  BIGINT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_hours INT;
    v_plan  BIGINT;
BEGIN
    v_plan := p_plan_id;
    IF v_plan IS NULL THEN
        SELECT plan_id INTO v_plan FROM v_active_plan LIMIT 1;
    END IF;
    SELECT COUNT(*) INTO v_hours
    FROM schedule_item
    WHERE class_id = p_class_id AND plan_id = v_plan;
    RETURN COALESCE(v_hours, 0);
END;
$$;

-- ============================================
-- 函数3：教室利用率（按方案）
-- ============================================
CREATE OR REPLACE FUNCTION fn_room_utilization(p_plan_id BIGINT)
RETURNS TABLE(
    room_id          BIGINT,
    room_no          VARCHAR,
    name             VARCHAR,
    room_type        VARCHAR,
    capacity         INT,
    used_count       BIGINT,
    total_slots      INT,
    utilization_pct  NUMERIC
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT r.room_id, r.room_no, r.name, r.room_type, r.capacity,
           COALESCE(u.used_count, 0)::BIGINT,
           25,
           ROUND(COALESCE(u.used_count, 0) * 100.0 / 25, 1)
    FROM classroom r
    LEFT JOIN (
        SELECT room_id, COUNT(*) AS used_count
        FROM schedule_item
        WHERE plan_id = p_plan_id
        GROUP BY room_id
    ) u ON r.room_id = u.room_id
    WHERE r.status = '可用'
    ORDER BY 7 DESC;
END;
$$;

-- ============================================
-- 函数4：方案汇总
-- ============================================
CREATE OR REPLACE FUNCTION fn_plan_summary(p_plan_id BIGINT)
RETURNS TABLE(
    plan_id          BIGINT,
    task_id          BIGINT,
    version          INT,
    gen_method       VARCHAR,
    fitness          NUMERIC,
    conflict_count   INT,
    hard_conflicts   INT,
    soft_violations  INT,
    is_active        SMALLINT,
    created_at       TIMESTAMP,
    task_name        VARCHAR,
    item_count       BIGINT
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT p.plan_id, p.task_id, p.version, p.gen_method, p.fitness,
           p.conflict_count, p.hard_conflicts, p.soft_violations,
           p.is_active, p.created_at, t.task_name,
           (SELECT COUNT(*) FROM schedule_item i WHERE i.plan_id = p.plan_id)
    FROM schedule_plan p
    JOIN schedule_task t ON p.task_id = t.task_id
    WHERE p.plan_id = p_plan_id;
END;
$$;

-- 说明：Flask 后端以 openGauss 超级用户连接数据库，已具备上述对象权限；
-- 若使用 app_scheduler / app_teacher 等最小权限账号，可在此按需授予 EXECUTE 权限。
