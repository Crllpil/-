# 智能校园课程排课与调度系统 — 数据库脚本

数据库：openGauss（兼容 PostgreSQL）
数据库名：`campus_schedule`
Schema：`campus_schedule`

## 执行顺序

```bash
# 1. 使用 opengauss 超级用户创建数据库
gsql -d postgres -U opengauss -W -c "CREATE DATABASE campus_schedule;"

# 2. 按顺序执行
gsql -d campus_schedule -U opengauss -W -f 01_ddl_tables.sql
gsql -d campus_schedule -U opengauss -W -f 02_views.sql
gsql -d campus_schedule -U opengauss -W -f 03_indexes.sql
gsql -d campus_schedule -U opengauss -W -f 04_security.sql
gsql -d campus_schedule -U opengauss -W -f 05_triggers.sql
gsql -d campus_schedule -U opengauss -W -f 06_procedures.sql
gsql -d campus_schedule -U opengauss -W -f 07_seed_data.sql
```

## 脚本说明

| 文件 | 内容 |
|------|------|
| `01_ddl_tables.sql` | 13 张业务表：角色、用户、教师、班级、课程、教室、时间段、教师偏好、排课任务、排课方案、课表条目、冲突记录、操作日志 |
| `02_views.sql` | 当前方案、方案汇总、课表明细、班级/教师/教室课表、教师工作量、教室利用率、冲突汇总、偏好明细 |
| `03_indexes.sql` | 用户、基础数据、排课方案、课表条目、冲突、日志索引 |
| `04_security.sql` | 系统管理员/教务员/教师/学生四类角色与应用账号授权 |
| `05_triggers.sql` | 课表硬约束校验、单一启用方案、启用审计、课表变更审计、启用方案删除保护 |
| `06_procedures.sql` | 启用方案、刷新冲突、人工调整、教师/班级周课时、教室利用率、方案汇总 |
| `07_seed_data.sql` | 演示数据：13 个账号、12 门课程、9 名教师、4 个班级、7 间教室、25 个时间段、21 条教师偏好 |

## 演示账号

初始密码均为 `123456`（数据库中存储 MD5）：

| 角色 | 账号 |
|------|------|
| 系统管理员 | `admin_01` |
| 教务员 | `jw_01` |
| 教师 | `T001` ~ `T009` |
| 学生 | `S001` ~ `S002` |

## 设计说明

- **硬约束**：教师时间冲突、班级时间冲突、教室时间冲突、教室容量、教室类型、教师禁止时段、教师周课时上限，由 `trg_check_item_conflict` 在数据库层强制校验。
- **软约束**：教师回避/偏好时段、课程日分布、教室利用率、班级课表空档、连堂偏好，由 Python 遗传算法在生成方案时优化，并写入 `conflict` 表（severity = `soft`）。
- **方案版本**：`schedule_plan` 通过 `version` 唯一约束保证同一任务版本不重复；`trg_single_active_plan` 保证全局只有一个启用方案。
- **冲突刷新**：生成方案、人工调整后由后端调用 `refresh_conflicts` 逻辑（或执行 `sp_refresh_plan_conflicts`）重新扫描冲突并更新方案统计。
- **审计**：方案启用、课表条目调整/删除自动写入 `operation_log`；登录、基础数据维护等操作由 Flask 后端写入。
