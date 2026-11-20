# 智能校园课程排课与调度系统

本项目按照《智能校园课程排课与调度系统_用户需求分析报告》实现，技术栈为 **HTML5 + Bootstrap 5 + Flask + openGauss**，覆盖报告中的 FR-01～FR-10 功能需求。

## 目录结构

```
24050236杨欣豪-24050237余泽凯-24050238钟劲森/
├── app.py                          # Flask 后端（全部 REST API）
├── scheduler.py                    # Python 遗传算法排课引擎
├── 前端相关代码及文件/
│   └── opengauss-web-project/      # 前端页面、样式、JS、离线演示数据
├── 数据库SQL代码/
│   ├── 01_ddl_tables.sql           # 13 张业务表
│   ├── 02_views.sql                # 课表/工作量/利用率等视图
│   ├── 03_indexes.sql              # 索引
│   ├── 04_security.sql             # RBAC 角色与权限
│   ├── 05_triggers.sql             # 冲突校验、方案启用、审计触发器
│   ├── 06_procedures.sql           # 启用方案、刷新冲突、人工调整等函数
│   ├── 07_seed_data.sql            # 演示数据
│   └── README.md                   # 数据库执行说明
├── 报告文档/                        # 原有课程设计文档
└── PowerDesigner文件/               # 原有模型文件
```

## 快速启动

### 1. 初始化 openGauss

```bash
gsql -d postgres -U omm -W -c "CREATE DATABASE campus_schedule;"
cd 数据库SQL代码
for f in 01_ddl_tables.sql 02_views.sql 03_indexes.sql 04_security.sql 05_triggers.sql 06_procedures.sql 07_seed_data.sql; do
  gsql -d campus_schedule -U omm -W -f "$f"
done
```

### 2. 启动后端

```bash
# 安装依赖（如尚未安装）
pip3 install -r requirements.txt

su -s /bin/bash - opengauss
cd /tmp
python3 /mnt/c/Users/13087/Desktop/24050236杨欣豪-24050237余泽凯-24050238钟劲森/app.py
```

浏览器访问 `http://localhost:5000`。

### 3. 首次排课

使用教务员账号 `jw_01` 登录，进入 **排课任务**，点击任务的 **运行** 按钮。遗传算法会生成方案，自动写入课表条目与冲突记录；若当前没有启用方案，则自动启用。

## 演示账号

密码均为 `123456`：

| 角色 | 账号 |
|------|------|
| 系统管理员 | `admin_01` |
| 教务员 | `jw_01` |
| 教师 | `T001` ～ `T009` |
| 学生 | `S001`、`S002` |

## 主要功能

- **系统管理员**：用户与权限、角色、操作日志。
- **教务员**：课程/教师/班级/教室/时间段管理、排课任务、遗传算法自动排课、课表展示、人工调整、冲突检测、方案版本与差异对比、统计报表。
- **教师**：个人课表、偏好/回避/禁止三级时间偏好。
- **学生**：班级课表、课程与教室信息。

## 说明

- 前端在后端不可用时会自动切换到 `js/mock.js` 的离线演示数据，便于单独展示页面。
- 数据库脚本执行顺序、表结构和演示数据说明见 `数据库SQL代码/README.md`。
- 原项目文件已备份为 `app.py_原始备份`、`数据库SQL代码_原始备份`、`前端相关代码及文件/opengauss-web-project_原始备份`。
