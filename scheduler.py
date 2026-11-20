# -*- coding: utf-8 -*-
"""
智能校园课程排课与调度系统 — 遗传算法排课引擎
对应需求分析报告 FR-05 与附录 A。

输入：课程、教师、班级、教室、时间段、教师时间偏好
输出：课表条目、适应度、硬冲突数、软约束惩罚、运行日志
"""
import random
import time

DEFAULT_WEIGHTS = {
    'preference': 0.30,
    'distribution': 0.20,
    'utilization': 0.15,
    'gap': 0.20,
    'consecutive': 0.15,
}
HARD_PENALTY = 1000


def _index(rows, key):
    return {row[key]: row for row in rows}


def build_context(db, params=None):
    params = params or {}
    weights = dict(DEFAULT_WEIGHTS)
    weights.update(params.get('weights') or {})
    slots = sorted(db['time_slots'], key=lambda s: (s['day'], s['period']))
    rooms = [r for r in db['classrooms'] if r.get('status') == '可用']
    teachers = _index(db['teachers'], 'teacher_id')
    classes = _index(db['classes'], 'class_id')
    rooms_map = _index(rooms, 'room_id')
    slots_map = _index(slots, 'slot_id')

    prefs = {}
    for p in db.get('teacher_preferences', []):
        prefs.setdefault(p['teacher_id'], {})[p['slot_id']] = p['level']

    sessions = []
    for c in db['courses']:
        cls = classes.get(c['class_id'])
        count = int(c.get('student_count') or (cls or {}).get('student_count') or 40)
        hours = max(1, int(c.get('weekly_hours') or 2))
        for k in range(hours):
            sessions.append({
                'idx': len(sessions),
                'course_id': c['course_id'],
                'course_name': c['course_name'],
                'course_type': c.get('course_type'),
                'teacher_id': c['teacher_id'],
                'teacher_name': (teachers.get(c['teacher_id']) or {}).get('name', str(c['teacher_id'])),
                'class_id': c['class_id'],
                'class_name': (cls or {}).get('name', str(c['class_id'])),
                'student_count': count,
                'room_type': c.get('room_type') or '不限',
                'session_index': k,
            })

    for s in sessions:
        cand_rooms = [r for r in rooms
                      if int(r['capacity']) >= s['student_count']
                      and (s['room_type'] == '不限' or r['room_type'] == s['room_type'])]
        if not cand_rooms:
            cand_rooms = [r for r in rooms if int(r['capacity']) >= s['student_count']]
        if not cand_rooms:
            cand_rooms = list(rooms)
        cand_slots = [t for t in slots
                      if prefs.get(s['teacher_id'], {}).get(t['slot_id']) != 'forbid']
        if not cand_slots:
            cand_slots = list(slots)
        s['candidates'] = [
            {'slot_id': t['slot_id'], 'room_id': r['room_id'], 'slot': t, 'room': r}
            for t in cand_slots for r in cand_rooms
        ]

    blocks = {}
    for s in sessions:
        key = (s['course_id'], s['class_id'])
        blocks.setdefault(key, []).append(s['idx'])

    return {
        'slots': slots, 'rooms': rooms, 'teachers': teachers, 'classes': classes,
        'rooms_map': rooms_map, 'slots_map': slots_map, 'prefs': prefs,
        'sessions': sessions, 'weights': weights, 'blocks': list(blocks.values()),
        'n': len(sessions),
    }


def evaluate(ctx, assign):
    teacher_slot = {}
    class_slot = {}
    room_slot = {}
    class_course_day = {}
    class_day_periods = {}
    hard = 0
    avoid = 0
    waste = 0.0

    for i, s in enumerate(ctx['sessions']):
        a = assign[i]
        if not a:
            hard += 1
            continue
        slot = ctx['slots_map'].get(a['slot_id'])
        room = ctx['rooms_map'].get(a['room_id'])
        if not slot or not room:
            hard += 1
            continue

        tk = (s['teacher_id'], a['slot_id'])
        ck = (s['class_id'], a['slot_id'])
        rk = (a['room_id'], a['slot_id'])
        teacher_slot[tk] = teacher_slot.get(tk, 0) + 1
        class_slot[ck] = class_slot.get(ck, 0) + 1
        room_slot[rk] = room_slot.get(rk, 0) + 1
        if teacher_slot[tk] > 1:
            hard += 1
        if class_slot[ck] > 1:
            hard += 1
        if room_slot[rk] > 1:
            hard += 1
        if int(room['capacity']) < s['student_count']:
            hard += 1
        if s['room_type'] != '不限' and room['room_type'] != s['room_type']:
            hard += 1
        pref = ctx['prefs'].get(s['teacher_id'], {}).get(a['slot_id'])
        if pref == 'forbid':
            hard += 1
        elif pref == 'avoid':
            avoid += 1

        cap = max(1, int(room['capacity']))
        waste += max(0.0, (cap - s['student_count']) / cap)
        cck = (s['class_id'], s['course_id'], slot['day'])
        class_course_day[cck] = class_course_day.get(cck, 0) + 1
        class_day_periods.setdefault((s['class_id'], slot['day']), []).append(slot['period'])

    dup = sum(v - 1 for v in class_course_day.values() if v > 1)
    gap = 0
    for periods in class_day_periods.values():
        if len(periods) > 1:
            periods = sorted(periods)
            gap += max(0, periods[-1] - periods[0] + 1 - len(periods))

    no_consecutive = 0
    groups = 0
    for indices in ctx['blocks']:
        if len(indices) < 2:
            continue
        groups += 1
        by_day = {}
        for i in indices:
            a = assign[i]
            slot = ctx['slots_map'].get(a['slot_id']) if a else None
            if slot:
                by_day.setdefault(slot['day'], []).append(slot['period'])
        adjacent = False
        for periods in by_day.values():
            periods = sorted(periods)
            if any(periods[k] - periods[k - 1] == 1 for k in range(1, len(periods))):
                adjacent = True
                break
        if not adjacent:
            no_consecutive += 1

    n = max(1, ctx['n'])
    scores = {
        'preference': min(1.0, avoid / n),
        'distribution': min(1.0, dup / n),
        'utilization': min(1.0, waste / n),
        'gap': min(1.0, gap / max(1, len(class_day_periods))),
        'consecutive': min(1.0, no_consecutive / max(1, groups)),
    }
    soft = sum(ctx['weights'].get(k, 0) * v for k, v in scores.items())
    return {
        'hard': hard, 'soft': soft, 'scores': scores,
        'avoid': avoid, 'dup': dup, 'waste': waste, 'gap': gap,
        'no_consecutive': no_consecutive,
        'fitness': 1.0 / (1.0 + HARD_PENALTY * hard + soft),
    }


def _partial_cost(ctx, assign, idx, cand):
    s = ctx['sessions'][idx]
    cost = 0.0
    for j, o in enumerate(ctx['sessions']):
        a = assign[j]
        if j == idx or not a or a['slot_id'] != cand['slot_id']:
            continue
        if o['teacher_id'] == s['teacher_id']:
            cost += HARD_PENALTY
        if o['class_id'] == s['class_id']:
            cost += HARD_PENALTY
        if a['room_id'] == cand['room_id']:
            cost += HARD_PENALTY
        if o['class_id'] == s['class_id'] and o['course_id'] == s['course_id']:
            cost += 15
    room = cand['room']
    if int(room['capacity']) < s['student_count']:
        cost += HARD_PENALTY
    if s['room_type'] != '不限' and room['room_type'] != s['room_type']:
        cost += HARD_PENALTY
    pref = ctx['prefs'].get(s['teacher_id'], {}).get(cand['slot_id'])
    if pref == 'forbid':
        cost += HARD_PENALTY
    elif pref == 'avoid':
        cost += 50
    elif pref == 'prefer':
        cost -= 8
    cost += 6 * max(0.0, (int(room['capacity']) - s['student_count']) / max(1, int(room['capacity'])))
    return cost


def random_greedy(ctx, rng):
    assign = [None] * ctx['n']
    order = sorted(ctx['sessions'], key=lambda s: (len(s['candidates']), -s['student_count']))
    for s in order:
        scored = [(_partial_cost(ctx, assign, s['idx'], c) + rng.random() * 8, c) for c in s['candidates']]
        scored.sort(key=lambda x: x[0])
        top = scored[:min(6, len(scored))]
        if len(top) > 1 and rng.random() < 0.55:
            pick = top[rng.randrange(min(3, len(top)))][1]
        else:
            pick = top[0][1]
        assign[s['idx']] = pick
    return assign


def _tournament(pop, rng):
    best = pop[rng.randrange(len(pop))]
    for _ in range(2):
        c = pop[rng.randrange(len(pop))]
        if c['res']['fitness'] > best['res']['fitness']:
            best = c
    return best


def _crossover(a, b, ctx, rng):
    child = [None] * ctx['n']
    for indices in ctx['blocks']:
        src = a if rng.random() < 0.5 else b
        for i in indices:
            child[i] = src[i]
    return child


def _mutate(assign, ctx, rng):
    for _ in range(1 + rng.randrange(4)):
        i = rng.randrange(ctx['n'])
        cands = ctx['sessions'][i]['candidates']
        if cands:
            assign[i] = cands[rng.randrange(len(cands))]


def _hard_indexes(ctx, assign):
    found = set()
    teacher_slot, class_slot, room_slot = {}, {}, {}
    for i, s in enumerate(ctx['sessions']):
        a = assign[i]
        if not a:
            found.add(i)
            continue
        for key_map, key, self_i in (
            (teacher_slot, (s['teacher_id'], a['slot_id']), i),
            (class_slot, (s['class_id'], a['slot_id']), i),
            (room_slot, (a['room_id'], a['slot_id']), i),
        ):
            if key in key_map:
                found.add(i)
                found.add(key_map[key])
            else:
                key_map[key] = self_i
        room = ctx['rooms_map'].get(a['room_id'])
        if not room or int(room['capacity']) < s['student_count']:
            found.add(i)
        if room and s['room_type'] != '不限' and room['room_type'] != s['room_type']:
            found.add(i)
        if ctx['prefs'].get(s['teacher_id'], {}).get(a['slot_id']) == 'forbid':
            found.add(i)
    return list(found)


def _repair(ctx, assign):
    for _ in range(12):
        conflicts = _hard_indexes(ctx, assign)
        if not conflicts:
            break
        for idx in conflicts:
            original = assign[idx]
            best = original
            best_score = evaluate(ctx, assign)['hard']
            for cand in ctx['sessions'][idx]['candidates']:
                assign[idx] = cand
                score = evaluate(ctx, assign)['hard']
                if score < best_score:
                    best_score = score
                    best = cand
                    if best_score == 0:
                        break
            assign[idx] = best
    return assign


def decode(ctx, assign):
    items = []
    for i, a in enumerate(assign):
        s = ctx['sessions'][i]
        slot = ctx['slots_map'][a['slot_id']]
        room = ctx['rooms_map'][a['room_id']]
        items.append({
            'session_index': i,
            'course_id': s['course_id'],
            'course_name': s['course_name'],
            'teacher_id': s['teacher_id'],
            'teacher_name': s['teacher_name'],
            'class_id': s['class_id'],
            'class_name': s['class_name'],
            'room_id': a['room_id'],
            'room_name': room['name'],
            'slot_id': a['slot_id'],
            'day': slot['day'],
            'period': slot['period'],
            'week_no': '1-16',
            'student_count': s['student_count'],
            'room_type': s['room_type'],
        })
    return items


def run(db, params=None, progress=None):
    params = params or {}
    started = time.time()
    ctx = build_context(db, params)
    logs = []
    if ctx['n'] == 0:
        return {
            'items': [], 'stats': {'fitness': 0, 'hard': 0, 'soft': 0, 'conflict_count': 0,
                                    'sessions': 0, 'runtime_ms': 0, 'generations': 0},
            'logs': ['没有可排的教学任务。'],
        }

    # 基础可行性检查：教师周课时上限、班级周课次上限
    teacher_hours = {}
    class_hours = {}
    for s in ctx['sessions']:
        teacher_hours[s['teacher_id']] = teacher_hours.get(s['teacher_id'], 0) + 1
        class_hours[s['class_id']] = class_hours.get(s['class_id'], 0) + 1
    for tid, hours in teacher_hours.items():
        teacher = ctx['teachers'].get(tid) or {}
        limit = int(teacher.get('max_weekly_hours') or 0)
        if limit and hours > limit:
            raise ValueError('教师 %s 周课时 %d 超过上限 %d'
                             % (teacher.get('name', tid), hours, limit))
    for cid, hours in class_hours.items():
        if hours > 25:
            raise ValueError('班级 %s 周课次 %d 超过 25 个可用时间段'
                             % ((ctx['classes'].get(cid) or {}).get('name', cid), hours))

    pop_size = min(60, max(6, int(params.get('populationSize') or 20)))
    generations = min(300, max(8, int(params.get('generations') or 50)))
    time_limit = max(5, int(params.get('timeLimit') or 600))
    seed = int(params.get('seed') or 2026)
    rng = random.Random(seed)

    population = []
    for _ in range(pop_size):
        assign = random_greedy(ctx, rng)
        population.append({'assign': assign, 'res': evaluate(ctx, assign)})
    population.sort(key=lambda x: -x['res']['fitness'])
    best = population[0]

    for gen in range(generations):
        if time.time() - started > time_limit:
            logs.append('达到时间上限 %d 秒，提前终止。' % time_limit)
            break
        nxt = [{'assign': p['assign'][:], 'res': p['res']} for p in population[:2]]
        while len(nxt) < pop_size:
            p1 = _tournament(population, rng)
            p2 = _tournament(population, rng)
            child = _crossover(p1['assign'], p2['assign'], ctx, rng) if rng.random() < 0.8 else p1['assign'][:]
            if rng.random() < 0.1:
                _mutate(child, ctx, rng)
            nxt.append({'assign': child, 'res': evaluate(ctx, child)})
        population = sorted(nxt, key=lambda x: -x['res']['fitness'])
        if population[0]['res']['fitness'] > best['res']['fitness']:
            best = population[0]
        if progress:
            progress({
                'generation': gen + 1, 'total': generations,
                'fitness': round(best['res']['fitness'], 4),
                'hard': best['res']['hard'], 'soft': round(best['res']['soft'], 4),
            })
        if best['res']['hard'] == 0 and best['res']['soft'] < 0.0001:
            logs.append('第 %d 代达到理论最优，提前收敛。' % (gen + 1))
            break

    best_assign = best['assign'][:]
    _repair(ctx, best_assign)
    final = evaluate(ctx, best_assign)
    items = decode(ctx, best_assign)
    logs.insert(0, '种群规模 %d，最大迭代 %d 代。' % (pop_size, generations))
    logs.append('求解完成：适应度 %.4f，硬冲突 %d，软约束惩罚 %.4f。'
                % (final['fitness'], final['hard'], final['soft']))
    return {
        'items': items,
        'stats': {
            'fitness': round(final['fitness'], 4),
            'hard': final['hard'],
            'soft': round(final['soft'], 4),
            'conflict_count': 0,
            'sessions': ctx['n'],
            'population': pop_size,
            'generations': generations,
            'runtime_ms': int((time.time() - started) * 1000),
            'scores': final['scores'],
        },
        'logs': logs,
    }
