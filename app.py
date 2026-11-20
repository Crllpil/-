# -*- coding: utf-8 -*-
"""
智能校园课程排课与调度系统 — Flask 后端
运行方式（WSL2）：
    su -s /bin/bash - opengauss
    cd /tmp && python3 /mnt/c/Users/13087/Desktop/24050236杨欣豪-24050237余泽凯-24050238钟劲森/app.py

数据库：openGauss（Unix Socket，opengauss 用户）
前端：http://localhost:5000
"""
import os
import json
import hashlib
from decimal import Decimal
from datetime import datetime, date, time
from functools import wraps

from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
import pg8000.native

import scheduler

# ── 配置 ──────────────────────────────────────────
DB = dict(unix_sock='/tmp/.s.PGSQL.5432', database='campus_schedule', user='opengauss', timeout=30)
SCHEMA = 'campus_schedule'
SECRET_KEY = 'campus-schedule-secret-2026'
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, '前端相关代码及文件', 'opengauss-web-project')

app = Flask(__name__)
app.secret_key = SECRET_KEY
app.config['JSON_AS_ASCII'] = False
try:
    app.json.ensure_ascii = False
except Exception:
    pass
CORS(app, supports_credentials=True)

# ── 数据库工具 ─────────────────────────────────────
def _conn():
    c = pg8000.native.Connection(**DB)
    c.run('SET search_path TO ' + SCHEMA)
    return c


def _jsonable(v):
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, datetime):
        return v.strftime('%Y-%m-%d %H:%M')
    if isinstance(v, date):
        return v.strftime('%Y-%m-%d')
    if isinstance(v, time):
        return v.strftime('%H:%M')
    return v


def q(sql, **kw):
    c = _conn()
    try:
        rows = c.run(sql, **kw)
        if not rows:
            return []
        cols = [col['name'] for col in c.columns]
        return [{k: _jsonable(v) for k, v in zip(cols, row)} for row in rows]
    finally:
        c.close()


def q1(sql, **kw):
    rows = q(sql, **kw)
    return rows[0] if rows else None


def ex(sql, **kw):
    c = _conn()
    try:
        c.run(sql, **kw)
    finally:
        c.close()


def ok(data=None, message='ok'):
    return jsonify({'success': True, 'code': 0, 'message': message, 'data': data})


def fail(message, status=400):
    return jsonify({'success': False, 'code': 1, 'message': message}), status


def md5(text):
    return hashlib.md5(str(text).encode('utf-8')).hexdigest()


def to_int(value):
    try:
        return int(value) if value not in (None, '') else None
    except (TypeError, ValueError):
        return None


def coerce(data, int_fields=(), float_fields=()):
    for k in int_fields:
        if data.get(k) not in (None, ''):
            data[k] = int(data[k])
    for k in float_fields:
        if data.get(k) not in (None, ''):
            data[k] = float(data[k])
    return data


def resolve_id(kind, value):
    """把教师工号/班级编号或数字 ID 统一解析为数据库主键。"""
    if value in (None, ''):
        return None
    text = str(value).strip()
    if text.isdigit():
        return int(text)
    if kind == 'teacher':
        row = q1("SELECT teacher_id FROM teacher WHERE teacher_no = :v", v=text)
        return row['teacher_id'] if row else None
    row = q1("SELECT class_id FROM class WHERE class_no = :v", v=text)
    return row['class_id'] if row else None


def parse_params(text):
    if not text:
        return {}
    if isinstance(text, dict):
        return text
    try:
        return json.loads(text)
    except Exception:
        return {}


def add_log(action, target='', detail='', user=None):
    act_user = user or session.get('user_id') or 'system'
    try:
        ex("INSERT INTO operation_log (op_time, op_user, action, target, detail) "
           "VALUES (CURRENT_TIMESTAMP, :u, :a, :t, :d)",
           u=act_user, a=action, t=target, d=detail)
    except Exception:
        pass


def login_required(role=None):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if 'user_id' not in session:
                return fail('请先登录', 401)
            if role:
                allowed = role if isinstance(role, (list, tuple, set)) else [role]
                if session.get('role') not in allowed:
                    return fail('权限不足，需要 %s 角色' % '/'.join(allowed), 403)
            return fn(*args, **kwargs)
        return wrapper
    return deco


# ── 公共查询 ──────────────────────────────────────
def active_plan_id():
    row = q1("SELECT plan_id FROM schedule_plan WHERE is_active = 1 LIMIT 1")
    return row['plan_id'] if row else None


def plan_summary(plan_id=None):
    if plan_id is None:
        plan_id = active_plan_id()
    if plan_id is None:
        return None
    p = q1("""
        SELECT plan_id, task_id, version, gen_method, fitness, conflict_count,
               hard_conflicts, soft_violations, is_active,
               TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
               task_name, item_count
        FROM v_plan_summary
        WHERE plan_id = :p
    """, p=plan_id)
    if not p:
        return None
    p['is_active'] = int(p['is_active'])
    return p


def item_rows(plan_id):
    return q("""
        SELECT item_id, plan_id, course_id, course_name, teacher_id, teacher_name,
               class_id, class_name, room_id, room_name, slot_id, day, period,
               week_no, session_index, student_count, room_type, room_capacity,
               room_no, class_no, teacher_no, slot_label, day_name,
               has_hard_conflict, has_soft_conflict
        FROM v_plan_item_detail
        WHERE plan_id = :p
        ORDER BY day, period, class_id, course_id
    """, p=plan_id)


def conflict_rows(plan_id, severity=None, keyword=None):
    sql = """
        SELECT conflict_id, plan_id, conflict_type, entity_id, description,
               severity, status, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
        FROM conflict
        WHERE plan_id = :p
    """
    params = {'p': plan_id}
    if severity:
        sql += " AND severity = :s"
        params['s'] = severity
    if keyword:
        sql += " AND (conflict_type ILIKE :kw OR description ILIKE :kw)"
        params['kw'] = '%' + keyword + '%'
    sql += " ORDER BY severity, conflict_type, conflict_id"
    return q(sql, **params)


def refresh_conflicts(plan_id):
    """重新扫描方案冲突并更新 conflict 表与方案统计。"""
    ex("DELETE FROM conflict WHERE plan_id = :p", p=plan_id)
    ex("""
        INSERT INTO conflict (plan_id, conflict_type, entity_id, description, severity, status)
        SELECT i.plan_id, '教师冲突', CAST(i.item_id AS VARCHAR),
               '教师 ' || t.name || ' 在 ' || s.label || ' 被安排多门课程', 'hard', 'open'
        FROM schedule_item i
        JOIN teacher t ON i.teacher_id = t.teacher_id
        JOIN time_slot s ON i.slot_id = s.slot_id
        WHERE i.plan_id = :p AND EXISTS (
            SELECT 1 FROM schedule_item j
            WHERE j.plan_id = i.plan_id AND j.teacher_id = i.teacher_id
              AND j.slot_id = i.slot_id AND j.item_id <> i.item_id)
    """, p=plan_id)
    ex("""
        INSERT INTO conflict (plan_id, conflict_type, entity_id, description, severity, status)
        SELECT i.plan_id, '班级冲突', CAST(i.item_id AS VARCHAR),
               '班级 ' || c.name || ' 在 ' || s.label || ' 同时安排多门课程', 'hard', 'open'
        FROM schedule_item i
        JOIN class c ON i.class_id = c.class_id
        JOIN time_slot s ON i.slot_id = s.slot_id
        WHERE i.plan_id = :p AND EXISTS (
            SELECT 1 FROM schedule_item j
            WHERE j.plan_id = i.plan_id AND j.class_id = i.class_id
              AND j.slot_id = i.slot_id AND j.item_id <> i.item_id)
    """, p=plan_id)
    ex("""
        INSERT INTO conflict (plan_id, conflict_type, entity_id, description, severity, status)
        SELECT i.plan_id, '教室冲突', CAST(i.item_id AS VARCHAR),
               '教室 ' || r.name || ' 在 ' || s.label || ' 被多个教学任务占用', 'hard', 'open'
        FROM schedule_item i
        JOIN classroom r ON i.room_id = r.room_id
        JOIN time_slot s ON i.slot_id = s.slot_id
        WHERE i.plan_id = :p AND EXISTS (
            SELECT 1 FROM schedule_item j
            WHERE j.plan_id = i.plan_id AND j.room_id = i.room_id
              AND j.slot_id = i.slot_id AND j.item_id <> i.item_id)
    """, p=plan_id)
    ex("""
        INSERT INTO conflict (plan_id, conflict_type, entity_id, description, severity, status)
        SELECT i.plan_id, '教室容量不足', CAST(i.item_id AS VARCHAR),
               '课程 ' || c.course_name || ' 修读人数 ' || c.student_count
               || ' 超过 ' || r.name || ' 容量 ' || r.capacity, 'hard', 'open'
        FROM schedule_item i
        JOIN course c ON i.course_id = c.course_id
        JOIN classroom r ON i.room_id = r.room_id
        WHERE i.plan_id = :p AND r.capacity < c.student_count
    """, p=plan_id)
    ex("""
        INSERT INTO conflict (plan_id, conflict_type, entity_id, description, severity, status)
        SELECT i.plan_id, '教室类型不匹配', CAST(i.item_id AS VARCHAR),
               '课程 ' || c.course_name || ' 需要 ' || c.room_type
               || '，当前教室为 ' || r.room_type, 'hard', 'open'
        FROM schedule_item i
        JOIN course c ON i.course_id = c.course_id
        JOIN classroom r ON i.room_id = r.room_id
        WHERE i.plan_id = :p AND c.room_type <> '不限' AND c.room_type <> r.room_type
    """, p=plan_id)
    ex("""
        INSERT INTO conflict (plan_id, conflict_type, entity_id, description, severity, status)
        SELECT i.plan_id, '教师禁止时段', CAST(i.item_id AS VARCHAR),
               '教师 ' || t.name || ' 的禁止时段 ' || s.label || ' 被安排 ' || c.course_name,
               'hard', 'open'
        FROM schedule_item i
        JOIN teacher t ON i.teacher_id = t.teacher_id
        JOIN time_slot s ON i.slot_id = s.slot_id
        JOIN course c ON i.course_id = c.course_id
        JOIN teacher_preference p ON p.teacher_id = i.teacher_id AND p.slot_id = i.slot_id
        WHERE i.plan_id = :p AND p.level = 'forbid'
    """, p=plan_id)
    ex("""
        INSERT INTO conflict (plan_id, conflict_type, entity_id, description, severity, status)
        SELECT i.plan_id, '教师时间偏好', CAST(i.item_id AS VARCHAR),
               '教师 ' || t.name || ' 的回避时段 ' || s.label || ' 被安排 ' || c.course_name,
               'soft', 'open'
        FROM schedule_item i
        JOIN teacher t ON i.teacher_id = t.teacher_id
        JOIN time_slot s ON i.slot_id = s.slot_id
        JOIN course c ON i.course_id = c.course_id
        JOIN teacher_preference p ON p.teacher_id = i.teacher_id AND p.slot_id = i.slot_id
        WHERE i.plan_id = :p AND p.level = 'avoid'
    """, p=plan_id)
    counts = q1("""
        SELECT COALESCE(SUM(CASE WHEN severity='hard' THEN 1 ELSE 0 END),0) AS hard,
               COALESCE(SUM(CASE WHEN severity='soft' THEN 1 ELSE 0 END),0) AS soft
        FROM conflict WHERE plan_id = :p
    """, p=plan_id)
    ex("UPDATE schedule_plan SET conflict_count = :c, hard_conflicts = :h, soft_violations = :s "
       "WHERE plan_id = :p",
       c=int(counts['hard']) + int(counts['soft']), h=int(counts['hard']),
       s=int(counts['soft']), p=plan_id)
    return int(counts['hard']), int(counts['soft'])


def load_scheduler_db():
    return {
        'courses': q("""
            SELECT course_id, course_no, course_name, course_type, credit,
                   total_hours, weekly_hours, teacher_id, class_id,
                   room_type, student_count, semester
            FROM course ORDER BY course_id
        """),
        'teachers': q("SELECT teacher_id, teacher_no, name, title, department, max_weekly_hours FROM teacher"),
        'classes': q("SELECT class_id, class_no, name, grade, major, student_count FROM class"),
        'classrooms': q("SELECT room_id, room_no, name, building, room_type, capacity, status FROM classroom"),
        'time_slots': q("SELECT slot_id, day, period, start_time, end_time, label FROM time_slot ORDER BY day, period"),
        'teacher_preferences': q("SELECT teacher_id, slot_id, level FROM teacher_preference"),
    }


# ── 认证 ─────────────────────────────────────────
@app.route('/login', methods=['POST'])
def login():
    d = request.get_json(silent=True) or {}
    uid = (d.get('uid') or '').strip()
    pwd = (d.get('password') or '').strip()
    role = (d.get('role') or '').strip().lower()
    if not uid or not pwd or not role:
        return fail('账号、密码和角色不能为空')

    u = q1("""
        SELECT user_id, username, password_hash, name, role_id, teacher_id, class_id, status
        FROM sys_user WHERE username = :u AND role_id = :r
    """, u=uid, r=role)
    if not u:
        return fail('账号或角色不匹配', 401)
    if int(u['status']) != 1:
        return fail('账号已停用，请联系管理员', 403)
    if u['password_hash'] != md5(pwd):
        return fail('密码错误', 401)

    session.permanent = True
    session.update({
        'user_id': u['username'], 'db_user_id': u['user_id'], 'role': u['role_id'],
        'name': u['name'], 'teacher_id': u['teacher_id'], 'class_id': u['class_id'],
    })
    ex("UPDATE sys_user SET last_login = CURRENT_TIMESTAMP WHERE user_id = :id", id=u['user_id'])
    add_log('登录系统', '系统', u['name'] + ' 登录系统', user=u['username'])
    data = {
        'user_id': u['user_id'], 'uid': u['username'], 'name': u['name'],
        'role': u['role_id'], 'teacher_id': u['teacher_id'], 'class_id': u['class_id'],
        'token': 'session',
    }
    return ok(data, '登录成功')


@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return ok(None, '已退出')


# ── 系统概览 ─────────────────────────────────────
@app.route('/api/meta')
@login_required()
def api_meta():
    return ok({
        'counts': {
            'courses': q1("SELECT COUNT(*) AS c FROM course")['c'],
            'teachers': q1("SELECT COUNT(*) AS c FROM teacher")['c'],
            'classes': q1("SELECT COUNT(*) AS c FROM class")['c'],
            'classrooms': q1("SELECT COUNT(*) AS c FROM classroom")['c'],
            'users': q1("SELECT COUNT(*) AS c FROM sys_user")['c'],
        },
        'active_plan': plan_summary(),
    })


# ── 系统管理员 ─────────────────────────────────────
@app.route('/api/admin/dashboard')
@login_required('admin')
def admin_dashboard():
    plan = plan_summary()
    conflicts = {'hard': 0, 'soft': 0}
    if plan:
        conflicts = {'hard': int(plan['hard_conflicts']), 'soft': int(plan['soft_violations'])}
    role_stats = {r['role_id']: r['c'] for r in q(
        "SELECT role_id, COUNT(*) AS c FROM sys_user GROUP BY role_id")}
    return ok({
        'total_users': q1("SELECT COUNT(*) AS c FROM sys_user")['c'],
        'total_teachers': q1("SELECT COUNT(*) AS c FROM teacher")['c'],
        'total_courses': q1("SELECT COUNT(*) AS c FROM course")['c'],
        'total_classes': q1("SELECT COUNT(*) AS c FROM class")['c'],
        'total_rooms': q1("SELECT COUNT(*) AS c FROM classroom")['c'],
        'active_plan': plan,
        'conflicts': conflicts,
        'role_stats': role_stats,
        'recent_logs': q("""
            SELECT log_id, TO_CHAR(op_time,'YYYY-MM-DD HH24:MI') AS op_time,
                   op_user, action, target, detail
            FROM operation_log ORDER BY op_time DESC LIMIT 8
        """),
    })


@app.route('/api/admin/users', methods=['GET', 'POST'])
@login_required('admin')
def admin_users():
    if request.method == 'GET':
        return ok(q("""
            SELECT u.user_id, u.username, u.name, u.role_id AS role, u.teacher_id, u.class_id,
                   u.status, u.phone, t.teacher_no, cl.class_no,
                   TO_CHAR(u.last_login,'YYYY-MM-DD HH24:MI') AS last_login,
                   TO_CHAR(u.created_at,'YYYY-MM-DD HH24:MI') AS created_at
            FROM sys_user u
            LEFT JOIN teacher t ON u.teacher_id = t.teacher_id
            LEFT JOIN class cl ON u.class_id = cl.class_id
            ORDER BY u.user_id
        """))
    d = request.get_json(silent=True) or {}
    username = (d.get('username') or '').strip()
    name = (d.get('name') or '').strip()
    role = d.get('role')
    if not username or not name or not role:
        return fail('请填写用户名、姓名和角色')
    if q1("SELECT 1 AS x FROM sys_user WHERE username = :u", u=username):
        return fail('用户名已存在')
    try:
        row = q1("""
            INSERT INTO sys_user (username, password_hash, name, role_id, teacher_id,
                                  class_id, status, phone)
            VALUES (:u, :pwd, :n, :r, :t, :c, :s, :ph)
            RETURNING user_id, username, name, role_id AS role, teacher_id, class_id, status
        """, u=username, pwd=md5('123456'), n=name, r=role,
             t=resolve_id('teacher', d.get('teacher_id')), c=resolve_id('class', d.get('class_id')),
             s=int(d.get('status', 1)), ph=d.get('phone'))
        add_log('新增用户', username, '角色：' + str(role))
        return ok(row, '新增成功')
    except Exception as e:
        return fail('新增失败：' + str(e))


@app.route('/api/admin/users/<int:user_id>', methods=['PUT', 'DELETE'])
@login_required('admin')
def admin_user_detail(user_id):
    row = q1("SELECT * FROM sys_user WHERE user_id = :id", id=user_id)
    if not row:
        return fail('用户不存在', 404)
    if request.method == 'DELETE':
        if row['username'] == 'admin_01':
            return fail('不能删除内置管理员账号')
        try:
            ex("DELETE FROM sys_user WHERE user_id = :id", id=user_id)
            add_log('删除用户', row['username'], '删除用户账号')
            return ok(None, '删除成功')
        except Exception as e:
            return fail('删除失败：' + str(e))
    d = request.get_json(silent=True) or {}
    try:
        ex("""
            UPDATE sys_user SET name = :n, role_id = :r, teacher_id = :t,
                   class_id = :c, status = :s, phone = :ph
            WHERE user_id = :id
        """, n=d.get('name') or row['name'], r=d.get('role') or row['role_id'],
             t=resolve_id('teacher', d.get('teacher_id')), c=resolve_id('class', d.get('class_id')),
             s=int(d.get('status', row['status'])), ph=d.get('phone'), id=user_id)
        add_log('修改用户', row['username'], '更新用户信息')
        return ok(None, '更新成功')
    except Exception as e:
        return fail('更新失败：' + str(e))


@app.route('/api/admin/roles')
@login_required('admin')
def admin_roles():
    return ok(q("SELECT role_id, role_name, description FROM sys_role ORDER BY role_id"))


@app.route('/api/admin/logs')
@login_required('admin')
def admin_logs():
    kw = (request.args.get('keyword') or '').strip()
    sql = """SELECT log_id, TO_CHAR(op_time,'YYYY-MM-DD HH24:MI') AS op_time,
                    op_user, action, target, detail FROM operation_log"""
    params = {}
    if kw:
        sql += " WHERE op_user ILIKE :kw OR action ILIKE :kw OR target ILIKE :kw OR detail ILIKE :kw"
        params['kw'] = '%' + kw + '%'
    sql += " ORDER BY op_time DESC, log_id DESC LIMIT 300"
    return ok(q(sql, **params))


# ── 教务员概览 ─────────────────────────────────────
@app.route('/api/scheduler/dashboard')
@login_required('scheduler')
def scheduler_dashboard():
    plan = plan_summary()
    conflicts = {'hard': 0, 'soft': 0}
    utilization = 0
    if plan:
        conflicts = {'hard': int(plan['hard_conflicts']), 'soft': int(plan['soft_violations'])}
        util = q1("""
            SELECT ROUND(COUNT(i.item_id) * 100.0 /
                   NULLIF((SELECT COUNT(*) * 25 FROM classroom WHERE status='可用'), 0), 1) AS rate
            FROM schedule_item i WHERE i.plan_id = :p
        """, p=plan['plan_id'])
        utilization = float(util['rate'] or 0) if util else 0
    tasks = q("""
        SELECT task_id, task_name, semester, algorithm, params, status, creator_name,
               TO_CHAR(created_at,'YYYY-MM-DD HH24:MI') AS created_at
        FROM schedule_task ORDER BY created_at DESC, task_id DESC LIMIT 5
    """)
    for t in tasks:
        t['params'] = parse_params(t.get('params'))
    return ok({
        'total_courses': q1("SELECT COUNT(*) AS c FROM course")['c'],
        'total_teachers': q1("SELECT COUNT(*) AS c FROM teacher")['c'],
        'total_classes': q1("SELECT COUNT(*) AS c FROM class")['c'],
        'total_rooms': q1("SELECT COUNT(*) AS c FROM classroom")['c'],
        'active_plan': plan,
        'conflicts': conflicts,
        'utilization': utilization,
        'recent_tasks': tasks,
        'recent_logs': q("""
            SELECT log_id, TO_CHAR(op_time,'YYYY-MM-DD HH24:MI') AS op_time,
                   op_user, action, target, detail
            FROM operation_log ORDER BY op_time DESC LIMIT 6
        """),
    })


# ── 基础数据 CRUD ─────────────────────────────────
def _insert(table, data, allowed, returning='*'):
    cols = [c for c in allowed if data.get(c) is not None]
    if not cols:
        raise ValueError('没有有效字段')
    params = {'p%d' % i: data[c] for i, c in enumerate(cols)}
    ph = ','.join(':p%d' % i for i in range(len(cols)))
    return q1("INSERT INTO %s (%s) VALUES (%s) RETURNING %s"
              % (table, ','.join(cols), ph, returning), **params)


def _update(table, id_col, obj_id, data, allowed, returning='*'):
    cols = [c for c in allowed if c in data and data.get(c) is not None]
    if not cols:
        raise ValueError('没有有效更新字段')
    params = {'p%d' % i: data[c] for i, c in enumerate(cols)}
    sets = ','.join('%s=:p%d' % (c, i) for i, c in enumerate(cols))
    params['_id'] = obj_id
    return q1("UPDATE %s SET %s WHERE %s=:_id RETURNING %s"
              % (table, sets, id_col, returning), **params)


@app.route('/api/courses', methods=['GET', 'POST'])
@login_required(['scheduler', 'admin'])
def courses():
    if request.method == 'GET':
        return ok(q("""
            SELECT c.course_id, c.course_no, c.course_name, c.course_type, c.credit,
                   c.total_hours, c.weekly_hours, c.teacher_id, c.class_id, c.room_type,
                   c.student_count, c.semester,
                   t.name AS teacher_name, cl.name AS class_name
            FROM course c
            JOIN teacher t ON c.teacher_id = t.teacher_id
            JOIN class cl ON c.class_id = cl.class_id
            ORDER BY c.course_id
        """))
    d = coerce(request.get_json(silent=True) or {},
               ('teacher_id', 'class_id', 'total_hours', 'weekly_hours', 'student_count'),
               ('credit',))
    for k in ('course_no', 'course_name', 'teacher_id', 'class_id', 'weekly_hours'):
        if d.get(k) in (None, ''):
            return fail('缺少必填字段：' + k)
    try:
        row = _insert('course', d, [
            'course_no', 'course_name', 'course_type', 'credit', 'total_hours',
            'weekly_hours', 'teacher_id', 'class_id', 'room_type', 'student_count', 'semester'])
        add_log('新增课程', d['course_no'], d['course_name'])
        return ok(row, '新增成功')
    except Exception as e:
        return fail('新增失败：' + str(e))


@app.route('/api/courses/<int:course_id>', methods=['PUT', 'DELETE'])
@login_required(['scheduler', 'admin'])
def course_detail(course_id):
    row = q1("SELECT * FROM course WHERE course_id = :id", id=course_id)
    if not row:
        return fail('课程不存在', 404)
    if request.method == 'DELETE':
        try:
            ex("DELETE FROM course WHERE course_id = :id", id=course_id)
            add_log('删除课程', row['course_no'], row['course_name'])
            return ok(None, '删除成功')
        except Exception as e:
            return fail('删除失败：该课程可能已参与排课（' + str(e) + '）')
    d = coerce(request.get_json(silent=True) or {},
               ('teacher_id', 'class_id', 'total_hours', 'weekly_hours', 'student_count'),
               ('credit',))
    try:
        _update('course', 'course_id', course_id, d, [
            'course_no', 'course_name', 'course_type', 'credit', 'total_hours',
            'weekly_hours', 'teacher_id', 'class_id', 'room_type', 'student_count', 'semester'])
        add_log('修改课程', row['course_no'], row['course_name'])
        return ok(None, '更新成功')
    except Exception as e:
        return fail('更新失败：' + str(e))


@app.route('/api/teachers', methods=['GET', 'POST'])
@login_required(['scheduler', 'admin'])
def teachers():
    if request.method == 'GET':
        return ok(q("""
            SELECT t.*, (SELECT COUNT(*) FROM teacher_preference p
                         WHERE p.teacher_id = t.teacher_id) AS pref_count
            FROM teacher t ORDER BY t.teacher_id
        """))
    d = coerce(request.get_json(silent=True) or {}, ('max_weekly_hours',))
    if not d.get('teacher_no') or not d.get('name'):
        return fail('请填写工号和姓名')
    try:
        row = _insert('teacher', d, [
            'teacher_no', 'name', 'title', 'department', 'phone', 'max_weekly_hours'])
        add_log('新增教师', d['teacher_no'], d['name'])
        return ok(row, '新增成功')
    except Exception as e:
        return fail('新增失败：' + str(e))


@app.route('/api/teachers/<int:teacher_id>', methods=['PUT', 'DELETE'])
@login_required(['scheduler', 'admin'])
def teacher_detail(teacher_id):
    row = q1("SELECT * FROM teacher WHERE teacher_id = :id", id=teacher_id)
    if not row:
        return fail('教师不存在', 404)
    if request.method == 'DELETE':
        try:
            ex("DELETE FROM teacher WHERE teacher_id = :id", id=teacher_id)
            add_log('删除教师', row['teacher_no'], row['name'])
            return ok(None, '删除成功')
        except Exception as e:
            return fail('删除失败：该教师仍承担课程（' + str(e) + '）')
    d = coerce(request.get_json(silent=True) or {}, ('max_weekly_hours',))
    try:
        _update('teacher', 'teacher_id', teacher_id, d, [
            'teacher_no', 'name', 'title', 'department', 'phone', 'max_weekly_hours'])
        add_log('修改教师', row['teacher_no'], row['name'])
        return ok(None, '更新成功')
    except Exception as e:
        return fail('更新失败：' + str(e))


@app.route('/api/classes', methods=['GET', 'POST'])
@login_required(['scheduler', 'admin'])
def classes():
    if request.method == 'GET':
        return ok(q("SELECT * FROM class ORDER BY class_id"))
    d = coerce(request.get_json(silent=True) or {}, ('student_count',))
    if not d.get('class_no') or not d.get('name'):
        return fail('请填写班级编号和名称')
    try:
        row = _insert('class', d, ['class_no', 'name', 'grade', 'major', 'student_count'])
        add_log('新增班级', d['class_no'], d['name'])
        return ok(row, '新增成功')
    except Exception as e:
        return fail('新增失败：' + str(e))


@app.route('/api/classes/<int:class_id>', methods=['PUT', 'DELETE'])
@login_required(['scheduler', 'admin'])
def class_detail(class_id):
    row = q1("SELECT * FROM class WHERE class_id = :id", id=class_id)
    if not row:
        return fail('班级不存在', 404)
    if request.method == 'DELETE':
        try:
            ex("DELETE FROM class WHERE class_id = :id", id=class_id)
            add_log('删除班级', row['class_no'], row['name'])
            return ok(None, '删除成功')
        except Exception as e:
            return fail('删除失败：该班级仍有课程（' + str(e) + '）')
    d = coerce(request.get_json(silent=True) or {}, ('student_count',))
    try:
        _update('class', 'class_id', class_id, d, ['class_no', 'name', 'grade', 'major', 'student_count'])
        add_log('修改班级', row['class_no'], row['name'])
        return ok(None, '更新成功')
    except Exception as e:
        return fail('更新失败：' + str(e))


@app.route('/api/classrooms', methods=['GET', 'POST'])
@login_required(['scheduler', 'admin'])
def classrooms():
    if request.method == 'GET':
        return ok(q("SELECT * FROM classroom ORDER BY room_id"))
    d = coerce(request.get_json(silent=True) or {}, ('floor', 'capacity'))
    if not d.get('room_no') or not d.get('name'):
        return fail('请填写教室编号和名称')
    try:
        row = _insert('classroom', d, ['room_no', 'name', 'building', 'floor', 'room_type', 'capacity', 'status'])
        add_log('新增教室', d['room_no'], d['name'])
        return ok(row, '新增成功')
    except Exception as e:
        return fail('新增失败：' + str(e))


@app.route('/api/classrooms/<int:room_id>', methods=['PUT', 'DELETE'])
@login_required(['scheduler', 'admin'])
def classroom_detail(room_id):
    row = q1("SELECT * FROM classroom WHERE room_id = :id", id=room_id)
    if not row:
        return fail('教室不存在', 404)
    if request.method == 'DELETE':
        try:
            ex("DELETE FROM classroom WHERE room_id = :id", id=room_id)
            add_log('删除教室', row['room_no'], row['name'])
            return ok(None, '删除成功')
        except Exception as e:
            return fail('删除失败：该教室已被排课使用（' + str(e) + '）')
    d = coerce(request.get_json(silent=True) or {}, ('floor', 'capacity'))
    try:
        _update('classroom', 'room_id', room_id, d, ['room_no', 'name', 'building', 'floor', 'room_type', 'capacity', 'status'])
        add_log('修改教室', row['room_no'], row['name'])
        return ok(None, '更新成功')
    except Exception as e:
        return fail('更新失败：' + str(e))


@app.route('/api/time-slots')
@login_required()
def time_slots():
    return ok(q("SELECT slot_id, day, period, start_time, end_time, label FROM time_slot ORDER BY day, period"))


# ── 教师时间偏好 ───────────────────────────────────
@app.route('/api/preferences')
@login_required(['scheduler', 'admin'])
def preferences():
    tid = to_int(request.args.get('teacher_id'))
    if tid:
        return ok(q("SELECT pref_id, teacher_id, slot_id, level FROM teacher_preference WHERE teacher_id = :t ORDER BY slot_id", t=tid))
    return ok(q("SELECT pref_id, teacher_id, slot_id, level FROM teacher_preference ORDER BY teacher_id, slot_id"))


@app.route('/api/teacher/preferences', methods=['GET', 'PUT'])
@login_required(['teacher', 'scheduler', 'admin'])
def teacher_preferences():
    if request.method == 'GET':
        tid = to_int(request.args.get('teacher_id')) or session.get('teacher_id')
        if not tid:
            return fail('缺少教师身份', 403)
        return ok(q("SELECT pref_id, teacher_id, slot_id, level FROM teacher_preference WHERE teacher_id = :t ORDER BY slot_id", t=tid))
    d = request.get_json(silent=True) or {}
    tid = session.get('teacher_id') if session.get('role') == 'teacher' else to_int(d.get('teacher_id'))
    if not tid:
        return fail('缺少教师编号')
    try:
        ex("DELETE FROM teacher_preference WHERE teacher_id = :t", t=tid)
        for item in d.get('preferences') or []:
            if not item.get('slot_id') or item.get('level') not in ('prefer', 'avoid', 'forbid'):
                continue
            ex("INSERT INTO teacher_preference (teacher_id, slot_id, level) VALUES (:t, :s, :l)",
               t=tid, s=item['slot_id'], l=item['level'])
        add_log('维护时间偏好', '教师ID=' + str(tid), '更新时间偏好')
        return ok(None, '时间偏好保存成功')
    except Exception as e:
        return fail('保存失败：' + str(e))


# ── 排课任务 ─────────────────────────────────────
def _task_view(t):
    t = dict(t)
    t['params'] = parse_params(t.get('params'))
    return t


@app.route('/api/schedule-tasks', methods=['GET', 'POST'])
@login_required(['scheduler', 'admin'])
def schedule_tasks():
    if request.method == 'GET':
        return ok([_task_view(t) for t in q("""
            SELECT task_id, task_name, semester, algorithm, params, status,
                   creator_name, TO_CHAR(created_at,'YYYY-MM-DD HH24:MI') AS created_at
            FROM schedule_task ORDER BY created_at DESC, task_id DESC
        """)])
    d = request.get_json(silent=True) or {}
    if not d.get('task_name'):
        return fail('请输入任务名称')
    params = d.get('params') or {
        'populationSize': 20, 'generations': 50, 'timeLimit': 600,
        'weights': {'preference': 0.3, 'distribution': 0.2, 'utilization': 0.15,
                    'gap': 0.2, 'consecutive': 0.15},
    }
    row = q1("""
        INSERT INTO schedule_task (task_name, semester, algorithm, params, status, creator_id, creator_name)
        VALUES (:n, :sem, :alg, :p, 'pending', :uid, :uname)
        RETURNING task_id, task_name, semester, algorithm, params, status, creator_name,
                  TO_CHAR(created_at,'YYYY-MM-DD HH24:MI') AS created_at
    """, n=d['task_name'], sem=d.get('semester') or '2026-2027-1',
         alg=d.get('algorithm') or 'GA', p=json.dumps(params, ensure_ascii=False),
         uid=session.get('db_user_id'), uname=session.get('name'))
    add_log('创建排课任务', d['task_name'], '算法：' + (d.get('algorithm') or 'GA'))
    return ok(_task_view(row), '创建成功')


@app.route('/api/schedule-tasks/<int:task_id>', methods=['DELETE'])
@login_required(['scheduler', 'admin'])
def delete_schedule_task(task_id):
    row = q1("SELECT * FROM schedule_task WHERE task_id = :id", id=task_id)
    if not row:
        return fail('排课任务不存在', 404)
    try:
        ex("DELETE FROM schedule_task WHERE task_id = :id", id=task_id)
        add_log('删除排课任务', row['task_name'], '')
        return ok(None, '任务已删除')
    except Exception as e:
        return fail('删除失败：' + str(e))


@app.route('/api/schedule-tasks/<int:task_id>/run', methods=['POST'])
@login_required(['scheduler', 'admin'])
def run_schedule_task(task_id):
    task = q1("SELECT * FROM schedule_task WHERE task_id = :id", id=task_id)
    if not task:
        return fail('排课任务不存在', 404)
    params = parse_params(task.get('params'))
    body = request.get_json(silent=True) or {}
    if body.get('params'):
        params.update(body['params'])
    if not params.get('seed'):
        params['seed'] = datetime.now().microsecond + task_id * 1000

    ex("UPDATE schedule_task SET status='running' WHERE task_id = :id", id=task_id)
    plan_id = None
    try:
        db = load_scheduler_db()
        result = scheduler.run(db, params)
        stats = result['stats']
        if stats['hard'] > 0:
            raise RuntimeError('算法未能满足全部硬约束，硬冲突数：%d' % stats['hard'])

        version = q1("SELECT COALESCE(MAX(version),0) + 1 AS v FROM schedule_plan WHERE task_id = :t",
                     t=task_id)['v']
        gen_method = '自动排课（%s）' % (task.get('algorithm') or 'GA')
        plan = q1("""
            INSERT INTO schedule_plan (task_id, version, gen_method, fitness,
                                       conflict_count, hard_conflicts, soft_violations, is_active)
            VALUES (:t, :v, :m, :f, 0, 0, 0, 0)
            RETURNING plan_id
        """, t=task_id, v=version, m=gen_method, f=stats['fitness'])
        plan_id = plan['plan_id']

        for it in result['items']:
            ex("""
                INSERT INTO schedule_item (plan_id, course_id, teacher_id, class_id,
                                           room_id, slot_id, week_no, day, period, session_index)
                VALUES (:p, :c, :t, :cl, :r, :s, :w, :d, :pe, :si)
            """, p=plan_id, c=it['course_id'], t=it['teacher_id'], cl=it['class_id'],
                 r=it['room_id'], s=it['slot_id'], w=it['week_no'], d=it['day'],
                 pe=it['period'], si=it['session_index'])

        hard, soft = refresh_conflicts(plan_id)
        if hard > 0:
            raise RuntimeError('生成方案仍存在硬冲突：%d' % hard)
        if active_plan_id() is None:
            ex("UPDATE schedule_plan SET is_active = 1 WHERE plan_id = :p", p=plan_id)

        ex("UPDATE schedule_task SET status='completed' WHERE task_id = :id", id=task_id)
        add_log('运行自动排课', task['task_name'],
                '生成方案 V%d，适应度 %.4f' % (version, stats['fitness']))
        summary = plan_summary(plan_id)
        return ok({
            'plan_id': plan_id, 'version': version, 'fitness': summary['fitness'],
            'conflict_count': summary['conflict_count'], 'hard_conflicts': summary['hard_conflicts'],
            'stats': stats, 'logs': result['logs'],
        }, '排课完成')
    except Exception as e:
        if plan_id:
            try:
                ex("DELETE FROM schedule_plan WHERE plan_id = :p", p=plan_id)
            except Exception:
                pass
        ex("UPDATE schedule_task SET status='failed' WHERE task_id = :id", id=task_id)
        return fail('排课失败：' + str(e), 500)


# ── 排课方案 ─────────────────────────────────────
@app.route('/api/plans')
@login_required()
def plans():
    task_id = to_int(request.args.get('task_id'))
    sql = """
        SELECT plan_id, task_id, version, gen_method, fitness, conflict_count,
               hard_conflicts, soft_violations, is_active,
               TO_CHAR(created_at,'YYYY-MM-DD HH24:MI') AS created_at,
               task_name, item_count
        FROM v_plan_summary
    """
    params = {}
    if task_id:
        sql += " WHERE task_id = :t"
        params['t'] = task_id
    sql += " ORDER BY created_at DESC, version DESC"
    rows = q(sql, **params)
    for r in rows:
        r['is_active'] = int(r['is_active'])
    return ok(rows)


@app.route('/api/plans/<int:plan_id>/items')
@login_required()
def plan_items(plan_id):
    p = plan_summary(plan_id)
    if not p:
        return fail('排课方案不存在', 404)
    return ok({'plan': p, 'items': item_rows(plan_id)})


@app.route('/api/plans/<int:plan_id>/conflicts')
@login_required()
def plan_conflicts(plan_id):
    if not plan_summary(plan_id):
        return fail('排课方案不存在', 404)
    return ok(conflict_rows(plan_id, request.args.get('severity'), request.args.get('keyword')))


@app.route('/api/plans/<int:plan_id>/activate', methods=['POST'])
@login_required(['scheduler', 'admin'])
def activate_plan(plan_id):
    p = plan_summary(plan_id)
    if not p:
        return fail('排课方案不存在', 404)
    if int(p['hard_conflicts']) > 0:
        return fail('该方案仍存在硬约束冲突，不能启用')
    try:
        ex("UPDATE schedule_plan SET is_active = 1 WHERE plan_id = :p", p=plan_id)
        add_log('启用排课方案', '方案 V' + str(p['version']), '设为当前启用方案')
        return ok(plan_summary(plan_id), '方案已启用')
    except Exception as e:
        return fail('启用失败：' + str(e))


@app.route('/api/plans/<int:plan_id>/compare')
@login_required()
def compare_plans(plan_id):
    other_id = to_int(request.args.get('other'))
    if not other_id:
        return fail('缺少对比方案')
    a = plan_summary(plan_id)
    b = plan_summary(other_id)
    if not a or not b:
        return fail('对比方案不存在', 404)
    a_items = q("SELECT item_id, course_id, course_name, class_id, class_no, session_index, slot_id, slot_label, room_id, room_name FROM v_plan_item_detail WHERE plan_id = :p", p=plan_id)
    b_items = q("SELECT item_id, course_id, course_name, class_id, class_no, session_index, slot_id, slot_label, room_id, room_name FROM v_plan_item_detail WHERE plan_id = :p", p=other_id)
    key = lambda x: (x['course_id'], x['class_id'], x['session_index'])
    amap = {key(x): x for x in a_items}
    bmap = {key(x): x for x in b_items}
    changes = []
    for k, x in amap.items():
        y = bmap.get(k)
        if not y:
            changes.append({'course_name': x['course_name'], 'class_id': x['class_no'], 'type': '仅当前方案存在', 'from': '', 'to': ''})
        elif x['slot_id'] != y['slot_id'] or x['room_id'] != y['room_id']:
            changes.append({
                'course_name': x['course_name'], 'class_id': x['class_no'], 'type': '时间/教室变更',
                'from': (x['slot_label'] or x['slot_id']) + ' / ' + (x['room_name'] or str(x['room_id'])),
                'to': (y['slot_label'] or y['slot_id']) + ' / ' + (y['room_name'] or str(y['room_id'])),
            })
    for k, y in bmap.items():
        if k not in amap:
            changes.append({'course_name': y['course_name'], 'class_id': y['class_no'], 'type': '仅对比方案存在', 'from': '', 'to': ''})
    return ok({'plan_a': a, 'plan_b': b, 'changed': len(changes), 'changes': changes})


@app.route('/api/items/<int:item_id>', methods=['PUT'])
@login_required(['scheduler', 'admin'])
def update_item(item_id):
    item = q1("SELECT * FROM schedule_item WHERE item_id = :id", id=item_id)
    if not item:
        return fail('课表条目不存在', 404)
    d = request.get_json(silent=True) or {}
    slot_id = d.get('slot_id') or item['slot_id']
    room_id = d.get('room_id') or item['room_id']
    slot = q1("SELECT * FROM time_slot WHERE slot_id = :s", s=slot_id)
    room = q1("SELECT * FROM classroom WHERE room_id = :r", r=room_id)
    if not slot or not room:
        return fail('时间段或教室不存在')
    try:
        ex("""
            UPDATE schedule_item
            SET slot_id = :s, room_id = :r, day = :d, period = :pe
            WHERE item_id = :id
        """, s=slot_id, r=room_id, d=slot['day'], pe=slot['period'], id=item_id)
        hard, soft = refresh_conflicts(item['plan_id'])
        add_log('人工调整课表', '课程ID=' + str(item['course_id']),
                '调整为 %s / %s' % (slot['label'], room['name']))
        detail = q1("SELECT * FROM v_plan_item_detail WHERE item_id = :id", id=item_id)
        return ok(detail, '调整成功')
    except Exception as e:
        return fail('存在硬约束冲突：' + str(e))


@app.route('/api/conflicts/<int:conflict_id>/resolve', methods=['POST'])
@login_required(['scheduler', 'admin'])
def resolve_conflict(conflict_id):
    row = q1("SELECT * FROM conflict WHERE conflict_id = :id", id=conflict_id)
    if not row:
        return fail('冲突记录不存在', 404)
    ex("UPDATE conflict SET status='resolved' WHERE conflict_id = :id", id=conflict_id)
    add_log('处理冲突', row['conflict_type'], row['description'])
    return ok(None, '已标记为处理完成')


# ── 统计报表 ─────────────────────────────────────
@app.route('/api/reports')
@login_required(['scheduler', 'admin', 'teacher'])
def reports():
    plan_id = to_int(request.args.get('plan_id')) or active_plan_id()
    p = plan_summary(plan_id)
    if not p:
        return ok(None)
    items = q1("SELECT COUNT(*) AS c FROM schedule_item WHERE plan_id = :p", p=plan_id)['c']
    courses = q1("SELECT COUNT(DISTINCT course_id) AS c FROM schedule_item WHERE plan_id = :p", p=plan_id)['c']
    total_courses = q1("SELECT COUNT(*) AS c FROM course")['c']
    total_slots = q1("SELECT COUNT(*) * 25 AS c FROM classroom WHERE status='可用'")['c']
    utilization = round(float(items) * 100.0 / total_slots, 1) if total_slots else 0
    conflicts = q("""
        SELECT conflict_type AS type, COUNT(*) AS count
        FROM conflict WHERE plan_id = :p GROUP BY conflict_type ORDER BY count DESC
    """, p=plan_id)
    rooms = q("""
        SELECT r.room_id, r.name, r.room_type, r.capacity,
               COALESCE(u.used,0) AS used, 25 AS total,
               ROUND(COALESCE(u.used,0) * 100.0 / 25, 1) AS rate
        FROM classroom r
        LEFT JOIN (SELECT room_id, COUNT(*) AS used FROM schedule_item
                   WHERE plan_id = :p GROUP BY room_id) u ON r.room_id = u.room_id
        WHERE r.status = '可用'
        ORDER BY rate DESC
    """, p=plan_id)
    teacher_hours = q("""
        SELECT t.teacher_id, t.name, COUNT(i.item_id) AS hours, t.max_weekly_hours AS max
        FROM teacher t
        LEFT JOIN schedule_item i ON i.teacher_id = t.teacher_id AND i.plan_id = :p
        GROUP BY t.teacher_id, t.name, t.max_weekly_hours
        ORDER BY hours DESC
    """, p=plan_id)
    class_hours = q("""
        SELECT c.class_id, c.name, COUNT(i.item_id) AS hours
        FROM class c
        LEFT JOIN schedule_item i ON i.class_id = c.class_id AND i.plan_id = :p
        GROUP BY c.class_id, c.name
        ORDER BY hours DESC
    """, p=plan_id)
    courses_detail = q("""
        SELECT c.course_id, c.course_name, c.class_id, cl.name AS class_name,
               c.teacher_id, t.name AS teacher_name, c.weekly_hours
        FROM course c
        JOIN class cl ON c.class_id = cl.class_id
        JOIN teacher t ON c.teacher_id = t.teacher_id
        ORDER BY c.course_id
    """)
    return ok({
        'plan': p, 'items': items, 'courses': courses, 'total_courses': total_courses,
        'utilization': utilization, 'room_total': total_slots,
        'hard_conflicts': int(p['hard_conflicts']), 'soft_conflicts': int(p['soft_violations']),
        'teacher_hours': teacher_hours, 'class_hours': class_hours,
        'rooms': rooms, 'conflict_by_type': conflicts, 'courses_detail': courses_detail,
    })


# ── 教师接口 ─────────────────────────────────────
@app.route('/api/teacher/dashboard')
@login_required(['teacher', 'admin', 'scheduler'])
def teacher_dashboard():
    tid = to_int(request.args.get('teacher_id')) or session.get('teacher_id')
    if not tid:
        return fail('缺少教师身份', 403)
    teacher = q1("SELECT * FROM teacher WHERE teacher_id = :t", t=tid)
    if not teacher:
        return fail('教师不存在', 404)
    plan = plan_summary()
    items = item_rows(plan['plan_id']) if plan else []
    items = [i for i in items if i['teacher_id'] == int(tid)]
    courses = q("""
        SELECT c.*, cl.name AS class_name
        FROM course c JOIN class cl ON c.class_id = cl.class_id
        WHERE c.teacher_id = :t ORDER BY c.course_id
    """, t=tid)
    prefs = q("SELECT * FROM teacher_preference WHERE teacher_id = :t", t=tid)
    pref_map = {p['slot_id']: p['level'] for p in prefs}
    avoid_conflicts = sum(1 for i in items if pref_map.get(i['slot_id']) == 'avoid')
    return ok({
        'teacher': teacher, 'plan': plan, 'items': items, 'courses': courses,
        'stats': {
            'course_count': len(courses),
            'weekly_hours': sum(int(c.get('weekly_hours') or 0) for c in courses),
            'class_count': len({c['class_id'] for c in courses}),
            'preference_count': len(prefs),
            'avoid_conflicts': avoid_conflicts,
        },
    })


@app.route('/api/teacher/schedule')
@login_required(['teacher', 'admin', 'scheduler'])
def teacher_schedule():
    tid = to_int(request.args.get('teacher_id')) or session.get('teacher_id')
    if not tid:
        return fail('缺少教师身份', 403)
    plan_id = to_int(request.args.get('plan_id')) or active_plan_id()
    if not plan_id:
        return ok({'plan': None, 'items': []})
    items = [i for i in item_rows(plan_id) if i['teacher_id'] == int(tid)]
    return ok({'plan': plan_summary(plan_id), 'items': items})


# ── 学生接口 ─────────────────────────────────────
@app.route('/api/student/dashboard')
@login_required(['student', 'admin', 'scheduler', 'teacher'])
def student_dashboard():
    cid = to_int(request.args.get('class_id')) or session.get('class_id')
    cls = q1("SELECT * FROM class WHERE class_id = :c", c=cid)
    if not cls:
        return fail('班级不存在', 404)
    plan = plan_summary()
    items = item_rows(plan['plan_id']) if plan else []
    items = [i for i in items if i['class_id'] == int(cid)]
    courses = q("""
        SELECT c.*, t.name AS teacher_name
        FROM course c JOIN teacher t ON c.teacher_id = t.teacher_id
        WHERE c.class_id = :c ORDER BY c.course_id
    """, c=cid)
    return ok({
        'class_info': cls, 'plan': plan, 'items': items, 'courses': courses,
        'stats': {
            'course_count': len(courses),
            'weekly_hours': sum(int(c.get('weekly_hours') or 0) for c in courses),
            'teacher_count': len({c['teacher_id'] for c in courses}),
        },
    })


@app.route('/api/student/schedule')
@login_required(['student', 'admin', 'scheduler', 'teacher'])
def student_schedule():
    cid = to_int(request.args.get('class_id')) or session.get('class_id')
    if not cid:
        return fail('缺少班级身份', 403)
    plan_id = to_int(request.args.get('plan_id')) or active_plan_id()
    cls = q1("SELECT * FROM class WHERE class_id = :c", c=cid)
    if not plan_id:
        return ok({'plan': None, 'items': [], 'class_info': cls})
    items = [i for i in item_rows(plan_id) if i['class_id'] == int(cid)]
    return ok({'plan': plan_summary(plan_id), 'items': items, 'class_info': cls})


# ── 前端静态文件 ─────────────────────────────────
@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')


@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(FRONTEND_DIR, filename)


if __name__ == '__main__':
    print('=' * 56)
    print('  智能校园课程排课与调度系统 — 后端已启动')
    print('  浏览器打开: http://localhost:5000')
    print('  前端目录:', FRONTEND_DIR)
    print('=' * 56)
    app.run(host='0.0.0.0', port=5000, debug=False)
