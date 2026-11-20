/* ============================================
   智能校园课程排课与调度系统 - 自动排课算法引擎
   与需求分析报告 FR-05、附录 A 对应：
   - 编码：每个课次分配一个“时间段—教室”对
   - 适应度：硬约束大惩罚 + 软约束加权惩罚
   - 遗传操作：锦标赛选择、教学任务块交叉、变异
   - 约束修复：冲突课次定向转移
   ============================================ */
(function (global) {
    'use strict';

    const DEFAULT_WEIGHTS = {
        preference: 0.30,
        distribution: 0.20,
        utilization: 0.15,
        gap: 0.20,
        consecutive: 0.15,
    };
    const HARD_PENALTY = 1000;

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function indexBy(list, key) {
        const map = {};
        (list || []).forEach(item => { map[item[key]] = item; });
        return map;
    }

    function groupBlocks(sessions) {
        const map = new Map();
        sessions.forEach((s, i) => {
            const key = s.course_id + '|' + s.class_id;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(i);
        });
        return Array.from(map.values());
    }

    function buildContext(db, params) {
        params = params || {};
        const weights = Object.assign({}, DEFAULT_WEIGHTS, params.weights || {});
        const slots = (db.time_slots || []).slice().sort((a, b) => a.day - b.day || a.period - b.period);
        const rooms = (db.classrooms || []).filter(r => r.status !== '停用');
        const teachers = indexBy(db.teachers, 'teacher_id');
        const classes = indexBy(db.classes, 'class_id');
        const roomsMap = indexBy(rooms, 'room_id');
        const slotsMap = indexBy(slots, 'slot_id');
        const prefs = {};
        (db.teacher_preferences || []).forEach(p => {
            if (!prefs[p.teacher_id]) prefs[p.teacher_id] = {};
            prefs[p.teacher_id][p.slot_id] = p.level;
        });

        const sessions = [];
        (db.courses || []).forEach(c => {
            const cls = classes[c.class_id];
            const count = Number(c.student_count) || (cls ? Number(cls.student_count) : 40) || 40;
            const hours = Math.max(1, Number(c.weekly_hours) || 2);
            for (let k = 0; k < hours; k++) {
                sessions.push({
                    idx: sessions.length,
                    course_id: c.course_id,
                    course_name: c.course_name,
                    course_type: c.course_type,
                    teacher_id: c.teacher_id,
                    teacher_name: teachers[c.teacher_id] ? teachers[c.teacher_id].name : c.teacher_id,
                    class_id: c.class_id,
                    class_name: cls ? cls.name : c.class_id,
                    student_count: count,
                    room_type: c.room_type || '不限',
                    session_index: k,
                });
            }
        });

        sessions.forEach(s => {
            let candidateRooms = rooms.filter(r =>
                Number(r.capacity) >= s.student_count &&
                (!s.room_type || s.room_type === '不限' || r.room_type === s.room_type)
            );
            if (!candidateRooms.length) {
                candidateRooms = rooms.filter(r => Number(r.capacity) >= s.student_count);
            }
            if (!candidateRooms.length) candidateRooms = rooms.slice();
            let candidateSlots = slots.filter(t =>
                !(prefs[s.teacher_id] && prefs[s.teacher_id][t.slot_id] === 'forbid')
            );
            if (!candidateSlots.length) candidateSlots = slots.slice();
            s.candidates = [];
            candidateSlots.forEach(t => {
                candidateRooms.forEach(r => {
                    s.candidates.push({ slot_id: t.slot_id, room_id: r.room_id, slot: t, room: r });
                });
            });
        });

        return {
            db, params, weights, slots, rooms, teachers, classes,
            roomsMap, slotsMap, prefs, sessions,
            blocks: groupBlocks(sessions),
            n: sessions.length,
        };
    }

    function slotKey(a, b) { return a + '|' + b; }

    function evaluate(ctx, assign) {
        const teacherSlot = new Map();
        const classSlot = new Map();
        const roomSlot = new Map();
        const classCourseDay = new Map();
        const classDayPeriods = new Map();
        let hard = 0, avoid = 0, waste = 0;

        function bump(map, key) {
            const v = (map.get(key) || 0) + 1;
            map.set(key, v);
            return v;
        }

        for (let i = 0; i < ctx.n; i++) {
            const s = ctx.sessions[i];
            const a = assign[i];
            if (!a) { hard++; continue; }
            const slot = ctx.slotsMap[a.slot_id];
            const room = ctx.roomsMap[a.room_id];
            if (!slot || !room) { hard++; continue; }

            if (bump(teacherSlot, slotKey(s.teacher_id, a.slot_id)) > 1) hard++;
            if (bump(classSlot, slotKey(s.class_id, a.slot_id)) > 1) hard++;
            if (bump(roomSlot, slotKey(a.room_id, a.slot_id)) > 1) hard++;
            if (Number(room.capacity) < s.student_count) hard++;
            if (s.room_type && s.room_type !== '不限' && room.room_type !== s.room_type) hard++;
            if (ctx.prefs[s.teacher_id] && ctx.prefs[s.teacher_id][a.slot_id] === 'forbid') hard++;
            if (ctx.prefs[s.teacher_id] && ctx.prefs[s.teacher_id][a.slot_id] === 'avoid') avoid++;

            waste += Math.max(0, (Number(room.capacity) - s.student_count) / Math.max(1, Number(room.capacity)));
            const courseDayKey = slotKey(s.class_id, s.course_id + '|' + slot.day);
            bump(classCourseDay, courseDayKey);
            const dayKey = slotKey(s.class_id, slot.day);
            if (!classDayPeriods.has(dayKey)) classDayPeriods.set(dayKey, []);
            classDayPeriods.get(dayKey).push(slot.period);
        }

        let dup = 0;
        classCourseDay.forEach(v => { if (v > 1) dup += v - 1; });

        let gap = 0, classDays = 0;
        classDayPeriods.forEach(arr => {
            if (arr.length > 1) {
                arr.sort((a, b) => a - b);
                gap += Math.max(0, arr[arr.length - 1] - arr[0] + 1 - arr.length);
            }
            classDays++;
        });

        let noConsecutive = 0, groupsWithMultiple = 0;
        ctx.blocks.forEach(indices => {
            if (indices.length < 2) return;
            groupsWithMultiple++;
            const periods = {};
            indices.forEach(i => {
                const a = assign[i];
                const slot = a ? ctx.slotsMap[a.slot_id] : null;
                if (!slot) return;
                if (!periods[slot.day]) periods[slot.day] = [];
                periods[slot.day].push(slot.period);
            });
            let adjacent = false;
            Object.keys(periods).forEach(day => {
                const arr = periods[day].sort((a, b) => a - b);
                for (let i = 1; i < arr.length; i++) {
                    if (arr[i] - arr[i - 1] === 1) { adjacent = true; break; }
                }
            });
            if (!adjacent) noConsecutive++;
        });

        const n = Math.max(1, ctx.n);
        const scores = {
            preference: Math.min(1, avoid / n),
            distribution: Math.min(1, dup / n),
            utilization: Math.min(1, waste / n),
            gap: Math.min(1, gap / Math.max(1, classDays)),
            consecutive: Math.min(1, noConsecutive / Math.max(1, groupsWithMultiple)),
        };
        const soft = Object.keys(scores).reduce((sum, k) => sum + (ctx.weights[k] || 0) * scores[k], 0);
        return {
            hard, soft, scores, avoid, dup, waste, gap, noConsecutive,
            fitness: 1 / (1 + HARD_PENALTY * hard + soft),
        };
    }

    function partialCost(ctx, assign, idx, cand) {
        const s = ctx.sessions[idx];
        let cost = 0;
        for (let j = 0; j < ctx.n; j++) {
            if (j === idx || !assign[j]) continue;
            const o = ctx.sessions[j], a = assign[j];
            if (a.slot_id !== cand.slot_id) continue;
            if (o.teacher_id === s.teacher_id) cost += HARD_PENALTY;
            if (o.class_id === s.class_id) cost += HARD_PENALTY;
            if (a.room_id === cand.room_id) cost += HARD_PENALTY;
            if (o.class_id === s.class_id && o.course_id === s.course_id) cost += 15;
        }
        const room = cand.room;
        if (Number(room.capacity) < s.student_count) cost += HARD_PENALTY;
        if (s.room_type && s.room_type !== '不限' && room.room_type !== s.room_type) cost += HARD_PENALTY;
        const pref = ctx.prefs[s.teacher_id] && ctx.prefs[s.teacher_id][cand.slot_id];
        if (pref === 'forbid') cost += HARD_PENALTY;
        if (pref === 'avoid') cost += 50;
        if (pref === 'prefer') cost -= 8;
        cost += 6 * Math.max(0, (Number(room.capacity) - s.student_count) / Math.max(1, Number(room.capacity)));
        return cost;
    }

    function randomGreedy(ctx, rng) {
        const assign = new Array(ctx.n).fill(null);
        const order = ctx.sessions.slice().sort((a, b) => {
            const ca = a.candidates.length, cb = b.candidates.length;
            if (ca !== cb) return ca - cb;
            return b.student_count - a.student_count;
        });
        order.forEach(s => {
            const scored = [];
            for (const cand of s.candidates) {
                scored.push({ cand, cost: partialCost(ctx, assign, s.idx, cand) + rng() * 8 });
            }
            scored.sort((a, b) => a.cost - b.cost);
            const top = scored.slice(0, Math.min(6, scored.length));
            let pick = top[0].cand;
            if (top.length > 1 && rng() < 0.55) {
                pick = top[Math.floor(rng() * Math.min(3, top.length))].cand;
            }
            assign[s.idx] = pick;
        });
        return assign;
    }

    function tournament(pop, rng) {
        let best = pop[Math.floor(rng() * pop.length)];
        for (let i = 0; i < 2; i++) {
            const c = pop[Math.floor(rng() * pop.length)];
            if (c.res.fitness > best.res.fitness) best = c;
        }
        return best;
    }

    function crossover(a, b, ctx, rng) {
        const child = new Array(ctx.n);
        ctx.blocks.forEach(indices => {
            const src = rng() < 0.5 ? a : b;
            indices.forEach(i => { child[i] = src[i]; });
        });
        return child;
    }

    function mutate(assign, ctx, rng) {
        const count = 1 + Math.floor(rng() * 4);
        for (let k = 0; k < count; k++) {
            const i = Math.floor(rng() * ctx.n);
            const s = ctx.sessions[i];
            if (s.candidates.length) {
                assign[i] = s.candidates[Math.floor(rng() * s.candidates.length)];
            }
        }
    }

    function findHardIndexes(ctx, assign) {
        const set = new Set();
        const teacherSlot = new Map(), classSlot = new Map(), roomSlot = new Map();
        ctx.sessions.forEach((s, i) => {
            const a = assign[i];
            if (!a) { set.add(i); return; }
            const tKey = slotKey(s.teacher_id, a.slot_id);
            const cKey = slotKey(s.class_id, a.slot_id);
            const rKey = slotKey(a.room_id, a.slot_id);
            if (teacherSlot.has(tKey)) { set.add(i); set.add(teacherSlot.get(tKey)); } else teacherSlot.set(tKey, i);
            if (classSlot.has(cKey)) { set.add(i); set.add(classSlot.get(cKey)); } else classSlot.set(cKey, i);
            if (roomSlot.has(rKey)) { set.add(i); set.add(roomSlot.get(rKey)); } else roomSlot.set(rKey, i);
            const room = ctx.roomsMap[a.room_id];
            if (room && Number(room.capacity) < s.student_count) set.add(i);
            if (room && s.room_type && s.room_type !== '不限' && room.room_type !== s.room_type) set.add(i);
            if (ctx.prefs[s.teacher_id] && ctx.prefs[s.teacher_id][a.slot_id] === 'forbid') set.add(i);
        });
        return Array.from(set);
    }

    function repair(ctx, assign, rng) {
        for (let pass = 0; pass < 12; pass++) {
            const conflicts = findHardIndexes(ctx, assign);
            if (!conflicts.length) break;
            for (const idx of conflicts) {
                const s = ctx.sessions[idx];
                const original = assign[idx];
                let best = original, bestScore = evaluate(ctx, assign).hard;
                for (const cand of s.candidates) {
                    assign[idx] = cand;
                    const score = evaluate(ctx, assign).hard;
                    if (score < bestScore) { bestScore = score; best = cand; }
                    if (bestScore === 0) break;
                }
                assign[idx] = best;
            }
        }
        return assign;
    }

    function decode(ctx, assign) {
        return assign.map((a, i) => {
            const s = ctx.sessions[i];
            const slot = ctx.slotsMap[a.slot_id];
            const room = ctx.roomsMap[a.room_id];
            return {
                session_index: i,
                course_id: s.course_id,
                course_name: s.course_name,
                teacher_id: s.teacher_id,
                teacher_name: s.teacher_name,
                class_id: s.class_id,
                class_name: s.class_name,
                student_count: s.student_count,
                room_type: s.room_type,
                room_id: a.room_id,
                room_name: room ? room.name : a.room_id,
                slot_id: a.slot_id,
                day: slot ? slot.day : 0,
                period: slot ? slot.period : 0,
                week_no: '1-16',
            };
        });
    }

    function buildConflicts(ctx, assign, items) {
        const records = [];
        const seen = new Set();
        const teacherSlot = new Map(), classSlot = new Map(), roomSlot = new Map();

        function push(type, entityId, description, index, severity) {
            const key = type + '|' + entityId + '|' + (index == null ? '' : index);
            if (seen.has(key)) return;
            seen.add(key);
            records.push({
                conflict_type: type,
                entity_id: index != null && items[index] ? items[index].item_id : entityId,
                description,
                severity: severity || 'hard',
                status: 'open',
            });
        }

        ctx.sessions.forEach((s, i) => {
            const a = assign[i];
            if (!a) return;
            const slot = ctx.slotsMap[a.slot_id];
            const dayName = slot ? slot.label : a.slot_id;
            const tKey = slotKey(s.teacher_id, a.slot_id);
            const cKey = slotKey(s.class_id, a.slot_id);
            const rKey = slotKey(a.room_id, a.slot_id);
            if (teacherSlot.has(tKey)) push('教师冲突', s.teacher_id, `教师 ${s.teacher_name} 在 ${dayName} 被安排多门课程`, i, 'hard');
            else teacherSlot.set(tKey, i);
            if (classSlot.has(cKey)) push('班级冲突', s.class_id, `班级 ${s.class_name} 在 ${dayName} 同时安排多门课程`, i, 'hard');
            else classSlot.set(cKey, i);
            if (roomSlot.has(rKey)) push('教室冲突', a.room_id, `教室 ${a.room_id} 在 ${dayName} 被多个教学任务占用`, i, 'hard');
            else roomSlot.set(rKey, i);
            const room = ctx.roomsMap[a.room_id];
            if (room && Number(room.capacity) < s.student_count) push('教室容量不足', a.room_id, `${s.course_name} 修读人数 ${s.student_count} 超过 ${room.name} 容量 ${room.capacity}`, i, 'hard');
            if (room && s.room_type && s.room_type !== '不限' && room.room_type !== s.room_type) push('教室类型不匹配', a.room_id, `${s.course_name} 需要 ${s.room_type}，${room.name} 为 ${room.room_type}`, i, 'hard');
            if (ctx.prefs[s.teacher_id] && ctx.prefs[s.teacher_id][a.slot_id] === 'avoid') {
                push('教师时间偏好', s.teacher_id, `教师 ${s.teacher_name} 的回避时段 ${dayName} 被安排 ${s.course_name}`, i, 'soft');
            }
        });
        return records;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function run(db, params, onProgress) {
        params = params || {};
        const started = Date.now();
        const ctx = buildContext(db, params);
        if (!ctx.n) {
            return {
                items: [], conflicts: [],
                stats: { fitness: 0, hard: 0, soft: 0, conflict_count: 0, sessions: 0, runtime_ms: 0, generations: 0 },
                logs: ['没有可排的教学任务。'],
            };
        }
        const popSize = Math.min(60, Math.max(6, Number(params.populationSize) || 20));
        const generations = Math.min(300, Math.max(8, Number(params.generations) || 50));
        const timeLimit = Math.max(5, Number(params.timeLimit) || 600) * 1000;
        const rng = mulberry32(Number(params.seed) || 2026);
        const logs = [];

        let pop = [];
        for (let i = 0; i < popSize; i++) {
            const assign = randomGreedy(ctx, rng);
            pop.push({ assign, res: evaluate(ctx, assign) });
        }
        pop.sort((a, b) => b.res.fitness - a.res.fitness);
        let best = pop[0];

        for (let gen = 0; gen < generations; gen++) {
            if (Date.now() - started > timeLimit) {
                logs.push(`达到时间上限 ${Math.round(timeLimit / 1000)} 秒，提前终止。`);
                break;
            }
            const next = pop.slice(0, 2).map(x => ({ assign: x.assign.slice(), res: x.res }));
            while (next.length < popSize) {
                const p1 = tournament(pop, rng);
                const p2 = tournament(pop, rng);
                let child = rng() < 0.8 ? crossover(p1.assign, p2.assign, ctx, rng) : p1.assign.slice();
                if (rng() < 0.1) mutate(child, ctx, rng);
                next.push({ assign: child, res: evaluate(ctx, child) });
            }
            pop = next.sort((a, b) => b.res.fitness - a.res.fitness);
            if (pop[0].res.fitness > best.res.fitness) best = pop[0];
            if (onProgress) {
                onProgress({
                    generation: gen + 1,
                    total: generations,
                    fitness: Number(best.res.fitness.toFixed(4)),
                    hard: best.res.hard,
                    soft: Number(best.res.soft.toFixed(4)),
                });
            }
            if (best.res.hard === 0 && best.res.soft < 0.0001) {
                logs.push(`第 ${gen + 1} 代达到理论最优，提前收敛。`);
                break;
            }
            if (gen % 2 === 1) await sleep(0);
        }

        const bestAssign = best.assign.slice();
        repair(ctx, bestAssign, rng);
        const finalRes = evaluate(ctx, bestAssign);
        const items = decode(ctx, bestAssign);
        const conflicts = buildConflicts(ctx, bestAssign, items);
        logs.unshift(`种群规模 ${popSize}，最大迭代 ${generations} 代。`);
        logs.push(`求解完成：适应度 ${finalRes.fitness.toFixed(4)}，硬冲突 ${finalRes.hard}，冲突记录 ${conflicts.length} 条。`);

        return {
            items,
            conflicts,
            stats: {
                fitness: Number(finalRes.fitness.toFixed(4)),
                hard: finalRes.hard,
                soft: Number(finalRes.soft.toFixed(4)),
                conflict_count: conflicts.length,
                sessions: ctx.n,
                population: popSize,
                generations,
                runtime_ms: Date.now() - started,
                scores: finalRes.scores,
            },
            logs,
        };
    }

    const api = { run, buildContext, evaluate, randomGreedy, decode, buildConflicts };
    global.CampusScheduler = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
