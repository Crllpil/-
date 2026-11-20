-- ============================================
-- 智能校园课程排课与调度系统 — 索引定义
-- DBMS: openGauss（兼容 PostgreSQL）
-- 主键索引、唯一约束索引由建表语句自动创建，此处不重复
-- ============================================

SET search_path TO campus_schedule;

-- 用户与角色
CREATE INDEX IF NOT EXISTS idx_user_role       ON sys_user(role_id);
CREATE INDEX IF NOT EXISTS idx_user_teacher    ON sys_user(teacher_id);
CREATE INDEX IF NOT EXISTS idx_user_class      ON sys_user(class_id);
CREATE INDEX IF NOT EXISTS idx_user_status     ON sys_user(status);

-- 教师 / 班级
CREATE INDEX IF NOT EXISTS idx_teacher_name    ON teacher(name);
CREATE INDEX IF NOT EXISTS idx_teacher_dept    ON teacher(department);
CREATE INDEX IF NOT EXISTS idx_class_grade     ON class(grade);
CREATE INDEX IF NOT EXISTS idx_class_major     ON class(major);

-- 课程
CREATE INDEX IF NOT EXISTS idx_course_name     ON course(course_name);
CREATE INDEX IF NOT EXISTS idx_course_teacher  ON course(teacher_id);
CREATE INDEX IF NOT EXISTS idx_course_class    ON course(class_id);
CREATE INDEX IF NOT EXISTS idx_course_semester ON course(semester);
CREATE INDEX IF NOT EXISTS idx_course_type     ON course(course_type);

-- 教室
CREATE INDEX IF NOT EXISTS idx_room_type       ON classroom(room_type);
CREATE INDEX IF NOT EXISTS idx_room_status     ON classroom(status);
CREATE INDEX IF NOT EXISTS idx_room_capacity   ON classroom(capacity);

-- 教师时间偏好
CREATE INDEX IF NOT EXISTS idx_pref_teacher    ON teacher_preference(teacher_id);
CREATE INDEX IF NOT EXISTS idx_pref_slot       ON teacher_preference(slot_id);
CREATE INDEX IF NOT EXISTS idx_pref_level      ON teacher_preference(level);

-- 排课任务与方案
CREATE INDEX IF NOT EXISTS idx_task_status     ON schedule_task(status);
CREATE INDEX IF NOT EXISTS idx_task_semester   ON schedule_task(semester);
CREATE INDEX IF NOT EXISTS idx_plan_task       ON schedule_plan(task_id);
CREATE INDEX IF NOT EXISTS idx_plan_active     ON schedule_plan(is_active);
CREATE INDEX IF NOT EXISTS idx_plan_created    ON schedule_plan(created_at DESC);

-- 课表条目（排课冲突检测与课表查询高频）
CREATE INDEX IF NOT EXISTS idx_item_plan       ON schedule_item(plan_id);
CREATE INDEX IF NOT EXISTS idx_item_teacher    ON schedule_item(teacher_id);
CREATE INDEX IF NOT EXISTS idx_item_class      ON schedule_item(class_id);
CREATE INDEX IF NOT EXISTS idx_item_room       ON schedule_item(room_id);
CREATE INDEX IF NOT EXISTS idx_item_slot       ON schedule_item(slot_id);
CREATE INDEX IF NOT EXISTS idx_item_teacher_slot ON schedule_item(teacher_id, slot_id);
CREATE INDEX IF NOT EXISTS idx_item_class_slot   ON schedule_item(class_id, slot_id);
CREATE INDEX IF NOT EXISTS idx_item_room_slot    ON schedule_item(room_id, slot_id);

-- 冲突记录
CREATE INDEX IF NOT EXISTS idx_conflict_plan   ON conflict(plan_id);
CREATE INDEX IF NOT EXISTS idx_conflict_status ON conflict(status);
CREATE INDEX IF NOT EXISTS idx_conflict_type   ON conflict(conflict_type);

-- 操作日志
CREATE INDEX IF NOT EXISTS idx_log_time        ON operation_log(op_time DESC);
CREATE INDEX IF NOT EXISTS idx_log_user        ON operation_log(op_user);
CREATE INDEX IF NOT EXISTS idx_log_action      ON operation_log(action);
