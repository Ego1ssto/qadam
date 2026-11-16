"""Claude: вариации задач по шаблону и подсказки при ошибке."""
import json
import os

MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-5-5")

VARIATION_SCHEMA = {
    "type": "object",
    "properties": {
        "variations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "statement_ru": {"type": "string"},
                    "statement_kz": {"type": "string"},
                    "solution_ru": {"type": "string"},
                    "solution_kz": {"type": "string"},
                    "answer": {"type": "string"},
                },
                "required": ["statement_ru", "statement_kz", "solution_ru", "solution_kz", "answer"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["variations"],
    "additionalProperties": False,
}


def enabled() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY"))


def _client():
    import anthropic
    return anthropic.Anthropic()


def _text(resp) -> str:
    return "".join(b.text for b in resp.content if b.type == "text")


def generate_variations(task, n: int = 3) -> list[dict]:
    prompt = f"""Ты составляешь задачи для подготовки к поступлению в БИЛ/НИШ/РФМШ (4–6 класс).
Вот задача-образец:
RU: {task.statement_ru}
KZ: {task.statement_kz}
Решение: {task.solution_ru}
Ответ: {task.answer}

Сделай {n} вариации: та же идея и тот же метод решения, но другие числа и сюжет
(казахстанские имена и реалии). Сложность — как у образца. Ответ — одно число
(или несколько допустимых записей через "|"). Формулы в LaTeX внутри $...$.
Казахский текст — грамотный литературный казахский. Перепроверь каждый ответ."""
    resp = _client().messages.create(
        model=MODEL,
        max_tokens=16000,
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": VARIATION_SCHEMA}},
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(_text(resp))["variations"]


def hint(task, wrong_answer: str, lang: str) -> str:
    language = "на казахском языке" if lang == "kz" else "на русском языке"
    statement = task.statement_kz if lang == "kz" else task.statement_ru
    if not enabled():
        # офлайн-режим: общая подсказка, ответ не раскрываем
        if lang == "kz":
            return "Шартты қайта оқып, белгілі және белгісіз шамаларды жазып шығыңыз. Есептеулеріңізді тексеріңіз."
        return "Перечитайте условие и выпишите, что известно и что нужно найти. Проверьте вычисления."
    resp = _client().messages.create(
        model=MODEL,
        max_tokens=2000,
        output_config={"effort": "low"},
        system=("Ты добрый репетитор по математике для школьника 10–12 лет. "
                "Дай одну короткую подсказку (1–2 предложения), которая укажет на ошибку "
                "или следующий шаг. НЕ называй правильный ответ и не решай задачу целиком."),
        messages=[{"role": "user", "content":
                   f"Задача: {statement}\nЭталонное решение (не раскрывать): {task.solution_ru}\n"
                   f"Правильный ответ (не раскрывать): {task.answer}\n"
                   f"Ответ ученика: {wrong_answer}\nОтветь {language}."}],
    )
    return _text(resp).strip()
