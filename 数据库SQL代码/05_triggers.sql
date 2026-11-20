-- ============================================
-- 智能校园课程排课与调度系统 — 触发器
-- DBMS: openGauss（兼容 PostgreSQL）
-- 功能：
--   1. 课表条目硬约束校验（教师/班级/教室冲突、容量、类型、禁止时段、周课时上限）
--   2. 同一时间只允许一个启用方案
--   3. 课表变更审计日志
--   4. 保护当前启用方案不被删除
-- ============================================

SET search_path TO campus_schedule;

DROP TRIGGER IF EXISTS trg_check_item_conflict ON schedule_item;
DROP TRIGGER IF EXISTS trg_audit_schedule_item ON schedule_item;
DROP TRIGGER IF EXISTS trg_single_active_plan ON schedule_plan;
DROP TRIGGER IF EXISTS trg_log_plan_activation ON schedule_plan;
DROP TRIGGER IF EXISTS trg_prevent_active_plan_delete ON schedule_plan;

DROP FUNCTION IF EXISTS fn_trg_check_item_conflict();
DROP FUNCTION IF EXISTS fn_trg_audit_schedule_item();
DROP FUNCTION IF EXISTS fn_trg_single_active_plan();
DROP FUNCTION IF EXISTS fn_trg_log_plan_activation();
DROP FUNCTION IF EXISTS fn_trg_prevent_active_plan_delete();

-- ============================================
-- 触发器1：课表条目硬约束校验
-- 时机：BEFORE INSERT OR UPDATE ON schedule_item
-- ============================================
CREATE OR REPLACE FUNCTION fn_trg_check_item_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_self          BIGINT;
    v_cnt           INT;
    v_max_hours     INT;
    v_capacity      INT;
    v_room_type     VARCHAR(20);
    v_room_status   VARCHAR(20);
    v_need_type     VARCHAR(20);
    v_student_count INT;
    v_slot_ok       INT;
    v_msg           VARCHAR(300);
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_self := OLD.item_id;
    ELSE
        v_self := -1;
    END IF;

    -- 时间段必须与 day/period 一致
    SELECT COUNT(*) INTO v_slot_ok
    FROM time_slot
    WHERE slot_id = NEW.slot_id AND day = NEW.day AND period = NEW.period;
    IF v_slot_ok = 0 THEN
        RAISE EXCEPTION '课表条目时间段不一致：slot_id=%', NEW.slot_id;
    END IF;

    -- 教师时间冲突
    SELECT COUNT(*) INTO v_cnt FROM schedule_item
    WHERE plan_id = NEW.plan_id AND slot_id = NEW.slot_id
      AND teacher_id = NEW.teacher_id AND item_id <> v_self;
    IF v_cnt > 0 THEN
        RAISE EXCEPTION '教师时间冲突：该教师在同一时间段已安排课程';
    END IF;

    -- 班级时间冲突
    SELECT COUNT(*) INTO v_cnt FROM schedule_item
    WHERE plan_id = NEW.plan_id AND slot_id = NEW.slot_id
      AND class_id = NEW.class_id AND item_id <> v_self;
    IF v_cnt > 0 THEN
        RAISE EXCEPTION '班级时间冲突：该班级在同一时间段已安排课程';
    END IF;

    -- 教室时间冲突
    SELECT COUNT(*) INTO v_cnt FROM schedule_item
    WHERE plan_id = NEW.plan_id AND slot_id = NEW.slot_id
      AND room_id = NEW.room_id AND item_id <> v_self;
    IF v_cnt > 0 THEN
        RAISE EXCEPTION '教室时间冲突：该教室在同一时间段已被占用';
    END IF;

    -- 教室容量、类型与状态
    SELECT capacity, room_type, status
      INTO v_capacity, v_room_type, v_room_status
    FROM classroom WHERE room_id = NEW.room_id;

    SELECT student_count, room_type
      INTO v_student_count, v_need_type
    FROM course WHERE course_id = NEW.course_id;

    IF v_capacity < v_student_count THEN
        v_msg := '教室容量不足：修读人数 ' || v_student_count || '，教室容量 ' || v_capacity;
        RAISE EXCEPTION '%', v_msg;
    END IF;
    IF v_need_type <> '不限' AND v_room_type <> v_need_type THEN
        v_msg := '教室类型不匹配：课程需要 ' || v_need_type || '，教室为 ' || v_room_type;
        RAISE EXCEPTION '%', v_msg;
    END IF;
    IF v_room_status <> '可用' THEN
        RAISE EXCEPTION '教室状态为 %，不能安排课程', v_room_status;
    END IF;

    -- 教师禁止时段
    SELECT COUNT(*) INTO v_cnt FROM teacher_preference
    WHERE teacher_id = NEW.teacher_id AND slot_id = NEW.slot_id
      AND level = 'forbid';
    IF v_cnt > 0 THEN
        RAISE EXCEPTION '教师禁止时段：该时间段被教师标记为禁止安排';
    END IF;

    -- 教师周课时上限（每个课次计 1 节）
    SELECT max_weekly_hours INTO v_max_hours FROM teacher WHERE teacher_id = NEW.teacher_id;
    SELECT COUNT(*) INTO v_cnt FROM schedule_item
    WHERE plan_id = NEW.plan_id AND teacher_id = NEW.teacher_id AND item_id <> v_self;
    IF v_cnt + 1 > v_max_hours THEN
        v_msg := '教师周课时超限：上限 ' || v_max_hours || ' 节';
        RAISE EXCEPTION '%', v_msg;
    END IF;

    -- 班级周课次上限（25 个时间段）
    SELECT COUNT(*) INTO v_cnt FROM schedule_item
    WHERE plan_id = NEW.plan_id AND class_id = NEW.class_id AND item_id <> v_self;
    IF v_cnt + 1 > 25 THEN
        RAISE EXCEPTION '班级周课次超限：一周最多 25 个时间段';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_item_conflict
BEFORE INSERT OR UPDATE ON schedule_item
FOR EACH ROW
EXECUTE PROCEDURE fn_trg_check_item_conflict();

-- ============================================
-- 触发器2：同一时间只允许一个启用方案
-- 时机：BEFORE INSERT OR UPDATE ON schedule_plan
-- ============================================
CREATE OR REPLACE FUNCTION fn_trg_single_active_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.is_active = 1 THEN
        IF NEW.hard_conflicts > 0 THEN
            RAISE EXCEPTION '方案仍存在 % 条硬约束冲突，不能启用', NEW.hard_conflicts;
        END IF;
        UPDATE schedule_plan
        SET is_active = 0
        WHERE is_active = 1
          AND plan_id <> COALESCE(NEW.plan_id, -1);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_single_active_plan
BEFORE INSERT OR UPDATE ON schedule_plan
FOR EACH ROW
EXECUTE PROCEDURE fn_trg_single_active_plan();

-- ============================================
-- 触发器3：启用方案时写入审计日志
-- 时机：AFTER UPDATE ON schedule_plan
-- ============================================
CREATE OR REPLACE FUNCTION fn_trg_log_plan_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.is_active = 0 AND NEW.is_active = 1 THEN
        INSERT INTO operation_log (op_time, op_user, action, target, detail)
        VALUES (CURRENT_TIMESTAMP, current_user, '启用排课方案',
                '方案 V' || NEW.version,
                '方案ID=' || NEW.plan_id || '，任务ID=' || NEW.task_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_plan_activation
AFTER UPDATE ON schedule_plan
FOR EACH ROW
EXECUTE PROCEDURE fn_trg_log_plan_activation();

-- ============================================
-- 触发器4：课表条目变更审计
-- 时机：AFTER INSERT OR UPDATE OR DELETE ON schedule_item
-- ============================================
CREATE OR REPLACE FUNCTION fn_trg_audit_schedule_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_action VARCHAR(100);
    v_target VARCHAR(200);
    v_detail VARCHAR(500);
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := '新增课表条目';
        v_target := '课程ID=' || NEW.course_id;
        v_detail := '方案ID=' || NEW.plan_id || '，教室ID=' || NEW.room_id || '，时间段=' || NEW.slot_id;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := '调整课表条目';
        v_target := '课程ID=' || NEW.course_id;
        v_detail := '方案ID=' || NEW.plan_id
                 || '，原：' || OLD.slot_id || '/教室' || OLD.room_id
                 || '，新：' || NEW.slot_id || '/教室' || NEW.room_id;
    ELSE
        v_action := '删除课表条目';
        v_target := '课程ID=' || OLD.course_id;
        v_detail := '方案ID=' || OLD.plan_id || '，原时间段=' || OLD.slot_id;
    END IF;

    INSERT INTO operation_log (op_time, op_user, action, target, detail)
    VALUES (CURRENT_TIMESTAMP, current_user, v_action, v_target, v_detail);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_schedule_item
AFTER UPDATE OR DELETE ON schedule_item
FOR EACH ROW
EXECUTE PROCEDURE fn_trg_audit_schedule_item();

-- ============================================
-- 触发器5：保护当前启用方案不被删除
-- 时机：BEFORE DELETE ON schedule_plan
-- ============================================
CREATE OR REPLACE FUNCTION fn_trg_prevent_active_plan_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.is_active = 1 THEN
        RAISE EXCEPTION '当前启用方案不可删除，请先启用其他方案';
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_active_plan_delete
BEFORE DELETE ON schedule_plan
FOR EACH ROW
EXECUTE PROCEDURE fn_trg_prevent_active_plan_delete();
