"""Модели БД, Elo-алгоритм и проверка ответов."""
import math
import os
import random
from datetime import datetime
from fractions import Fraction

from sqlalchemy import (JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text,
                        create_engine)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./qadam.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True)
    name: Mapped[str] = mapped_column(String)
    password_hash: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)  # student | tutor
    invite_code: Mapped[str | None] = mapped_column(String, nullable=True)  # у репетитора
    tutor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # профиль
    grade: Mapped[int | None] = mapped_column(Integer, nullable=True)  # класс
    target: Mapped[str | None] = mapped_column(String, nullable=True)  # БИЛ | НИШ | РФМШ
    city: Mapped[str | None] = mapped_column(String, nullable=True)
    exam_date: Mapped[str | None] = mapped_column(String, nullable=True)  # YYYY-MM-DD
    lang: Mapped[str | None] = mapped_column(String, nullable=True)  # ru | kz
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)


PROFILE_COLUMNS = [("grade", "INTEGER"), ("target", "VARCHAR"), ("city", "VARCHAR"),
                   ("exam_date", "VARCHAR"), ("lang", "VARCHAR"), ("bio", "TEXT")]


class Topic(Base):
    __tablename__ = "topics"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String, unique=True)
    name_ru: Mapped[str] = mapped_column(String)
    name_kz: Mapped[str] = mapped_column(String)


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id"))
    statement_ru: Mapped[str] = mapped_column(Text)
    statement_kz: Mapped[str] = mapped_column(Text)
    solution_ru: Mapped[str] = mapped_column(Text, default="")
    solution_kz: Mapped[str] = mapped_column(Text, default="")
    answer: Mapped[str] = mapped_column(String)  # варианты через "|"
    rating: Mapped[float] = mapped_column(Float, default=1000)
    status: Mapped[str] = mapped_column(String, default="approved")  # approved | pending
    source: Mapped[str] = mapped_column(String, default="seed")  # seed | llm | tutor
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)


class Skill(Base):
    __tablename__ = "skills"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id"))
    rating: Mapped[float] = mapped_column(Float, default=1000)
    attempts: Mapped[int] = mapped_column(Integer, default=0)


class Attempt(Base):
    __tablename__ = "attempts"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    answer: Mapped[str] = mapped_column(String)
    correct: Mapped[bool] = mapped_column(Boolean)
    rating_after: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


# ---------------- Elo ----------------
START_RATING = 1000.0
TARGET_P = 0.7  # целевая вероятность решить задачу («зона ближайшего развития»)


def expected(student: float, task: float) -> float:
    """Вероятность, что ученик с рейтингом student решит задачу с рейтингом task."""
    return 1 / (1 + 10 ** ((task - student) / 400))


def k_student(attempts: int) -> float:
    # высокая скорость обучения в начале, потом стабилизация
    return max(16.0, 48.0 / (1 + attempts / 10))


def update(student: float, task: float, score: float, attempts: int) -> tuple[float, float]:
    p = expected(student, task)
    return student + k_student(attempts) * (score - p), task - 8.0 * (score - p)


def target_task_rating(student: float, p: float = TARGET_P) -> float:
    # решаем 1/(1+10^((t-s)/400)) = p  ->  t = s + 400*log10(1/p - 1)
    return student + 400 * math.log10(1 / p - 1)


def pick_topic(skills: dict[int, float], rng=random) -> int:
    """Чаще всего — самая слабая тема, иногда случайная (чтобы не застревать)."""
    if rng.random() < 0.25:
        return rng.choice(list(skills))
    return min(skills, key=skills.get)


def pick_task(tasks: list, student_rating: float, rng=random):
    """Задача с рейтингом ближе всего к целевому; случайный выбор из трёх лучших."""
    if not tasks:
        return None
    target = target_task_rating(student_rating)
    best = sorted(tasks, key=lambda t: abs(t.rating - target))[:2]
    return rng.choice(best)


# ---------------- Проверка ответа ----------------
def _num(s: str) -> Fraction | None:
    s = s.strip().replace(",", ".").replace(" ", "").rstrip("%")
    try:
        return Fraction(s)
    except (ValueError, ZeroDivisionError):
        return None


def check_answer(given: str, correct: str) -> bool:
    for variant in correct.split("|"):
        a, b = _num(given), _num(variant)
        if a is not None and b is not None:
            if a == b:
                return True
        elif given.strip().lower() == variant.strip().lower():
            return True
    return False
