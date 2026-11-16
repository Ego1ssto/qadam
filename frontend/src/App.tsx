import { useEffect, useState, type ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

const API = "http://localhost:8000/api";
type Lang = "ru" | "kz";
type Topic = { id: number; name_ru: string; name_kz: string };
type User = { id: number; name: string; email: string; role: string; invite_code?: string; grade?: number | null; target?: string | null; city?: string | null; exam_date?: string | null; lang?: string | null; bio?: string | null };

const T = {
  ru: { title: "Qadam — подготовка к БИЛ/НИШ/РФМШ", login: "Войти", register: "Регистрация", email: "Email", password: "Пароль", name: "Имя",
    student: "Ученик", tutor: "Репетитор", code: "Код репетитора (необязательно)", logout: "Выйти", practice: "Тренировка", progress: "Прогресс",
    answer: "Ваш ответ", check: "Проверить", next: "Следующая задача", correct: "Верно!", wrong: "Неверно", hint: "Подсказка", show: "Показать решение",
    auto: "Авто (слабая тема)", rating: "Рейтинг", chance: "Шанс решить", solved: "решено", students: "Ученики", bank: "Банк задач",
    research: "Исследование", invite: "Код для учеников", variations: "Сгенерировать вариации", approve: "Одобрить", reject: "Удалить",
    pending: "На проверке", noStudents: "Пока нет учеников. Дайте им код приглашения.", attempts: "попыток", solution: "Решение",
    simTitle: "Симуляция: Elo-подбор против случайного", ability: "Истинный уровень ученика", rmse: "Ошибка оценки (RMSE)", adaptive: "Адаптивный", random: "Случайный" },
  kz: { title: "Qadam — БИЛ/НЗМ/РФМШ-ге дайындық", login: "Кіру", register: "Тіркелу", email: "Email", password: "Құпиясөз", name: "Аты",
    student: "Оқушы", tutor: "Репетитор", code: "Репетитор коды (міндетті емес)", logout: "Шығу", practice: "Жаттығу", progress: "Үлгерім",
    answer: "Жауабыңыз", check: "Тексеру", next: "Келесі есеп", correct: "Дұрыс!", wrong: "Қате", hint: "Кеңес", show: "Шешімін көрсету",
    auto: "Авто (әлсіз тақырып)", rating: "Рейтинг", chance: "Шешу ықтималдығы", solved: "шешілді", students: "Оқушылар", bank: "Есептер банкі",
    research: "Зерттеу", invite: "Оқушыларға арналған код", variations: "Нұсқалар жасау", approve: "Мақұлдау", reject: "Жою",
    pending: "Тексеруде", noStudents: "Әзірге оқушы жоқ. Оларға шақыру кодын беріңіз.", attempts: "әрекет", solution: "Шешімі",
    simTitle: "Симуляция: Elo таңдау мен кездейсоқ таңдау", ability: "Оқушының нақты деңгейі", rmse: "Бағалау қатесі (RMSE)", adaptive: "Бейімделгіш", random: "Кездейсоқ" },
};

async function api(path: string, opts: RequestInit = {}) {
  const r = await fetch(API + path, { ...opts, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (localStorage.getItem("token") || ""), ...(opts.headers || {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || "Ошибка");
  return data;
}

function Math({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$)/g);
  return <span>{parts.map((p, i) => p.startsWith("$") ? <span key={i} dangerouslySetInnerHTML={{ __html: katex.renderToString(p.slice(1, -1), { throwOnError: false }) }} /> : p)}</span>;
}

function Chart({ series, height = 180 }: { series: { name: string; color: string; data: number[] }[]; height?: number }) {
  const all = series.flatMap((s) => s.data);
  if (!all.length) return null;
  const min = Math_min(all), max = Math_max(all), n = Math_max(series.map((s) => s.data.length)), W = 600, H = height, pad = 30;
  const x = (i: number) => pad + (i / Math_max([n - 1, 1])) * (W - pad - 8);
  const y = (v: number) => H - pad + 8 - ((v - min) / (max - min || 1)) * (H - pad - 8);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`}>
        <text x={2} y={14} className="ax">{globalThis.Math.round(max)}</text>
        <text x={2} y={H - pad + 8} className="ax">{globalThis.Math.round(min)}</text>
        <line x1={pad} x2={W} y1={H - pad + 8} y2={H - pad + 8} className="axis" />
        {series.map((s) => <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={2.5} points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />)}
      </svg>
      <div className="legend">{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
    </div>
  );
}
const Math_min = (a: number[]) => a.reduce((m, v) => (v < m ? v : m), Infinity);
const Math_max = (a: number[]) => a.reduce((m, v) => (v > m ? v : m), -Infinity);

function level(r: number) { return r < 950 ? "low" : r < 1150 ? "mid" : "high"; }

export default function App() {
  const [lang, setLang] = useState<Lang>((localStorage.getItem("lang") as Lang) || "ru");
  const [user, setUser] = useState<User | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const t = T[lang];
  useEffect(() => { localStorage.setItem("lang", lang); }, [lang]);
  useEffect(() => {
    api("/topics").then(setTopics);
    if (localStorage.getItem("token")) api("/me").then(setUser).catch(() => localStorage.removeItem("token"));
  }, []);
  const tn = (id: number) => { const x = topics.find((z) => z.id === id); return x ? (lang === "kz" ? x.name_kz : x.name_ru) : ""; };
  const ctx = { t, lang, topics, tn };
  return (
    <div className="app">
      <header>
        <b className="logo">Qadam<span>.</span></b>
        <div className="hright">
          <div className="seg">{(["ru", "kz"] as Lang[]).map((l) => <button key={l} className={l === lang ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
          {user && <><span className="muted">{user.name}</span><button className="ghost" onClick={() => { localStorage.removeItem("token"); setUser(null); }}>{t.logout}</button></>}
        </div>
      </header>
      <main>
        {!user ? <Auth t={t} onAuth={setUser} /> : user.role === "tutor" ? <Tutor user={user} onUser={setUser} {...ctx} /> : <Student user={user} onUser={setUser} {...ctx} />}
      </main>
    </div>
  );
}

type Ctx = { t: typeof T.ru; lang: Lang; topics: Topic[]; tn: (id: number) => string };

function Auth({ t, onAuth }: { t: typeof T.ru; onAuth: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ email: "student@demo.kz", password: "demo123", name: "", role: "student", invite_code: "" });
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    try { const r = await api("/auth/" + mode, { method: "POST", body: JSON.stringify(f) }); localStorage.setItem("token", r.token); onAuth(r.user); }
    catch (e: any) { setErr(e.message); }
  };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="auth card">
      <h1>{t.title}</h1>
      <div className="seg wide">
        <button className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>{t.login}</button>
        <button className={mode === "register" ? "on" : ""} onClick={() => setMode("register")}>{t.register}</button>
      </div>
      <form onSubmit={submit}>
        {mode === "register" && <input placeholder={t.name} value={f.name} onChange={set("name")} required />}
        <input placeholder={t.email} value={f.email} onChange={set("email")} required />
        <input placeholder={t.password} type="password" value={f.password} onChange={set("password")} required />
        {mode === "register" && <>
          <div className="seg wide">{["student", "tutor"].map((r) => <button type="button" key={r} className={f.role === r ? "on" : ""} onClick={() => setF({ ...f, role: r })}>{r === "student" ? t.student : t.tutor}</button>)}</div>
          {f.role === "student" && <input placeholder={t.code} value={f.invite_code} onChange={set("invite_code")} />}
        </>}
        {err && <p className="err">{err}</p>}
        <button className="primary">{mode === "login" ? t.login : t.register}</button>
      </form>
      <p className="muted small">Демо: student@demo.kz / tutor@demo.kz, пароль demo123</p>
    </div>
  );
}

function Tabs({ tabs, children }: { tabs: string[]; children: (i: number) => ReactNode }) {
  const [i, setI] = useState(0);
  return <><nav className="tabs">{tabs.map((x, k) => <button key={k} className={k === i ? "on" : ""} onClick={() => setI(k)}>{x}</button>)}</nav>{children(i)}</>;
}

function Student({ user, onUser, ...ctx }: Ctx & { user: User; onUser: (u: User) => void }) {
  return <Tabs tabs={[ctx.t.practice, ctx.t.progress, P[ctx.lang].profile]}>{(i) => i === 0 ? <Practice {...ctx} /> : i === 1 ? <Progress {...ctx} /> : <Profile user={user} onUser={onUser} {...ctx} />}</Tabs>;
}

const PR = {
  ru: { topic: "Тема", difficulty: "Сложность", session: "Эта сессия", inRow: "Подряд верно", topicRating: "Рейтинг по теме", allTopics: "Все темы",
    pickHint: "Нажмите на тему, чтобы тренировать только её", attempts: "попыток", tipTitle: "Как это работает",
    tip: "Задачи подбираются так, чтобы вы решали их примерно в 70% случаев: не слишком легко и не слишком трудно. Верный ответ повышает рейтинг, ошибка снижает. Ответ с подсказкой засчитывается частично.",
    weakest: "Слабее всего", notStarted: "не начата" },
  kz: { topic: "Тақырып", difficulty: "Күрделілік", session: "Осы сессия", inRow: "Қатарынан дұрыс", topicRating: "Тақырып рейтингі", allTopics: "Барлық тақырыптар",
    pickHint: "Тек соны жаттықтыру үшін тақырыпты басыңыз", attempts: "әрекет", tipTitle: "Бұл қалай жұмыс істейді",
    tip: "Есептер шамамен 70% жағдайда шеше алатындай етіп таңдалады: тым оңай да, тым қиын да емес. Дұрыс жауап рейтингті көтереді, қате төмендетеді. Кеңеспен берілген жауап ішінара есептеледі.",
    weakest: "Ең әлсізі", notStarted: "басталмаған" },
};

function Practice({ t, lang, topics, tn }: Ctx) {
  const pr = PR[lang];
  const [topic, setTopic] = useState<number | "">("");
  const [task, setTask] = useState<any>(null);
  const [ans, setAns] = useState("");
  const [res, setRes] = useState<any>(null);
  const [hint, setHint] = useState("");
  const [usedHint, setUsedHint] = useState(false);
  const [sol, setSol] = useState<any>(null);
  const [skills, setSkills] = useState<any[]>([]);
  const [sess, setSess] = useState({ ok: 0, total: 0, row: 0 });
  const loadSkills = () => api("/student/progress").then((p) => setSkills(p.skills));
  const load = async () => {
    setRes(null); setAns(""); setHint(""); setUsedHint(false); setSol(null);
    setTask(await api("/student/next" + (topic ? "?topic_id=" + topic : "")));
  };
  useEffect(() => { load(); }, [topic]);
  useEffect(() => { loadSkills(); }, []);
  const check = async () => {
    const r = await api("/student/answer", { method: "POST", body: JSON.stringify({ task_id: task.id, answer: ans, used_hint: usedHint }) });
    setRes(r); if (r.correct) setSol(r);
    setSess((s) => ({ ok: s.ok + (r.correct ? 1 : 0), total: s.total + 1, row: r.correct ? s.row + 1 : 0 }));
    loadSkills();
  };
  const askHint = async () => {
    setHint("…"); setUsedHint(true);
    try { setHint((await api("/student/hint", { method: "POST", body: JSON.stringify({ task_id: task.id, answer: ans, lang }) })).hint); }
    catch (e: any) { setHint(e.message); }
  };
  if (!task) return null;
  const cur = skills.find((s) => s.topic_id === task.topic_id);
  const started = skills.filter((s) => s.attempts > 0);
  const weakest = started.length > 1 ? started.reduce((a, b) => (a.rating < b.rating ? a : b)) : null;
  const pct = (r: number) => globalThis.Math.min(100, globalThis.Math.max(5, (r - 700) / 8));
  return (<>
    <div className="grid2">
      <aside className="card">
        <label className="muted small">{pr.topic}</label>
        <select value={topic} onChange={(e) => setTopic(e.target.value ? +e.target.value : "")}>
          <option value="">{t.auto}</option>
          {topics.map((x) => <option key={x.id} value={x.id}>{lang === "kz" ? x.name_kz : x.name_ru}</option>)}
        </select>
        <div className="stat"><span>{t.chance}</span><b>{globalThis.Math.round(task.p_solve * 100)}%</b></div>
        <div className="stat"><span>{pr.difficulty}</span><b>{task.rating}</b></div>
        {cur && <div className="stat col"><div className="srow"><span>{pr.topicRating}</span><b>{cur.rating}</b></div>
          <div className="track"><div className={"fill " + level(cur.rating)} style={{ width: `${pct(cur.rating)}%` }} /></div></div>}
        <div className="stat"><span>{pr.session}</span><b>{sess.ok}/{sess.total}</b></div>
        <div className="stat"><span>{pr.inRow}</span><b>{sess.row >= 3 ? "🔥 " : ""}{sess.row}</b></div>
        {weakest && <div className="stat col"><span className="muted small">{pr.weakest}</span>
          <button className="linkbtn" onClick={() => setTopic(weakest.topic_id)}>{tn(weakest.topic_id)} · {weakest.rating} →</button></div>}
      </aside>
      <section className="card task">
        <span className="pill">{tn(task.topic_id)}</span>
        <p className="statement"><Math text={lang === "kz" ? task.statement_kz : task.statement_ru} /></p>
        <div className="row">
          <input value={ans} onChange={(e) => setAns(e.target.value)} placeholder={t.answer} disabled={res?.correct}
            onKeyDown={(e) => e.key === "Enter" && ans && !res?.correct && check()} />
          {!res?.correct ? <button className="primary" disabled={!ans} onClick={check}>{t.check}</button>
            : <button className="primary" onClick={load}>{t.next} →</button>}
        </div>
        {res && <div className={"result " + (res.correct ? "ok" : "bad")}>
          {res.correct ? t.correct : t.wrong} · {t.rating}: {res.rating_before} → <b>{res.rating}</b>
        </div>}
        {res && !res.correct && <div className="row">
          <button onClick={askHint}>💡 {t.hint}</button>
          <button className="ghost" onClick={async () => setSol(await api("/student/reveal/" + task.id, { method: "POST" }))}>{t.show}</button>
          <button className="ghost" onClick={load}>{t.next}</button>
        </div>}
        {hint && <div className="hint"><Math text={hint} /></div>}
        {sol && <div className="solution"><b>{t.solution}:</b> <Math text={lang === "kz" ? sol.solution_kz : sol.solution_ru} /> <b>= {sol.answer}</b></div>}
      </section>
    </div>

    <div className="card">
      <div className="secthead"><h3>{pr.allTopics}</h3><span className="muted small">{pr.pickHint}</span></div>
      <div className="topicgrid">
        <button className={"tile auto" + (topic === "" ? " on" : "")} onClick={() => setTopic("")}>
          <b>✨ {t.auto}</b>
        </button>
        {skills.map((s) => (
          <button key={s.topic_id} className={"tile" + (topic === s.topic_id ? " on" : "")} onClick={() => setTopic(s.topic_id)}>
            <span className="tname">{tn(s.topic_id)}</span>
            <div className="track"><div className={"fill " + (s.attempts ? level(s.rating) : "none")} style={{ width: `${s.attempts ? pct(s.rating) : 0}%` }} /></div>
            <span className="tmeta2"><b>{s.rating}</b><small className="muted">{s.attempts ? `${s.attempts} ${pr.attempts}` : pr.notStarted}</small></span>
          </button>))}
      </div>
    </div>

    <div className="card tipcard"><b>💡 {pr.tipTitle}</b><p className="muted small">{pr.tip}</p></div>
  </>);
}

function SkillBars({ skills, tn, t }: { skills: any[]; tn: (id: number) => string; t: typeof T.ru }) {
  return <div className="bars">{skills.map((s) => (
    <div key={s.topic_id} className="bar">
      <span>{tn(s.topic_id)}</span>
      <div className="track"><div className={"fill " + level(s.rating)} style={{ width: `${globalThis.Math.min(100, globalThis.Math.max(5, (s.rating - 700) / 8))}%` }} /></div>
      <b>{s.rating}</b><small className="muted">{s.attempts} {t.attempts}</small>
    </div>))}</div>;
}

function ProgressView({ p, t, tn }: { p: any; t: typeof T.ru; tn: (id: number) => string }) {
  return <>
    <div className="kpis">
      <div className="card kpi"><small>{t.solved}</small><b>{p.correct} / {p.total}</b></div>
      <div className="card kpi"><small>%</small><b>{p.total ? globalThis.Math.round((p.correct / p.total) * 100) : 0}%</b></div>
    </div>
    <div className="card"><SkillBars skills={p.skills} tn={tn} t={t} /></div>
    {p.history.length > 1 && <div className="card"><h3>{t.rating}</h3><Chart series={[{ name: t.rating, color: "var(--accent)", data: p.history.map((h: any) => h.rating) }]} /></div>}
  </>;
}

function Progress({ t, tn }: Ctx) {
  const [p, setP] = useState<any>(null);
  useEffect(() => { api("/student/progress").then(setP); }, []);
  return p ? <ProgressView p={p} t={t} tn={tn} /> : null;
}

function Tutor({ user, onUser, ...ctx }: Ctx & { user: User; onUser: (u: User) => void }) {
  return <Tabs tabs={[ctx.t.students, ctx.t.bank, ctx.t.research, P[ctx.lang].profile]}>
    {(i) => i === 0 ? <Students user={user} {...ctx} /> : i === 1 ? <Bank {...ctx} /> : i === 2 ? <Research {...ctx} /> : <Profile user={user} onUser={onUser} {...ctx} />}
  </Tabs>;
}

function Students({ user, t, tn }: Ctx & { user: User }) {
  const [list, setList] = useState<any[]>([]);
  const [sel, setSel] = useState(0);
  useEffect(() => { api("/tutor/students").then(setList); }, []);
  return <>
    <div className="card invite">{t.invite}: <b>{user.invite_code}</b></div>
    {!list.length ? <p className="muted">{t.noStudents}</p> : <>
      <nav className="tabs sub">{list.map((s, i) => <button key={i} className={i === sel ? "on" : ""} onClick={() => setSel(i)}>{s.user.name}</button>)}</nav>
      <ProgressView p={list[sel]} t={t} tn={tn} />
    </>}
  </>;
}

function Bank({ t, lang, topics, tn }: Ctx) {
  const [topic, setTopic] = useState(topics[0]?.id || 1);
  const [tasks, setTasks] = useState<any[]>([]);
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState("");
  const load = () => api("/tutor/tasks?topic_id=" + topic).then(setTasks);
  useEffect(() => { load(); }, [topic]);
  const gen = async (id: number) => {
    setBusy(id); setErr("");
    try { await api(`/tutor/tasks/${id}/variations?n=3`, { method: "POST" }); await load(); } catch (e: any) { setErr(e.message); }
    setBusy(0);
  };
  const act = async (id: number, approve: boolean) => {
    await api(`/tutor/tasks/${id}` + (approve ? "/approve" : ""), { method: approve ? "POST" : "DELETE" }); load();
  };
  return <>
    <select value={topic} onChange={(e) => setTopic(+e.target.value)}>{topics.map((x) => <option key={x.id} value={x.id}>{tn(x.id)}</option>)}</select>
    {err && <p className="err">{err}</p>}
    <div className="tasklist">{tasks.map((x) => (
      <div key={x.id} className={"card trow " + x.status}>
        <div className="tmeta"><span className="pill">{x.rating}</span>{x.status === "pending" && <span className="pill warn">{t.pending} · LLM</span>}{x.source === "llm" && x.status === "approved" && <span className="pill">LLM</span>}</div>
        <p><Math text={lang === "kz" ? x.statement_kz : x.statement_ru} /></p>
        <p className="muted small"><Math text={lang === "kz" ? x.solution_kz : x.solution_ru} /> → <b>{x.answer}</b></p>
        <div className="row">
          {x.status === "approved" ? <button disabled={!!busy} onClick={() => gen(x.id)}>{busy === x.id ? "…" : "✨ " + t.variations}</button>
            : <><button className="primary" onClick={() => act(x.id, true)}>{t.approve}</button><button className="ghost" onClick={() => act(x.id, false)}>{t.reject}</button></>}
        </div>
      </div>))}</div>
  </>;
}

function Research({ t }: Ctx) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api("/research/simulation?students=200&steps=60").then(setD); }, []);
  if (!d) return <p className="muted">…</p>;
  return <>
    <h2>{t.simTitle}</h2>
    <p className="muted small">200 виртуальных учеников × 60 задач. Навык растёт, когда задача в зоне ближайшего развития (шанс решить 50–85%).</p>
    <div className="kpis">
      <div className="card kpi"><small>Прирост уровня · {t.adaptive}</small><b>+{d.summary.final_ability_gain_adaptive}</b></div>
      <div className="card kpi"><small>Прирост уровня · {t.random}</small><b>+{d.summary.final_ability_gain_random}</b></div>
    </div>
    <div className="card"><h3>{t.ability}</h3><Chart series={[{ name: t.adaptive, color: "var(--accent)", data: d.adaptive.ability }, { name: t.random, color: "var(--gray)", data: d.random.ability }]} /></div>
    <div className="card"><h3>{t.rmse}</h3><Chart series={[{ name: t.adaptive, color: "var(--accent)", data: d.adaptive.rmse }, { name: t.random, color: "var(--gray)", data: d.random.rmse }]} /></div>
  </>;
}

// ---------------- Профиль ----------------
const P = {
  ru: { profile: "Профиль", name: "Имя", edit: "Редактировать", save: "Сохранить", cancel: "Отмена", grade: "Класс", target: "Цель", city: "Город",
    exam: "Дата экзамена", bio: "О себе", daysLeft: "дней до экзамена", examPassed: "Экзамен прошёл", noExam: "Укажите дату экзамена",
    level: "Уровень", toNext: "до уровня", streak: "Дней подряд", active: "Активных дней", accuracy: "Точность", solved: "Решено",
    strongest: "Сильная тема", weakest: "Над чем работать", topics: "Тем начато", recent: "Последние задачи", noRecent: "Пока нет решённых задач",
    tutorLabel: "Репетитор", noTutor: "Нет репетитора", join: "Присоединиться", codePh: "Код репетитора", security: "Безопасность",
    oldPw: "Текущий пароль", newPw: "Новый пароль", changePw: "Сменить пароль", saved: "Сохранено", pwChanged: "Пароль изменён",
    students: "Учеников", attempts: "Попыток учеников", bank: "Задач в банке", llm: "Из них от LLM", pending: "Ждут проверки", invite: "Код приглашения", gradeN: "класс" },
  kz: { profile: "Профиль", name: "Аты", edit: "Өңдеу", save: "Сақтау", cancel: "Болдырмау", grade: "Сынып", target: "Мақсат", city: "Қала",
    exam: "Емтихан күні", bio: "Өзім туралы", daysLeft: "күн емтиханға дейін", examPassed: "Емтихан өтті", noExam: "Емтихан күнін көрсетіңіз",
    level: "Деңгей", toNext: "деңгейіне дейін", streak: "Қатарынан күн", active: "Белсенді күн", accuracy: "Дәлдік", solved: "Шешілді",
    strongest: "Күшті тақырып", weakest: "Жұмыс істеу керек", topics: "Басталған тақырып", recent: "Соңғы есептер", noRecent: "Әзірге шешілген есеп жоқ",
    tutorLabel: "Репетитор", noTutor: "Репетитор жоқ", join: "Қосылу", codePh: "Репетитор коды", security: "Қауіпсіздік",
    oldPw: "Ағымдағы құпиясөз", newPw: "Жаңа құпиясөз", changePw: "Құпиясөзді өзгерту", saved: "Сақталды", pwChanged: "Құпиясөз өзгертілді",
    students: "Оқушылар", attempts: "Оқушы әрекеттері", bank: "Банктегі есептер", llm: "Оның ішінде LLM", pending: "Тексеруді күтуде", invite: "Шақыру коды", gradeN: "сынып" },
};

function initials(name: string) { return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(); }

function Profile({ onUser, lang, tn }: Ctx & { user: User; onUser: (u: User) => void }) {
  const p = P[lang];
  const [data, setData] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<any>({});
  const [msg, setMsg] = useState("");
  const [pw, setPw] = useState({ old: "", new: "" });
  const [pwMsg, setPwMsg] = useState("");
  const [code, setCode] = useState("");
  const load = () => api("/profile").then((d) => { setData(d); setF({ ...d.user, grade: d.user.grade ?? "", exam_date: d.user.exam_date ?? "" }); });
  useEffect(() => { load(); }, []);
  if (!data) return null;
  const u = data.user, s = data.stats, tu = data.tutor;
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setMsg("");
    try {
      const r = await api("/profile", { method: "PUT", body: JSON.stringify({ ...f, grade: f.grade ? +f.grade : null, exam_date: f.exam_date || null }) });
      onUser(r); setEditing(false); setMsg(p.saved); load();
    } catch (e: any) { setMsg(e.message); }
  };
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault(); setPwMsg("");
    try { await api("/profile/password", { method: "POST", body: JSON.stringify(pw) }); setPw({ old: "", new: "" }); setPwMsg(p.pwChanged); }
    catch (e: any) { setPwMsg(e.message); }
  };
  const join = async () => {
    try { await api("/profile/join", { method: "POST", body: JSON.stringify({ invite_code: code }) }); setCode(""); load(); }
    catch (e: any) { setMsg(e.message); }
  };
  const days = u.exam_date ? globalThis.Math.ceil((new Date(u.exam_date).getTime() - Date.now()) / 86400000) : null;
  const lvl = s?.level;
  const lvlPct = lvl && lvl.next ? globalThis.Math.min(100, ((s.avg_rating - lvl.from) / (lvl.next - lvl.from)) * 100) : 100;

  return <div className="profile">
    <div className="card phead">
      <div className="avatar">{initials(u.name)}</div>
      <div className="pinfo">
        <h2>{u.name}</h2>
        <p className="muted small">{u.email}</p>
        <div className="chips">
          {u.role === "student" && u.grade && <span className="pill">{u.grade} {p.gradeN}</span>}
          {u.target && <span className="pill">🎯 {u.target}</span>}
          {u.city && <span className="pill">📍 {u.city}</span>}
          {u.role === "student" && <span className="pill">{s?.tutor ? `${p.tutorLabel}: ${s.tutor}` : p.noTutor}</span>}
        </div>
        {u.bio && <p className="bio">{u.bio}</p>}
      </div>
      {u.role === "student" && <div className="exam">
        {days === null ? <span className="muted small">{p.noExam}</span>
          : days >= 0 ? <><b>{days}</b><small>{p.daysLeft}</small></> : <small>{p.examPassed}</small>}
      </div>}
      {!editing && <button className="ghost editbtn" onClick={() => setEditing(true)}>{p.edit}</button>}
    </div>

    {msg && <p className={msg === p.saved ? "okmsg" : "err"}>{msg}</p>}

    {editing && <div className="card form2">
      <label>{p.name}<input value={f.name} onChange={set("name")} /></label>
      <label>{p.city}<input value={f.city || ""} onChange={set("city")} /></label>
      {u.role === "student" && <>
        <label>{p.grade}<select value={f.grade} onChange={set("grade")}><option value="">—</option>{[4, 5, 6, 7, 8, 9, 10, 11].map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
        <label>{p.target}<select value={f.target || ""} onChange={set("target")}><option value="">—</option>{["БИЛ", "НИШ", "РФМШ", "Олимпиада"].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>{p.exam}<input type="date" value={f.exam_date} onChange={set("exam_date")} /></label>
      </>}
      <label className="full">{p.bio}<textarea rows={3} value={f.bio || ""} onChange={set("bio")} /></label>
      <div className="row full"><button className="primary" onClick={save}>{p.save}</button><button className="ghost" onClick={() => { setEditing(false); load(); }}>{p.cancel}</button></div>
    </div>}

    {s && <>
      <div className="card">
        <div className="lvlrow"><span className="muted small">{p.level}</span><b>{lang === "kz" ? lvl.name_kz : lvl.name_ru}</b><span className="muted small">· {s.avg_rating}</span></div>
        <div className="track big"><div className="fill high" style={{ width: `${globalThis.Math.max(4, lvlPct)}%` }} /></div>
        {lvl.next && <p className="muted small">{lvl.next - s.avg_rating} {lang === "kz" ? `ұпай «${lvl.next_kz}» ${p.toNext}` : `очков ${p.toNext} «${lvl.next_ru}»`}</p>}
      </div>
      <div className="kpis">
        <div className="card kpi"><small>{p.solved}</small><b>{s.correct}/{s.total}</b></div>
        <div className="card kpi"><small>{p.accuracy}</small><b>{s.total ? globalThis.Math.round((s.correct / s.total) * 100) : 0}%</b></div>
        <div className="card kpi"><small>🔥 {p.streak}</small><b>{s.streak}</b></div>
        <div className="card kpi"><small>{p.topics}</small><b>{s.topics_started}/{s.topics_total}</b></div>
      </div>
      <div className="kpis">
        <div className="card kpi"><small>💪 {p.strongest}</small><b className="mid">{s.strongest ? tn(s.strongest) : "—"}</b></div>
        <div className="card kpi"><small>📌 {p.weakest}</small><b className="mid">{s.weakest ? tn(s.weakest) : "—"}</b></div>
      </div>
      <div className="card">
        <h3>{p.recent}</h3>
        {!s.recent.length ? <p className="muted small">{p.noRecent}</p> : <ul className="recent">{s.recent.map((r: any, i: number) => (
          <li key={i}><span className={r.correct ? "dot ok" : "dot bad"} /><span className="pill">{tn(r.topic_id)}</span>
            <span className="rtext"><Math text={lang === "kz" ? r.statement_kz : r.statement_ru} /></span>
            <small className="muted">{new Date(r.at + "Z").toLocaleDateString()}</small></li>))}</ul>}
      </div>
      {!s.tutor && <div className="card row"><input placeholder={p.codePh} value={code} onChange={(e) => setCode(e.target.value)} /><button onClick={join} disabled={!code}>{p.join}</button></div>}
    </>}

    {tu && <>
      <div className="card invite">{p.invite}: <b>{u.invite_code}</b></div>
      <div className="kpis">
        <div className="card kpi"><small>{p.students}</small><b>{tu.students}</b></div>
        <div className="card kpi"><small>{p.attempts}</small><b>{tu.attempts}</b></div>
        <div className="card kpi"><small>{p.bank}</small><b>{tu.tasks_total}</b></div>
        <div className="card kpi"><small>{p.llm}</small><b>{tu.tasks_llm}</b></div>
        <div className="card kpi"><small>{p.pending}</small><b>{tu.pending}</b></div>
      </div>
    </>}

    <form className="card form2" onSubmit={changePw}>
      <h3 className="full">{p.security}</h3>
      <label>{p.oldPw}<input type="password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} required /></label>
      <label>{p.newPw}<input type="password" value={pw.new} onChange={(e) => setPw({ ...pw, new: e.target.value })} required minLength={6} /></label>
      <div className="row full"><button>{p.changePw}</button>{pwMsg && <span className={pwMsg === p.pwChanged ? "okmsg" : "err"}>{pwMsg}</span>}</div>
    </form>
  </div>;
}
