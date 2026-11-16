"""Симуляция: адаптивный Elo-подбор против случайного.

Виртуальный ученик имеет истинный уровень θ по каждой теме. Решает задачу
с вероятностью expected(θ, d). Навык растёт, если задача в «зоне ближайшего
развития» (вероятность решить 0.5–0.85). Сравниваем:
  1) RMSE оценки рейтинга относительно истинного уровня (точность диагностики);
  2) средний истинный уровень после N задач (прирост знаний).
Запуск из консоли: python -m app.sim
"""
import math
import random

from .core import START_RATING, expected, k_student, pick_task, pick_topic

N_TOPICS = 8


class T:
    def __init__(self, topic, rating):
        self.topic, self.rating = topic, rating


def _bank(rng):
    return [T(k, rng.gauss(1150, 220)) for k in range(N_TOPICS) for _ in range(40)]


def _run_policy(policy: str, n_students: int, steps: int, seed: int):
    rng = random.Random(seed)
    bank = _bank(rng)
    by_topic = {k: [t for t in bank if t.topic == k] for k in range(N_TOPICS)}
    rmse = [0.0] * steps
    ability = [0.0] * steps
    for _ in range(n_students):
        theta = {k: rng.gauss(1000, 200) for k in range(N_TOPICS)}
        est = {k: START_RATING for k in range(N_TOPICS)}
        att = {k: 0 for k in range(N_TOPICS)}
        for s in range(steps):
            if policy == "adaptive":
                k = pick_topic(est, rng)
                task = pick_task(by_topic[k], est[k], rng)
            else:
                k = rng.randrange(N_TOPICS)
                task = rng.choice(by_topic[k])
            p_true = expected(theta[k], task.rating)
            ok = rng.random() < p_true
            est[k] += k_student(att[k]) * ((1.0 if ok else 0.0) - expected(est[k], task.rating))
            att[k] += 1
            if 0.5 <= p_true <= 0.85:  # обучение в зоне ближайшего развития
                theta[k] += 12
            elif p_true > 0.85:
                theta[k] += 2
            rmse[s] += sum((est[j] - theta[j]) ** 2 for j in theta) / N_TOPICS
            ability[s] += sum(theta.values()) / N_TOPICS
    return ([round(math.sqrt(x / n_students), 1) for x in rmse],
            [round(x / n_students, 1) for x in ability])


def run(n_students=200, steps=60, seed=42):
    a_rmse, a_ab = _run_policy("adaptive", n_students, steps, seed)
    r_rmse, r_ab = _run_policy("random", n_students, steps, seed)
    return {
        "steps": list(range(1, steps + 1)),
        "adaptive": {"rmse": a_rmse, "ability": a_ab},
        "random": {"rmse": r_rmse, "ability": r_ab},
        "summary": {
            "final_ability_gain_adaptive": round(a_ab[-1] - a_ab[0], 1),
            "final_ability_gain_random": round(r_ab[-1] - r_ab[0], 1),
            "final_rmse_adaptive": a_rmse[-1],
            "final_rmse_random": r_rmse[-1],
        },
    }


if __name__ == "__main__":
    import json
    print(json.dumps(run()["summary"], indent=2))
