# 学生选课管理系统 — 前端代码及文件

## 项目概述

基于 **HTML5 + Bootstrap 5 + JavaScript (AJAX)** 的学生选课管理系统前端，配合 **Python Flask + openGauss** 后端使用。

> **部署环境**：WSL2 (Windows Subsystem for Linux 2) + openEuler + openGauss

系统采用 **B/S 架构**，支持三种角色（学生、教师、管理员），覆盖选课、退课、成绩管理、课表查询、统计报表等完整业务功能。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | HTML5 + Bootstrap 5.3 + JavaScript (Fetch API) |
| 图标 | Bootstrap Icons 1.11 |
| 后端 | Python Flask 2.3 |
| 数据库 | openGauss (兼容 PostgreSQL) |
| 架构 | B/S (Browser/Server) |

## 文件结构

```
前端相关代码及文件/
├── index.html                    # 登录页面（角色选择+身份认证）
├── css/
│   └── style.css                 # 全局自定义样式
├── js/
│   ├── api.js                    # 后端API接口封装
│   └── utils.js                  # 通用工具函数（Session/Toast/Loading等）
├── student/
│   ├── dashboard.html            # 学生首页 — 浏览可选课程、筛选、选课
│   ├── my_courses.html           # 我的课表 — 查看已选课程、退课
│   └── grades.html               # 成绩查询 — 成绩单、GPA、成绩分布图
├── teacher/
│   ├── dashboard.html            # 教师首页 — 授课概览、工作量统计
│   ├── roster.html               # 学生名单 — 按课程查看选课学生
│   └── grade_entry.html          # 成绩录入 — 批量录入/修改成绩
├── admin/
│   ├── dashboard.html            # 管理员首页 — 系统概览、学院统计
│   ├── manage_students.html      # 学生管理 — 学生信息CRUD
│   ├── manage_teachers.html      # 教师管理 — 教师信息CRUD
│   └── manage_courses.html       # 课程管理 — 课程信息CRUD
└── README.md                     # 本文件
```

## 功能模块

### 学生端
- **可选课程**：浏览全量课程列表，支持按课程名/学院/状态筛选，实时显示课程余量（已满/紧张/有余）
- **选课操作**：点击选课→确认→调用存储过程完成选课（含容量检测和时间冲突检测）
- **我的课表**：查看已选课程详情（时间/地点/教师/成绩），支持退课（有成绩或超30天不可退）
- **成绩查询**：查看已录入成绩、已获学分、GPA绩点，含成绩分布柱状图

### 教师端
- **课程概览**：查看本学期授课课程、选课人数、工作量统计（授课门数/总人数/及格率/评级）
- **学生名单**：按课程查看选课学生详细信息，支持打印名单
- **成绩录入**：批量录入/修改学生成绩（0-100分），修改记录自动写入审计日志

### 管理员端
- **系统概览**：学生/教师/课程总数统计，各学院选课参与率柱状图，学院级统计报表
- **学生管理**：学生信息增删改查（学号/姓名/性别/出生日期/学院/密码）
- **教师管理**：教师信息增删改查（工号/姓名/性别/职称/密码）
- **课程管理**：课程信息增删改查（课程号/名称/学分/容量/时间/地点/授课教师）

## 数据库表结构

| 表名 | 说明 | 主要字段 |
|------|------|----------|
| Student | 学生信息表 | student_id(PK), name, gender, birth_date, college, password |
| Teacher | 教师信息表 | teacher_id(PK), name, gender, title, password |
| Course | 课程信息表 | course_id(PK), course_name, credit, capacity, location, schedule_time, teacher_id(FK) |
| Enrollment | 选课记录表 | enroll_id(PK), student_id(FK), course_id(FK), enroll_time, grade |
| Grade_Audit_Log | 成绩审计日志 | log_id, enroll_id, old_grade, new_grade, op_time, op_user |

## 数据库视图

| 视图 | 功能 | 技术要点 |
|------|------|----------|
| v_StudentCourseSchedule | 学生完整课表 | 4表JOIN |
| v_CourseRemainingCapacity | 课程余量（含状态标签） | LEFT JOIN + 聚合 + CASE WHEN |
| v_TeacherStudentRoster | 教师选课学生名单 | 4表JOIN + CASE WHEN |
| v_StudentTranscript | 学生成绩单（含学分/GPA） | 标量子查询 |
| v_TeacherWorkload | 教师工作量统计 | 双重LEFT JOIN + 聚合 |
| v_CollegeEnrollmentStats | 学院选课统计 | LEFT JOIN + 关联子查询 |

## 触发器与存储过程

- **trg_check_capacity**：选课前容量检测（BEFORE INSERT）
- **trg_enroll_validation**：容量+时间冲突双重校验
- **trg_audit_grade_update**：成绩修改审计日志（AFTER UPDATE）
- **trg_prevent_invalid_drop**：退课限制（有成绩/超30天不可退）
- **sp_student_enroll**：选课存储过程（含事务控制）
- **sp_calc_student_gpa**：GPA计算存储过程
- **sp_generate_course_report**：课程报表存储过程

## 权限控制 (RBAC)

| 角色 | 权限 | 说明 |
|------|------|------|
| Role_Admin | ALL PRIVILEGES | 全部表的所有操作 |
| Role_Teacher | SELECT + UPDATE(grade) | 查询，仅能修改成绩列 |
| Role_Student | SELECT + INSERT + DELETE | 查询课程，选课/退课 |

## 使用方法

### 1. 启动 openGauss 数据库（WSL2 + openEuler）

```bash
# 在 WSL2 的 openEuler 中启动 openGauss
gs_ctl start -D /opt/ogdata

# 连接数据库并执行SQL脚本
gsql -d postgres -U omm -W -f 数据库SQL代码/01_ddl_tables.sql
gsql -d course_selection -U omm -W -f 数据库SQL代码/02_views.sql
gsql -d course_selection -U omm -W -f 数据库SQL代码/03_indexes.sql
gsql -d course_selection -U omm -W -f 数据库SQL代码/04_security.sql
gsql -d course_selection -U omm -W -f 数据库SQL代码/05_triggers.sql
gsql -d course_selection -U omm -W -f 数据库SQL代码/06_procedures.sql
```

### 2. 配置 Flask 后端连接

确保 Flask 后端的数据库连接配置指向 openGauss：
```python
# 使用 psycopg2 驱动连接 openGauss
DB_HOST = 'localhost'      # WSL2 自动转发 localhost
DB_PORT = 5432             # openGauss 默认端口
DB_NAME = 'course_selection'
DB_USER = 'app_admin'      # 或根据角色使用 app_teacher / app_student
DB_PASSWORD = 'Admin@2025'
```

### 3. 启动 Flask 后端服务

```bash
cd backend
python app.py
# 默认运行在 http://localhost:5000
```

### 4. 访问前端

用浏览器打开 `index.html` 登录，默认密码均为 `123456`

### 演示账号

| 角色 | 账号示例 | 密码 |
|------|----------|------|
| 学生 | 任意学号 | 123456 |
| 教师 | 任意工号 | 123456 |
| 管理员 | admin_01 | 123456 |

## 设计亮点

1. **约束下沉到数据库层**：CHECK、UNIQUE、FOREIGN KEY + 触发器在数据库层保证数据完整性
2. **视图封装复杂查询**：6个视图覆盖全部业务场景，应用层直接查询视图
3. **存储过程 + 事务保证 ACID**：选课操作封装为存储过程，异常自动回滚
4. **RBAC 细粒度权限**：三角色分离 + 列级权限 (UPDATE grade)
5. **前后端分离**：前端纯静态HTML+AJAX，后端Flask RESTful API
6. **响应式设计**：Bootstrap 5 栅格系统，适配PC/平板/手机
