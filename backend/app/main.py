import hashlib
import os
import secrets
from datetime import datetime, timedelta

import jwt
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

from . import llm, sim
from .core import (PROFILE_COLUMNS, Attempt, Base, SessionLocal, Skill, Task, Topic, User,
                   check_answer, engine, expected, pick_task, pick_topic, update)
from .seed_data import seed

SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
app = FastAPI(title="Qadam API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)
    # лёгкая миграция: добавляем поля профиля в уже существующую таблицу users
    cols = {c["name"] for c in inspect(engine).get_columns("users")}
    with engine.begin() as conn:
        for name, typ in PROFILE_COLUMNS:
            if name not in cols:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {typ}"))
    with SessionLocal() as db:
        seed(db)


def get_db():
    with SessionLocal() as db:
        yield db


def hash_pw(pw: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(8)
    return salt + "$" + hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 100_000).hex()


def current_user(authorization: str = Header(""), db: Session = Depends(get_db)) -> User:
    try:
        uid = jwt.decode(authorization.removeprefix("Bearer "), SECRET, algorithms=["HS256"])["sub"]
    except Exception:
        raise HTTPException(401, "Не авторизован")
    user = db.get(User, int(uid))
    if not user:
        raise HTTPException(401, "Не авторизован")
    return user


def tutor_only(user: User = Depends(current_user)) -> User:
    if user.role != "tutor":
        raise HTTPException(403, "Только для репетитора")
    return user


def token_for(user: User) -> dict:
    tok = jwt.encode({"sub": str(user.id), "exp": datetime.utcnow() + timedelta(days=7)}, SECRET)
    return {"token": tok, "user": user_out(user)}


def user_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role, "invite_code": u.invite_code,
            "grade": u.grade, "target": u.target, "city": u.city, "exam_date": u.exam_date,
            "lang": u.lang, "bio": u.bio}


def task_out(t: Task, with_answer=False) -> dict:
    d = {"id": t.id, "topic_id": t.topic_id, "statement_ru": t.statement_ru,
         "statement_kz": t.statement_kz, "rating": round(t.rating), "status": t.status,
         "source": t.source, "parent_id": t.parent_id}
    if with_answer:
        d |= {"answer": t.answer, "solution_ru": t.solution_ru, "solution_kz": t.solution_kz}
    return d


def skills_of(db: Session, user: User) -> dict[int, Skill]:
    topics = db.scalars(select(Topic)).all()
    have = {s.topic_id: s for s in db.scalars(select(Skill).where(Skill.user_id == user.id))}
    for t in topics:
        if t.id not in have:
            have[t.id] = Skill(user_id=user.id, topic_id=t.id)
            db.add(have[t.id])
    db.flush()
    return have


# ---------------- Auth ----------------
class RegisterIn(BaseModel):
    email: str
    name: str
    password: str
    role: str = "student"
    invite_code: str | None = None


class LoginIn(BaseModel):
    email: str
    password: str


@app.post("/api/auth/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(400, "Email уже занят")
    u = User(email=body.email, name=body.name, password_hash=hash_pw(body.password),
             role="tutor" if body.role == "tutor" else "student")
    if u.role == "tutor":
        u.invite_code = secrets.token_hex(3).upper()
    elif body.invite_code:
        tutor = db.scalar(select(User).where(User.invite_code == body.invite_code.upper()))
        if not tutor:
            raise HTTPException(400, "Неверный код репетитора")
        u.tutor_id = tutor.id
    db.add(u)
    db.commit()
    return token_for(u)


@app.post("/api/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == body.email))
    if not u or hash_pw(body.password, u.password_hash.split("$")[0]) != u.password_hash:
        raise HTTPException(400, "Неверный email или пароль")
    return token_for(u)


@app.get("/api/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


@app.get("/api/topics")
def topics(db: Session = Depends(get_db)):
    return [{"id": t.id, "slug": t.slug, "name_ru": t.name_ru, "name_kz": t.name_kz}
            for t in db.scalars(select(Topic))]


# ---------------- Student ----------------
@app.get("/api/student/next")
def next_task(topic_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    skills = skills_of(db, user)
    tid = topic_id or pick_topic({k: s.rating for k, s in skills.items()})
    solved = set(db.scalars(select(Attempt.task_id).where(Attempt.user_id == user.id, Attempt.correct)))
    recent = set(db.scalars(select(Attempt.task_id).where(Attempt.user_id == user.id)
                            .order_by(Attempt.id.desc()).limit(5)))
    pool = [t for t in db.scalars(select(Task).where(Task.topic_id == tid, Task.status == "approved"))
            if t.id not in solved and t.id not in recent]
    if not pool:  # тема пройдена — повторяем
        pool = [t for t in db.scalars(select(Task).where(Task.topic_id == tid, Task.status == "approved"))
                if t.id not in recent]
    task = pick_task(pool, skills[tid].rating)
    db.commit()
    if not task:
        raise HTTPException(404, "Нет задач")
    return task_out(task) | {"p_solve": round(expected(skills[tid].rating, task.rating), 2)}


class AnswerIn(BaseModel):
    task_id: int
    answer: str
    used_hint: bool = False


@app.post("/api/student/answer")
def answer(body: AnswerIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    task = db.get(Task, body.task_id)
    if not task:
        raise HTTPException(404)
    skill = skills_of(db, user)[task.topic_id]
    ok = check_answer(body.answer, task.answer)
    score = (0.6 if body.used_hint else 1.0) if ok else 0.0
    before = skill.rating
    skill.rating, task.rating = update(skill.rating, task.rating, score, skill.attempts)
    skill.attempts += 1
    db.add(Attempt(user_id=user.id, task_id=task.id, answer=body.answer, correct=ok,
                   rating_after=skill.rating, meta={"hint": body.used_hint}))
    db.commit()
    return {"correct": ok, "rating_before": round(before), "rating": round(skill.rating),
            **({"answer": task.answer.split("|")[0], "solution_ru": task.solution_ru,
                "solution_kz": task.solution_kz} if ok else {})}


class HintIn(BaseModel):
    task_id: int
    answer: str
    lang: str = "ru"


@app.post("/api/student/hint")
def get_hint(body: HintIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    task = db.get(Task, body.task_id)
    try:
        return {"hint": llm.hint(task, body.answer, body.lang)}
    except Exception as e:
        raise HTTPException(502, f"LLM недоступна: {e}")


@app.post("/api/student/reveal/{task_id}")
def reveal(task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    return {"answer": t.answer.split("|")[0], "solution_ru": t.solution_ru, "solution_kz": t.solution_kz}


def progress(db: Session, user: User) -> dict:
    skills = skills_of(db, user)
    atts = db.scalars(select(Attempt).where(Attempt.user_id == user.id).order_by(Attempt.id)).all()
    db.commit()
    return {
        "user": user_out(user),
        "skills": [{"topic_id": k, "rating": round(s.rating), "attempts": s.attempts} for k, s in skills.items()],
        "total": len(atts),
        "correct": sum(a.correct for a in atts),
        "history": [{"i": i + 1, "topic_id": db.get(Task, a.task_id).topic_id, "rating": round(a.rating_after),
                     "correct": a.correct} for i, a in enumerate(atts)],
    }


@app.get("/api/student/progress")
def my_progress(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return progress(db, user)


# ---------------- Tutor ----------------
@app.get("/api/tutor/students")
def students(user: User = Depends(tutor_only), db: Session = Depends(get_db)):
    return [progress(db, s) for s in db.scalars(select(User).where(User.tutor_id == user.id))]


@app.get("/api/tutor/tasks")
def tasks(status: str | None = None, topic_id: int | None = None,
          user: User = Depends(tutor_only), db: Session = Depends(get_db)):
    q = select(Task)
    if status:
        q = q.where(Task.status == status)
    if topic_id:
        q = q.where(Task.topic_id == topic_id)
    return [task_out(t, True) for t in db.scalars(q.order_by(Task.topic_id, Task.rating))]


class TaskIn(BaseModel):
    topic_id: int
    statement_ru: str
    statement_kz: str = ""
    solution_ru: str = ""
    solution_kz: str = ""
    answer: str
    rating: float = 1000


@app.post("/api/tutor/tasks")
def create_task(body: TaskIn, user: User = Depends(tutor_only), db: Session = Depends(get_db)):
    t = Task(**body.model_dump(), source="tutor")
    db.add(t)
    db.commit()
    return task_out(t, True)


@app.post("/api/tutor/tasks/{task_id}/variations")
def variations(task_id: int, n: int = 3, user: User = Depends(tutor_only), db: Session = Depends(get_db)):
    if not llm.enabled():
        raise HTTPException(503, "Не задана переменная окружения ANTHROPIC_API_KEY")
    parent = db.get(Task, task_id)
    try:
        items = llm.generate_variations(parent, n)
    except Exception as e:
        raise HTTPException(502, f"Ошибка LLM: {e}")
    out = []
    for v in items:
        t = Task(topic_id=parent.topic_id, rating=parent.rating, status="pending", source="llm",
                 parent_id=parent.id, **v)
        db.add(t)
        out.append(t)
    db.commit()
    return [task_out(t, True) for t in out]


@app.post("/api/tutor/tasks/{task_id}/approve")
def approve(task_id: int, user: User = Depends(tutor_only), db: Session = Depends(get_db)):
    db.get(Task, task_id).status = "approved"
    db.commit()
    return {"ok": True}


@app.delete("/api/tutor/tasks/{task_id}")
def reject(task_id: int, user: User = Depends(tutor_only), db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if t.status != "pending":
        raise HTTPException(400, "Удалять можно только черновики")
    db.delete(t)
    db.commit()
    return {"ok": True}


# ---------------- Research ----------------
@app.get("/api/research/simulation")
def simulation(students: int = 200, steps: int = 60):
    return sim.run(n_students=min(students, 500), steps=min(steps, 150))


# ---------------- Profile ----------------
LEVELS = [(0, "Новичок", "Бастаушы"), (950, "Ученик", "Үйренуші"), (1100, "Уверенный", "Сенімді"),
          (1250, "Сильный", "Мықты"), (1400, "Олимпиадник", "Олимпиадашы")]


def level_of(rating: float) -> dict:
    cur = [lv for lv in LEVELS if rating >= lv[0]][-1]
    nxt = next((lv for lv in LEVELS if lv[0] > rating), None)
    return {"name_ru": cur[1], "name_kz": cur[2], "from": cur[0],
            "next": nxt[0] if nxt else None, "next_ru": nxt[1] if nxt else None, "next_kz": nxt[2] if nxt else None}


def streak_days(days: set) -> int:
    """Сколько дней подряд (до сегодня или вчера) ученик решал задачи."""
    d = datetime.utcnow().date()
    if d not in days:
        d -= timedelta(days=1)
    n = 0
    while d in days:
        n += 1
        d -= timedelta(days=1)
    return n


@app.get("/api/profile")
def get_profile(user: User = Depends(current_user), db: Session = Depends(get_db)):
    out = {"user": user_out(user)}
    if user.role == "tutor":
        studs = db.scalars(select(User).where(User.tutor_id == user.id)).all()
        ids = [s.id for s in studs]
        out["tutor"] = {
            "students": len(studs),
            "attempts": db.scalar(select(func.count(Attempt.id)).where(Attempt.user_id.in_(ids))) if ids else 0,
            "tasks_total": db.scalar(select(func.count(Task.id)).where(Task.status == "approved")),
            "tasks_llm": db.scalar(select(func.count(Task.id)).where(Task.source == "llm", Task.status == "approved")),
            "pending": db.scalar(select(func.count(Task.id)).where(Task.status == "pending")),
        }
        return out
    skills = skills_of(db, user)
    atts = db.scalars(select(Attempt).where(Attempt.user_id == user.id).order_by(Attempt.id.desc())).all()
    db.commit()
    tried = [s for s in skills.values() if s.attempts > 0]
    avg = sum(s.rating for s in skills.values()) / len(skills)
    days = {a.created_at.date() for a in atts}
    tutor = db.get(User, user.tutor_id) if user.tutor_id else None
    recent = []
    for a in atts[:8]:
        t = db.get(Task, a.task_id)
        recent.append({"topic_id": t.topic_id, "statement_ru": t.statement_ru, "statement_kz": t.statement_kz,
                       "correct": a.correct, "at": a.created_at.isoformat()})
    out["stats"] = {
        "total": len(atts), "correct": sum(a.correct for a in atts),
        "avg_rating": round(avg), "level": level_of(avg),
        "streak": streak_days(days), "active_days": len(days),
        "strongest": max(tried, key=lambda s: s.rating).topic_id if len(tried) > 1 else None,
        "weakest": min(tried, key=lambda s: s.rating).topic_id if len(tried) > 1 else None,
        "topics_started": len(tried), "topics_total": len(skills),
        "tutor": tutor.name if tutor else None,
        "recent": recent,
    }
    return out


class ProfileIn(BaseModel):
    name: str
    grade: int | None = None
    target: str | None = None
    city: str | None = None
    exam_date: str | None = None
    lang: str | None = None
    bio: str | None = None


@app.put("/api/profile")
def update_profile(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not body.name.strip():
        raise HTTPException(400, "Имя не может быть пустым")
    for k, v in body.model_dump().items():
        setattr(user, k, v.strip() if isinstance(v, str) else v)
    user.exam_date = user.exam_date or None
    db.commit()
    return user_out(user)


class PasswordIn(BaseModel):
    old: str
    new: str


@app.post("/api/profile/password")
def change_password(body: PasswordIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if hash_pw(body.old, user.password_hash.split("$")[0]) != user.password_hash:
        raise HTTPException(400, "Неверный текущий пароль")
    if len(body.new) < 6:
        raise HTTPException(400, "Пароль должен быть не короче 6 символов")
    user.password_hash = hash_pw(body.new)
    db.commit()
    return {"ok": True}


class JoinIn(BaseModel):
    invite_code: str


@app.post("/api/profile/join")
def join_tutor(body: JoinIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    tutor = db.scalar(select(User).where(User.invite_code == body.invite_code.strip().upper()))
    if not tutor or user.role != "student":
        raise HTTPException(400, "Неверный код репетитора")
    user.tutor_id = tutor.id
    db.commit()
    return {"tutor": tutor.name}
