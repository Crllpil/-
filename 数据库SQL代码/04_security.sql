-- ============================================
-- 智能校园课程排课与调度系统 — 权限控制 (RBAC)
-- DBMS: openGauss（兼容 PostgreSQL）
-- 角色：系统管理员 / 教务员 / 教师 / 学生
-- ============================================

SET search_path TO campus_schedule;

-- 清理旧角色（演示环境；若角色拥有对象需先转移所有权）
DROP ROLE IF EXISTS app_student;
DROP ROLE IF EXISTS app_teacher;
DROP ROLE IF EXISTS app_scheduler;
DROP ROLE IF EXISTS app_admin;
DROP ROLE IF EXISTS role_student;
DROP ROLE IF EXISTS role_teacher;
DROP ROLE IF EXISTS role_scheduler;
DROP ROLE IF EXISTS role_admin;

-- 业务角色
CREATE ROLE role_admin     WITH PASSWORD 'Admin@2026';
CREATE ROLE role_scheduler WITH PASSWORD 'Scheduler@2026';
CREATE ROLE role_teacher   WITH PASSWORD 'Teacher@2026';
CREATE ROLE role_student   WITH PASSWORD 'Student@2026';

-- 应用登录角色
CREATE ROLE app_admin     WITH PASSWORD 'AppAdmin@2026';
CREATE ROLE app_scheduler WITH PASSWORD 'AppScheduler@2026';
CREATE ROLE app_teacher   WITH PASSWORD 'AppTeacher@2026';
CREATE ROLE app_student   WITH PASSWORD 'AppStudent@2026';

GRANT role_admin     TO app_admin;
GRANT role_scheduler TO app_scheduler;
GRANT role_teacher   TO app_teacher;
GRANT role_student   TO app_student;

-- Schema 权限
GRANT USAGE ON SCHEMA campus_schedule TO role_admin, role_scheduler, role_teacher, role_student;

-- ============================================
-- 系统管理员：全部基础数据、排课与日志
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA campus_schedule TO role_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA campus_schedule TO role_admin;

-- ============================================
-- 教务员：基础数据、排课任务、方案、课表、冲突、报表
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON
    course, teacher, class, classroom, time_slot,
    teacher_preference, schedule_task, schedule_plan,
    schedule_item, conflict, operation_log
TO role_scheduler;

GRANT SELECT ON sys_user, sys_role TO role_scheduler;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA campus_schedule TO role_scheduler;

GRANT SELECT ON
    v_active_plan, v_plan_summary, v_plan_item_detail,
    v_class_timetable, v_teacher_timetable, v_room_timetable,
    v_teacher_workload, v_room_utilization, v_conflict_summary,
    v_teacher_preference_detail
TO role_scheduler;

-- ============================================
-- 教师：查看本人课表、维护时间偏好、写入日志
-- ============================================
GRANT SELECT ON
    teacher, class, course, classroom, time_slot,
    v_active_plan, v_plan_item_detail,
    v_class_timetable, v_teacher_timetable, v_room_timetable,
    v_teacher_workload, v_room_utilization, v_conflict_summary,
    v_teacher_preference_detail
TO role_teacher;

GRANT SELECT, INSERT, UPDATE, DELETE ON teacher_preference TO role_teacher;
GRANT INSERT ON operation_log TO role_teacher;
GRANT USAGE, SELECT ON SEQUENCE teacher_preference_pref_id_seq TO role_teacher;
GRANT USAGE, SELECT ON SEQUENCE operation_log_log_id_seq TO role_teacher;

-- ============================================
-- 学生：只读查看班级课表、课程与教室信息
-- ============================================
GRANT SELECT ON
    class, course, classroom, time_slot,
    v_active_plan, v_plan_item_detail,
    v_class_timetable, v_teacher_timetable, v_room_timetable,
    v_room_utilization
TO role_student;

-- 说明：
-- 1. 行级权限（教师只看本人课表、学生只看本班课表）由 Flask 接口按登录身份过滤。
-- 2. 存储过程/函数的 EXECUTE 权限在 06_procedures.sql 末尾授予。
