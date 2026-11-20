-- ============================================
-- 智能校园课程排课与调度系统 — 数据库建表脚本 (DDL)
-- DBMS: openGauss（兼容 PostgreSQL）
-- 运行环境: WSL2 + openEuler + openGauss
-- 对应《用户需求分析报告》第 7 章数据需求
-- ============================================
-- 首次部署：先用超级用户 omm 连接 postgres 库执行：
--   CREATE DATABASE campus_schedule;
-- 然后连接到 campus_schedule 库执行本目录脚本：
--   \c campus_schedule
--   \i 01_ddl_tables.sql
-- ============================================

CREATE SCHEMA IF NOT EXISTS campus_schedule;
SET search_path TO campus_schedule;

-- 按依赖顺序清理旧对象
DROP TABLE IF EXISTS operation_log CASCADE;
DROP TABLE IF EXISTS conflict CASCADE;
DROP TABLE IF EXISTS schedule_item CASCADE;
DROP TABLE IF EXISTS schedule_plan CASCADE;
DROP TABLE IF EXISTS schedule_task CASCADE;
DROP TABLE IF EXISTS teacher_preference CASCADE;
DROP TABLE IF EXISTS course CASCADE;
DROP TABLE IF EXISTS classroom CASCADE;
DROP TABLE IF EXISTS time_slot CASCADE;
DROP TABLE IF EXISTS sys_user CASCADE;
DROP TABLE IF EXISTS class CASCADE;
DROP TABLE IF EXISTS teacher CASCADE;
DROP TABLE IF EXISTS sys_role CASCADE;

-- ============================================
-- 1. 角色表 sys_role
-- ============================================
CREATE TABLE sys_role (
    role_id      VARCHAR(20)  PRIMARY KEY,
    role_name    VARCHAR(50)  NOT NULL,
    description  VARCHAR(200)
);
COMMENT ON TABLE sys_role IS '系统角色表：admin/scheduler/teacher/student';

-- ============================================
-- 2. 教师表 teacher
-- ============================================
CREATE TABLE teacher (
    teacher_id        BIGSERIAL    PRIMARY KEY,
    teacher_no        VARCHAR(30)  NOT NULL UNIQUE,
    name              VARCHAR(50)  NOT NULL,
    title             VARCHAR(20)  DEFAULT '讲师',
    department        VARCHAR(100),
    phone             VARCHAR(30),
    max_weekly_hours  INT          NOT NULL DEFAULT 12
                       CHECK (max_weekly_hours > 0),
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_teacher_title CHECK (title IN ('教授','副教授','讲师','助教'))
);
COMMENT ON TABLE teacher IS '教师信息表';

-- ============================================
-- 3. 班级表 class
-- ============================================
CREATE TABLE class (
    class_id       BIGSERIAL    PRIMARY KEY,
    class_no       VARCHAR(30)  NOT NULL UNIQUE,
    name           VARCHAR(100) NOT NULL,
    grade          VARCHAR(10),
    major          VARCHAR(100),
    student_count  INT          NOT NULL DEFAULT 40 CHECK (student_count > 0),
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE class IS '班级信息表';

-- ============================================
-- 4. 用户表 sys_user
-- ============================================
CREATE TABLE sys_user (
    user_id       BIGSERIAL    PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(128) NOT NULL,
    name          VARCHAR(50)  NOT NULL,
    role_id       VARCHAR(20)  NOT NULL REFERENCES sys_role(role_id),
    teacher_id    BIGINT       REFERENCES teacher(teacher_id) ON DELETE SET NULL,
    class_id      BIGINT       REFERENCES class(class_id) ON DELETE SET NULL,
    status        SMALLINT     NOT NULL DEFAULT 1 CHECK (status IN (0,1)),
    phone         VARCHAR(30),
    last_login    TIMESTAMP,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE sys_user IS '系统用户表';
COMMENT ON COLUMN sys_user.status IS '1-启用，0-停用';
COMMENT ON COLUMN sys_user.password_hash IS 'MD5 密码摘要（演示环境初始密码 123456）';

-- ============================================
-- 5. 课程表 course
-- 教学任务粒度为“课程—教师—班级”
-- ============================================
CREATE TABLE course (
    course_id      BIGSERIAL     PRIMARY KEY,
    course_no      VARCHAR(30)   NOT NULL UNIQUE,
    course_name    VARCHAR(100)  NOT NULL,
    course_type    VARCHAR(30)   NOT NULL DEFAULT '专业必修',
    credit         NUMERIC(3,1)  NOT NULL CHECK (credit > 0 AND credit <= 10),
    total_hours    INT           NOT NULL CHECK (total_hours > 0),
    weekly_hours   INT           NOT NULL CHECK (weekly_hours > 0),
    teacher_id     BIGINT        NOT NULL REFERENCES teacher(teacher_id) ON DELETE RESTRICT,
    class_id       BIGINT        NOT NULL REFERENCES class(class_id) ON DELETE RESTRICT,
    room_type      VARCHAR(20)   NOT NULL DEFAULT '多媒体',
    student_count  INT           NOT NULL CHECK (student_count > 0),
    semester       VARCHAR(30)   NOT NULL DEFAULT '2026-2027-1',
    created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_course_hours CHECK (weekly_hours <= total_hours),
    CONSTRAINT chk_course_room_type CHECK (room_type IN ('多媒体','普通','机房','实验室','体育场','不限'))
);
COMMENT ON TABLE course IS '课程与开课信息表（课程—教师—班级绑定）';
COMMENT ON COLUMN course.weekly_hours IS '每周需要安排的课次数';

-- ============================================
-- 6. 教室表 classroom
-- ============================================
CREATE TABLE classroom (
    room_id     BIGSERIAL    PRIMARY KEY,
    room_no     VARCHAR(30)  NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    building    VARCHAR(50),
    floor       INT          CHECK (floor > 0),
    room_type   VARCHAR(20)  NOT NULL
                CHECK (room_type IN ('多媒体','普通','机房','实验室','体育场')),
    capacity    INT          NOT NULL CHECK (capacity > 0),
    status      VARCHAR(20)  NOT NULL DEFAULT '可用'
                CHECK (status IN ('可用','维修','停用')),
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE classroom IS '教室信息表';

-- ============================================
-- 7. 时间段表 time_slot
-- 采用与前端一致的字符串编号 S11 ~ S55
-- ============================================
CREATE TABLE time_slot (
    slot_id     VARCHAR(10) PRIMARY KEY,
    day         SMALLINT    NOT NULL CHECK (day BETWEEN 1 AND 5),
    period      SMALLINT    NOT NULL CHECK (period BETWEEN 1 AND 5),
    start_time  TIME        NOT NULL,
    end_time    TIME        NOT NULL,
    label       VARCHAR(50) NOT NULL,
    CONSTRAINT uq_time_slot_day_period UNIQUE (day, period)
);
COMMENT ON TABLE time_slot IS '学校统一作息时间段表';

-- ============================================
-- 8. 教师时间偏好表 teacher_preference
-- ============================================
CREATE TABLE teacher_preference (
    pref_id     BIGSERIAL   PRIMARY KEY,
    teacher_id  BIGINT      NOT NULL REFERENCES teacher(teacher_id) ON DELETE CASCADE,
    slot_id     VARCHAR(10) NOT NULL REFERENCES time_slot(slot_id) ON DELETE CASCADE,
    level       VARCHAR(10) NOT NULL CHECK (level IN ('prefer','avoid','forbid')),
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_teacher_pref UNIQUE (teacher_id, slot_id)
);
COMMENT ON TABLE teacher_preference IS '教师时间偏好：prefer-偏好，avoid-回避，forbid-禁止（硬约束）';

-- ============================================
-- 9. 排课任务表 schedule_task
-- ============================================
CREATE TABLE schedule_task (
    task_id       BIGSERIAL    PRIMARY KEY,
    task_name     VARCHAR(100) NOT NULL,
    semester      VARCHAR(30)  NOT NULL,
    algorithm     VARCHAR(20)  NOT NULL DEFAULT 'GA',
    params        TEXT,
    status        VARCHAR(20)  NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','completed','failed')),
    creator_id    BIGINT       REFERENCES sys_user(user_id) ON DELETE SET NULL,
    creator_name  VARCHAR(50),
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE schedule_task IS '排课任务表';

-- ============================================
-- 10. 排课方案表 schedule_plan
-- ============================================
CREATE TABLE schedule_plan (
    plan_id         BIGSERIAL    PRIMARY KEY,
    task_id         BIGINT       NOT NULL REFERENCES schedule_task(task_id) ON DELETE CASCADE,
    version         INT          NOT NULL,
    gen_method      VARCHAR(50)  NOT NULL DEFAULT '自动排课（GA）',
    fitness         NUMERIC(10,4),
    conflict_count  INT          NOT NULL DEFAULT 0,
    hard_conflicts  INT          NOT NULL DEFAULT 0,
    soft_violations INT          NOT NULL DEFAULT 0,
    is_active       SMALLINT     NOT NULL DEFAULT 0 CHECK (is_active IN (0,1)),
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_plan_version UNIQUE (task_id, version)
);
COMMENT ON TABLE schedule_plan IS '排课方案版本表';
COMMENT ON COLUMN schedule_plan.is_active IS '1-当前启用，0-草稿/历史版本';

-- ============================================
-- 11. 课表条目表 schedule_item
-- ============================================
CREATE TABLE schedule_item (
    item_id        BIGSERIAL   PRIMARY KEY,
    plan_id        BIGINT      NOT NULL REFERENCES schedule_plan(plan_id) ON DELETE CASCADE,
    course_id      BIGINT      NOT NULL REFERENCES course(course_id) ON DELETE RESTRICT,
    teacher_id     BIGINT      NOT NULL REFERENCES teacher(teacher_id) ON DELETE RESTRICT,
    class_id       BIGINT      NOT NULL REFERENCES class(class_id) ON DELETE RESTRICT,
    room_id        BIGINT      NOT NULL REFERENCES classroom(room_id) ON DELETE RESTRICT,
    slot_id        VARCHAR(10) NOT NULL REFERENCES time_slot(slot_id) ON DELETE RESTRICT,
    week_no        VARCHAR(50) NOT NULL DEFAULT '1-16',
    day            SMALLINT    NOT NULL CHECK (day BETWEEN 1 AND 5),
    period         SMALLINT    NOT NULL CHECK (period BETWEEN 1 AND 5),
    session_index  INT         NOT NULL DEFAULT 0,
    created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_plan_session UNIQUE (plan_id, course_id, class_id, session_index)
);
COMMENT ON TABLE schedule_item IS '课表条目表，一个方案包含多条条目';

-- ============================================
-- 12. 冲突记录表 conflict
-- ============================================
CREATE TABLE conflict (
    conflict_id    BIGSERIAL    PRIMARY KEY,
    plan_id        BIGINT       NOT NULL REFERENCES schedule_plan(plan_id) ON DELETE CASCADE,
    conflict_type  VARCHAR(50)  NOT NULL,
    entity_id      VARCHAR(50),
    description    VARCHAR(300),
    severity       VARCHAR(10)  NOT NULL DEFAULT 'hard' CHECK (severity IN ('hard','soft')),
    status         VARCHAR(20)  NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE conflict IS '硬约束/软约束冲突记录表';

-- ============================================
-- 13. 操作日志表 operation_log
-- ============================================
CREATE TABLE operation_log (
    log_id    BIGSERIAL     PRIMARY KEY,
    op_time   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    op_user   VARCHAR(50)   NOT NULL,
    action    VARCHAR(100)  NOT NULL,
    target    VARCHAR(200),
    detail    VARCHAR(500)
);
COMMENT ON TABLE operation_log IS '关键操作审计日志表';

-- ============================================
-- 初始化角色数据
-- ============================================
INSERT INTO sys_role (role_id, role_name, description) VALUES
('admin',     '系统管理员', '用户、角色、权限与系统日志管理'),
('scheduler', '教务员',     '基础数据、排课任务、方案与报表管理'),
('teacher',   '教师',       '查看个人课表、维护时间偏好'),
('student',   '学生',       '查看班级课表与教室信息');
