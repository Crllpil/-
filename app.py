"""
学生选课管理系统 — Flask 后端（单文件版）
运行方式：WSL2 内，作为 opengauss 用户执行
    su -s /bin/bash - opengauss
    cd /tmp && python3 /mnt/c/Users/13087/Desktop/24050236杨欣豪-24050237余泽凯-24050238钟劲森/app.py

数据库：Unix Socket → openGauss（opengauss 超级用户，绕过 SASL 问题）
浏览器：http://localhost:5000（WSL2 自动转发）
"""
import os
from datetime import datetime
from functools import wraps
from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
import pg8000.native

# ── 配置 ──────────────────────────────────────────
DB = dict(unix_sock='/tmp/.s.PGSQL.5432', database='course_selection', user='opengauss', timeout=10)
SCHEMA = 'course_selection'
SECRET_KEY = 'course-selection-secret-2025'
FRONTEND_DIR = '/mnt/c/Users/13087/Desktop/24050236杨欣豪-24050237余泽凯-24050238钟劲森/前端相关代码及文件/opengauss-web-project'
ADMINS = {'admin_01': '123456'}

app = Flask(__name__)
app.secret_key = SECRET_KEY
CORS(app, supports_credentials=True)

# ── 数据库工具 ─────────────────────────────────────
# pg8000 使用 :name 命名参数，不是 %s
def _conn():
    c = pg8000.native.Connection(**DB)
    c.run(f'SET search_path TO {SCHEMA}')
    return c

def q(sql, **kw):
    """查询 → 字典列表"""
    c = _conn()
    try:
        rows = c.run(sql, **kw)
        return [dict(zip([col['name'] for col in c.columns], r)) for r in rows] if rows else []
    finally:
        c.close()

def q1(sql, **kw):
    """查询 → 单行字典 或 None"""
    r = q(sql, **kw)
    return r[0] if r else None

def ex(sql, **kw):
    """执行写操作"""
    c = _conn()
    try:
        c.run(sql, **kw)
    finally:
        c.close()


# ── 登录装饰器 ─────────────────────────────────────
def login_required(role=None):
    def d(fn):
        @wraps(fn)
        def w(*a, **kw):
            if 'user_id' not in session:
                return jsonify({'success': False, 'message': '请先登录'}), 401
            if role and session.get('role') != role:
                return jsonify({'success': False, 'message': f'权限不足，需要{role}角色'}), 403
            return fn(*a, **kw)
        return w
    return d


# ═══════════════════════════════════════════════════
#  认证
# ═══════════════════════════════════════════════════
@app.route('/login', methods=['POST'])
def login():
    d = request.get_json(silent=True) or {}
    uid = (d.get('uid') or '').strip()
    pwd = (d.get('password') or '').strip()
    role = (d.get('role') or '').strip().lower()
    if not uid or not role:
        return jsonify({'success': False, 'message': '账号、密码、角色不能为空'}), 400

    if role == 'admin':
        if uid in ADMINS and ADMINS[uid] == pwd:
            session.update({'user_id': uid, 'role': 'admin', 'name': '管理员'})
            return jsonify({'success': True, 'role': 'admin', 'name': '管理员'})
        return jsonify({'success': False, 'message': '管理员账号或密码错误'}), 401

    tbl = 'Student' if role == 'student' else 'Teacher'
    col = 'student_id' if role == 'student' else 'teacher_id'
    row = q1(f'SELECT {col}, name, password FROM {tbl} WHERE {col}=:uid', uid=uid)
    if not row:
        return jsonify({'success': False, 'message': '账号不存在'}), 401
    if row['password'] != pwd:
        return jsonify({'success': False, 'message': '密码错误'}), 401
    session.update({'user_id': uid, 'role': role, 'name': row['name']})
    return jsonify({'success': True, 'role': role, 'name': row['name']})


@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True, 'message': '已退出登录'})


# ═══════════════════════════════════════════════════
#  学生接口
# ═══════════════════════════════════════════════════
@app.route('/api/courses', methods=['GET'])
@login_required('student')
def student_courses():
    return jsonify({'success': True, 'data': q('SELECT * FROM v_CourseRemainingCapacity ORDER BY course_id')})


@app.route('/api/enroll', methods=['POST'])
@login_required('student')
def enroll():
    d = request.get_json(silent=True) or {}
    cid = (d.get('course_id') or '').strip()
    if not cid: return jsonify({'success': False, 'message': '课程编号不能为空'}), 400
    # pg8000 不支持直接调用函数获取 OUT 参数，改用内联 SQL
    try:
        # 检查已选
        if q1('SELECT 1 FROM Enrollment WHERE student_id=:s AND course_id=:c', s=session['user_id'], c=cid):
            return jsonify({'success': False, 'message': '选课失败：已选过该课程'})
        # 检查容量
        cap = q1('SELECT capacity FROM Course WHERE course_id=:c', c=cid)
        enrolled = q1('SELECT COUNT(*) AS n FROM Enrollment WHERE course_id=:c', c=cid)
        if enrolled['n'] >= cap['capacity']:
            cap_val = cap['capacity']
            return jsonify({'success': False, 'message': f'选课失败：课程已满（容量{cap_val}人）'})
        # 检查时间冲突
        sched = q1('SELECT schedule_time FROM Course WHERE course_id=:c', c=cid)
        conflict = q1("""
            SELECT COUNT(*) AS n FROM Enrollment e JOIN Course c2 ON e.course_id=c2.course_id
            WHERE e.student_id=:s AND c2.schedule_time=:t
        """, s=session['user_id'], t=sched['schedule_time'])
        if conflict['n'] > 0:
            return jsonify({'success': False, 'message': f'选课失败：时间 [{sched["schedule_time"]}] 与已有课程冲突'})
        # 插入
        ex('INSERT INTO Enrollment (student_id, course_id) VALUES (:s, :c)',
           s=session['user_id'], c=cid)
        return jsonify({'success': True, 'message': '选课成功！'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/drop', methods=['POST'])
@login_required('student')
def drop():
    d = request.get_json(silent=True) or {}
    cid = (d.get('course_id') or '').strip()
    if not cid: return jsonify({'success': False, 'message': '课程编号不能为空'}), 400
    sid = session['user_id']
    enr = q1('SELECT enroll_id, grade, enroll_time FROM Enrollment WHERE student_id=:s AND course_id=:c',
             s=sid, c=cid)
    if not enr: return jsonify({'success': False, 'message': '未找到选课记录'}), 404
    if enr['grade'] is not None:
        return jsonify({'success': False, 'message': '已有成绩，不可退课'}), 400
    if enr['enroll_time'] and (datetime.now() - enr['enroll_time']).days > 30:
        return jsonify({'success': False, 'message': '选课超30天，不可退课'}), 400
    ex('DELETE FROM Enrollment WHERE enroll_id=:eid', eid=enr['enroll_id'])
    return jsonify({'success': True, 'message': '退课成功'})


@app.route('/api/student/schedule', methods=['GET'])
@login_required('student')
def student_schedule():
    return jsonify({'success': True,
        'data': q('SELECT * FROM v_StudentCourseSchedule WHERE student_id=:s ORDER BY schedule_time',
                  s=session['user_id'])})


@app.route('/api/student/grades', methods=['GET'])
@login_required('student')
def student_grades():
    return jsonify({'success': True,
        'data': q('SELECT * FROM v_StudentTranscript WHERE student_id=:s ORDER BY course_id',
                  s=session['user_id'])})


@app.route('/api/student/gpa', methods=['GET'])
@login_required('student')
def student_gpa():
    # 直接调用函数（pg8000 方式）
    c = _conn()
    try:
        rows = c.run('SELECT * FROM sp_calc_student_gpa(:s)', s=session['user_id'])
        if rows:
            cols = [col['name'] for col in c.columns]
            row = dict(zip(cols, rows[0]))
            return jsonify({'success': True, 'gpa': float(row['p_gpa'] or 0),
                           'total_credits': float(row['p_total_cred'] or 0)})
        return jsonify({'success': True, 'gpa': 0.0, 'total_credits': 0.0})
    finally:
        c.close()


# ═══════════════════════════════════════════════════
#  教师接口
# ═══════════════════════════════════════════════════
@app.route('/api/teacher/courses', methods=['GET'])
@login_required('teacher')
def teacher_courses():
    return jsonify({'success': True, 'data': q("""
        SELECT c.*, COALESCE(ec.enrolled,0) AS enrolled_count,
               c.capacity-COALESCE(ec.enrolled,0) AS remaining_count,
               ROUND(COALESCE(ec.enrolled,0)*100.0/c.capacity,1) AS fill_rate_pct,
               CASE WHEN COALESCE(ec.enrolled,0)>=c.capacity THEN '已满'
                    WHEN COALESCE(ec.enrolled,0)>=c.capacity*0.9 THEN '紧张'
                    WHEN COALESCE(ec.enrolled,0)>=c.capacity*0.5 THEN '正常'
                    ELSE '有余' END AS status_label,
               t.name AS teacher_name, t.title AS teacher_title
        FROM Course c JOIN Teacher t ON c.teacher_id=t.teacher_id
        LEFT JOIN (SELECT course_id, COUNT(*) AS enrolled FROM Enrollment GROUP BY course_id) ec
          ON c.course_id=ec.course_id
        WHERE c.teacher_id=:t ORDER BY c.course_id
    """, t=session['user_id'])})


@app.route('/api/teacher/roster/<course_id>', methods=['GET'])
@login_required('teacher')
def teacher_roster(course_id):
    tid = session['user_id']
    if not q1('SELECT 1 FROM Course WHERE course_id=:c AND teacher_id=:t', c=course_id, t=tid):
        return jsonify({'success': False, 'message': '课程不存在或不属于您'}), 403
    return jsonify({'success': True, 'data':
        q('SELECT * FROM v_TeacherStudentRoster WHERE course_id=:c AND teacher_id=:t ORDER BY student_id',
          c=course_id, t=tid)})


@app.route('/api/teacher/grade', methods=['PUT'])
@login_required('teacher')
def teacher_grade():
    d = request.get_json(silent=True) or {}
    eid = d.get('enroll_id')
    grade = d.get('grade')
    if eid is None or grade is None:
        return jsonify({'success': False, 'message': '选课ID和成绩不能为空'}), 400
    try:
        grade = float(grade)
        if not 0 <= grade <= 100: raise ValueError
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': '成绩须为0~100的数字'}), 400

    enr = q1("""SELECT e.grade AS old FROM Enrollment e
                JOIN Course c ON e.course_id=c.course_id
                WHERE e.enroll_id=:e AND c.teacher_id=:t""",
             e=eid, t=session['user_id'])
    if not enr: return jsonify({'success': False, 'message': '选课记录不存在或不属于您的课程'}), 403

    ex('UPDATE Enrollment SET grade=:g WHERE enroll_id=:e', g=grade, e=eid)
    return jsonify({'success': True, 'message': '成绩录入成功' if enr['old'] is None else '成绩修改成功'})


@app.route('/api/teacher/workload', methods=['GET'])
@login_required('teacher')
def teacher_workload():
    return jsonify({'success': True,
        'data': q1('SELECT * FROM v_TeacherWorkload WHERE teacher_id=:t', t=session['user_id'])})


# ═══════════════════════════════════════════════════
#  管理员接口
# ═══════════════════════════════════════════════════
@app.route('/api/admin/dashboard', methods=['GET'])
@login_required('admin')
def admin_dashboard():
    result = {}
    for t in ['Student', 'Teacher', 'Course', 'Enrollment']:
        key = {'Student': 'total_students', 'Teacher': 'total_teachers',
               'Course': 'total_courses', 'Enrollment': 'total_enrollments'}[t]
        result[key] = q1(f'SELECT COUNT(*) AS c FROM {t}')['c']
    result['success'] = True
    return jsonify(result)


@app.route('/api/admin/stats/college', methods=['GET'])
@login_required('admin')
def admin_college_stats():
    return jsonify({'success': True, 'data': q('SELECT * FROM v_CollegeEnrollmentStats ORDER BY total_students DESC')})


# ── CRUD 辅助（pg8000 用 :p0, :p1 ... 命名参数）──
def _col_list(table, id_col, join_sql=''):
    rows = q(f'SELECT * FROM {table}{join_sql} ORDER BY {id_col}')
    return jsonify({'success': True, 'data': rows})

def _col_add(table, id_col):
    d = request.get_json(silent=True) or {}
    if not d.get(id_col):
        return jsonify({'success': False, 'message': f'缺少 {id_col}'}), 400
    cols = [c for c in d if d[c] is not None]
    params = {f'p{i}': d[c] for i, c in enumerate(cols)}
    ph = ','.join(f':p{i}' for i in range(len(cols)))
    ex(f'INSERT INTO {table} ({",".join(cols)}) VALUES ({ph})', **params)
    return jsonify({'success': True, 'message': '添加成功'})

def _col_update(table, id_col, obj_id):
    d = request.get_json(silent=True) or {}
    skip = {id_col, 'enroll_id', 'enroll_time', 'log_id'}
    up = {k: v for k, v in d.items() if k not in skip and v is not None}
    if not up:
        return jsonify({'success': False, 'message': '无有效更新字段'}), 400
    params = {f'p{i}': up[k] for i, k in enumerate(up)}
    sets = ','.join(f'{k}=:p{i}' for i, k in enumerate(up))
    params['_id'] = obj_id
    ex(f'UPDATE {table} SET {sets} WHERE {id_col}=:_id', **params)
    return jsonify({'success': True, 'message': '修改成功'})

def _col_delete(table, id_col, obj_id):
    ex(f'DELETE FROM {table} WHERE {id_col}=:_id', _id=obj_id)
    return jsonify({'success': True, 'message': '删除成功'})


# ── 学生管理 ──
@app.route('/api/admin/students', methods=['GET'])
@login_required('admin')
def adm_stu_list(): return _col_list('Student', 'student_id')

@app.route('/api/admin/students', methods=['POST'])
@login_required('admin')
def adm_stu_add(): return _col_add('Student', 'student_id')

@app.route('/api/admin/students/<obj_id>', methods=['PUT'])
@login_required('admin')
def adm_stu_upd(obj_id): return _col_update('Student', 'student_id', obj_id)

@app.route('/api/admin/students/<obj_id>', methods=['DELETE'])
@login_required('admin')
def adm_stu_del(obj_id): return _col_delete('Student', 'student_id', obj_id)


# ── 教师管理 ──
@app.route('/api/admin/teachers', methods=['GET'])
@login_required('admin')
def adm_tch_list(): return _col_list('Teacher', 'teacher_id')

@app.route('/api/admin/teachers', methods=['POST'])
@login_required('admin')
def adm_tch_add(): return _col_add('Teacher', 'teacher_id')

@app.route('/api/admin/teachers/<obj_id>', methods=['PUT'])
@login_required('admin')
def adm_tch_upd(obj_id): return _col_update('Teacher', 'teacher_id', obj_id)

@app.route('/api/admin/teachers/<obj_id>', methods=['DELETE'])
@login_required('admin')
def adm_tch_del(obj_id): return _col_delete('Teacher', 'teacher_id', obj_id)


# ── 课程管理（GET JOIN 教师名）──
@app.route('/api/admin/courses', methods=['GET'])
@login_required('admin')
def adm_crs_list():
    rows = q("""SELECT c.*, t.name AS teacher_name
                FROM Course c JOIN Teacher t ON c.teacher_id=t.teacher_id
                ORDER BY c.course_id""")
    return jsonify({'success': True, 'data': rows})

@app.route('/api/admin/courses', methods=['POST'])
@login_required('admin')
def adm_crs_add(): return _col_add('Course', 'course_id')

@app.route('/api/admin/courses/<obj_id>', methods=['PUT'])
@login_required('admin')
def adm_crs_upd(obj_id): return _col_update('Course', 'course_id', obj_id)

@app.route('/api/admin/courses/<obj_id>', methods=['DELETE'])
@login_required('admin')
def adm_crs_del(obj_id): return _col_delete('Course', 'course_id', obj_id)


# ═══════════════════════════════════════════════════
#  前端静态文件
# ═══════════════════════════════════════════════════
@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(FRONTEND_DIR, filename)


# ═══════════════════════════════════════════════════
#  启动
# ═══════════════════════════════════════════════════
if __name__ == '__main__':
    print('=' * 50)
    print('  学生选课管理系统 — 后端已启动')
    print('  浏览器打开: http://localhost:5000')
    print('=' * 50)
    app.run(host='0.0.0.0', port=5000, debug=False)
