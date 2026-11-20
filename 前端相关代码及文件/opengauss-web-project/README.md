# 智能校园课程排课与调度系统 — 前端代码及文件

## 项目概述

本项目按照《智能校园课程排课与调度系统_用户需求分析报告》改造，覆盖报告中的 **FR-01～FR-10** 功能需求与四类用户角色：

| 角色 | 主要功能 |
|------|----------|
| 系统管理员 | 用户与权限管理、操作日志审计、系统概览 |
| 教务员 | 课程/教师/班级/教室/时间段管理、排课任务、自动排课、课表展示、人工调整、冲突检测、方案版本、统计报表 |
| 教师 | 查看个人课表、维护“偏好/回避/禁止”三级时间偏好 |
| 学生 | 查看班级课表、课程与教室信息 |

系统采用 **B/S 架构**，前端为 HTML5 + Bootstrap 5 + 原生 JavaScript，后端可使用 **Python Flask + openGauss**。

> **演示模式**：当 Flask 后端未启动时，`js/mock.js` 会自动接管 API 请求，使用 localStorage 保存演示数据，并内置遗传算法排课引擎，页面可独立运行。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | HTML5 + Bootstrap 5.3 + Bootstrap Icons + 原生 JavaScript |
| 请求 | Fetch API（后端不可用时自动降级到本地 MockAPI） |
| 排课算法 | 遗传算法（锦标赛选择、教学任务块交叉、变异、约束修复） |
| 后端（可选） | Python Flask 2.3 |
| 数据库（可选） | openGauss（兼容 PostgreSQL） |

## 文件结构

```
opengauss-web-project/
├── index.html                    # 登录页（学生/教师/教务员/管理员）
├── css/
│   └── style.css                 # 全局样式、课表网格、偏好网格、打印样式
├── js/
│   ├── api.js                    # API 封装（含离线 Mock 降级）
│   ├── algorithm.js              # 遗传算法排课引擎（FR-05）
│   ├── mock.js                   # 演示数据、localStorage 数据库与本地 API
│   ├── utils.js                  # Session/Toast/Loading/CSV/权限等工具
│   ├── page-common.js            # 统计卡片、课表网格、柱状图等通用组件
│   └── layout.js                 # 角色导航与菜单
├── admin/
│   ├── dashboard.html            # 系统概览
│   ├── users.html                # FR-01 用户与权限管理
│   └── logs.html                 # 操作日志审计
├── scheduler/
│   ├── dashboard.html            # 教务员排课工作台
│   ├── courses.html              # FR-02 课程管理（含 CSV 导入导出）
│   ├── teachers.html             # FR-03 教师管理、查看时间偏好
│   ├── classrooms.html           # FR-04 教室管理
│   ├── base.html                 # 班级与时间段基础数据
│   ├── tasks.html                # FR-05 排课任务、算法参数、运行进度
│   ├── schedule.html             # FR-06 课表展示（班级/教师/教室/课程）
│   ├── adjust.html               # FR-07 人工调整与实时冲突校验
│   ├── conflicts.html            # FR-08 冲突检测与提示
│   ├── plans.html                # FR-09 方案保存、版本、启用、差异对比
│   └── reports.html              # FR-10 统计报表
├── teacher/
│   ├── dashboard.html            # 教师工作台
│   ├── schedule.html             # 我的课表
│   └── preferences.html          # 时间偏好设置
├── student/
│   ├── dashboard.html            # 学生工作台
│   └── timetable.html            # 班级课表
└── README.md
```

## 演示账号

密码均为 `123456`：

| 角色 | 账号 | 说明 |
|------|------|------|
| 学生 | `S001` / `S002` | 分别对应计算机2301班、2302班 |
| 教师 | `T001` / `T002` | 王建国、李慧 |
| 教务员 | `jw_01` | 张教务 |
| 系统管理员 | `admin_01` | 系统管理员 |

## 后端与数据库

完整项目还包含：

| 文件/目录 | 说明 |
|-----------|------|
| `../../app.py` | Flask 后端，提供本 README 中列出的全部 API，并内置调度引擎调用 |
| `../../scheduler.py` | Python 遗传算法排课引擎（与 `js/algorithm.js` 逻辑一致） |
| `../../数据库SQL代码/01_ddl_tables.sql` | openGauss 建表脚本 |
| `../../数据库SQL代码/02_views.sql` | 课表、工作量、利用率、冲突统计视图 |
| `../../数据库SQL代码/03_indexes.sql` | 索引 |
| `../../数据库SQL代码/04_security.sql` | RBAC 角色与授权 |
| `../../数据库SQL代码/05_triggers.sql` | 课表冲突校验、方案启用、审计触发器 |
| `../../数据库SQL代码/06_procedures.sql` | 启用方案、刷新冲突、人工调整等过程/函数 |
| `../../数据库SQL代码/07_seed_data.sql` | 演示数据（账号、课程、教师、班级、教室、时间段、偏好） |

### 数据库初始化

```bash
# 1. 创建数据库（omm 用户连接 postgres 库）
gsql -d postgres -U omm -W -c "CREATE DATABASE campus_schedule;"

# 2. 依次执行脚本
cd ../../数据库SQL代码
gsql -d campus_schedule -U omm -W -f 01_ddl_tables.sql
gsql -d campus_schedule -U omm -W -f 02_views.sql
gsql -d campus_schedule -U omm -W -f 03_indexes.sql
gsql -d campus_schedule -U omm -W -f 04_security.sql
gsql -d campus_schedule -U omm -W -f 05_triggers.sql
gsql -d campus_schedule -U omm -W -f 06_procedures.sql
gsql -d campus_schedule -U omm -W -f 07_seed_data.sql
```

### 启动 Flask 后端

```bash
su -s /bin/bash - opengauss
cd /tmp
python3 /mnt/c/Users/13087/Desktop/24050236杨欣豪-24050237余泽凯-24050238钟劲森/app.py
```

浏览器访问 `http://localhost:5000`，由 Flask 直接托管本前端目录。

> 首次启动后，使用教务员账号 `jw_01` 登录，进入“排课任务”页面，点击任务的“运行”按钮，算法生成第一个方案并自动启用；之后可在课表、冲突、方案版本、统计报表页面查看结果。

## 运行方式

### 方式一：纯前端演示（无需后端）

在项目目录启动一个静态服务器（推荐，避免浏览器对 file:// 的限制）：

```bash
python -m http.server 8080
# 浏览器访问 http://localhost:8080
```

打开页面后直接登录即可。首次请求会初始化演示数据并自动生成一份启用方案，耗时约 0.5～1 秒。

### 方式二：对接 Flask + openGauss 后端

1. 按后端项目说明启动 Flask（默认 `http://localhost:5000`）。
2. 后端未实现时，前端会自动降级到 MockAPI；实现后，前端优先使用后端返回数据。
3. 修改 `js/api.js` 中的 `API_BASE` 可调整后端地址。

## 自动排课算法（对应附录 A）

`js/algorithm.js` 实现了与需求分析报告附录 A 一致的遗传算法：

- **编码**：每个课次分配一个“时间段—教室”对，染色体长度为总课次数。
- **初始化**：按任务难度排序的启发式随机贪心，保证初始解尽量满足硬约束。
- **适应度**：`f = 1 / (1 + 1000 × 硬冲突数 + 软约束加权惩罚)`。
- **硬约束**：教师冲突、班级冲突、教室冲突、教室容量、教室类型、教师禁止时段。
- **软约束**：教师回避/偏好时段、课程日分布、教室利用率、班级课表空档、连堂偏好。
- **遗传操作**：锦标赛选择、精英保留、教学任务块交叉、单基因/交换变异。
- **约束修复**：对冲突课次枚举候选教室与时间段，定向转移到冲突更少的位置。
- **可复现**：支持随机种子；任务参数包括种群规模、迭代代数、时间上限与软约束权重。

排课任务运行时会实时显示迭代进度、最优适应度与硬冲突数量，完成后生成新的方案版本。

## 主要 API（与后端约定）

| 模块 | 方法与路径 | 说明 |
|------|------------|------|
| 认证 | `POST /login` | 登录，参数 `uid/password/role` |
| 管理员 | `GET /api/admin/dashboard` | 系统概览 |
| 管理员 | `GET/POST /api/admin/users` | 用户列表/新增 |
| 管理员 | `PUT/DELETE /api/admin/users/:id` | 修改/删除用户 |
| 管理员 | `GET /api/admin/logs` | 操作日志 |
| 基础数据 | `/api/courses`、`/api/teachers`、`/api/classes`、`/api/classrooms` | CRUD |
| 时间段 | `GET /api/time-slots` | 时间段列表 |
| 偏好 | `GET /api/preferences?teacher_id=` | 查看教师偏好 |
| 偏好 | `GET/PUT /api/teacher/preferences` | 教师维护个人偏好 |
| 排课任务 | `GET/POST /api/schedule-tasks` | 任务列表/创建 |
| 排课任务 | `POST /api/schedule-tasks/:id/run` | 运行自动排课 |
| 方案 | `GET /api/plans` | 方案版本列表 |
| 方案 | `GET /api/plans/:id/items` | 课表条目 |
| 方案 | `GET /api/plans/:id/conflicts` | 冲突记录 |
| 方案 | `POST /api/plans/:id/activate` | 启用方案 |
| 方案 | `GET /api/plans/:id/compare?other=` | 方案差异对比 |
| 调整 | `PUT /api/items/:id` | 人工调整课表条目 |
| 冲突 | `POST /api/conflicts/:id/resolve` | 标记冲突已处理 |
| 报表 | `GET /api/reports?plan_id=` | 统计报表 |
| 教师 | `GET /api/teacher/dashboard`、`/api/teacher/schedule` | 教师概览/课表 |
| 学生 | `GET /api/student/dashboard`、`/api/student/schedule` | 学生概览/班级课表 |

## 数据模型（对应报告第 7 章）

| 表/实体 | 关键字段 |
|---------|----------|
| `sys_user` | user_id, username, name, role, status, teacher_id/class_id |
| `sys_role` | role_id, role_name, description |
| `teacher` | teacher_id, teacher_no, name, title, department, max_weekly_hours |
| `class` | class_id, class_no, name, grade, major, student_count |
| `course` | course_id, course_no, course_name, course_type, credit, total_hours, weekly_hours, teacher_id, class_id, room_type |
| `classroom` | room_id, room_no, name, building, floor, room_type, capacity, status |
| `time_slot` | slot_id, day, period, start_time, end_time |
| `teacher_preference` | pref_id, teacher_id, slot_id, level(prefer/avoid/forbid) |
| `schedule_task` | task_id, task_name, semester, algorithm, params, status |
| `schedule_plan` | plan_id, task_id, version, gen_method, fitness, conflict_count, is_active |
| `schedule_item` | item_id, plan_id, course_id, teacher_id, class_id, room_id, slot_id, week_no |
| `conflict` | conflict_id, plan_id, conflict_type, entity_id, description, severity, status |
| `operation_log` | log_id, op_time, op_user, action, target, detail |

## 说明

- 演示数据保存在浏览器 `localStorage` 中（键名 `ccs_schedule_demo_db_v1`），清除浏览器数据可恢复初始数据。
- 演示模式所有密码均为 `123456`，仅用于课程项目演示，生产环境必须使用加密存储与真实认证。
- 旧版“学生选课管理系统”页面已移除，原项目已备份为 `opengauss-web-project_原始备份`。
