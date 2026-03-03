import { useState, useRef, useEffect, useCallback } from "react";

// ─── Supabase ─────────────────────────────────────────────────
const SUPABASE_URL = "https://ljietkmazboxkltrzsje.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqaWV0a21hemJveGtsdHJ6c2plIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxODY2MjYsImV4cCI6MjA4Nzc2MjYyNn0.SnaafUqJo6G5jQHchZ-06l92_edyRQxz-gQL2kJ81kk";

async function sb(path, options = {}) {
  const { prefer, headers: extraHeaders, ...rest } = options;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": prefer || "return=representation",
      ...extraHeaders,
    },
    ...rest,
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const api = {
  getAccount:        (name) => sb(`accounts?name=eq.${encodeURIComponent(name)}&select=*`),
  createAccount:     (d)    => sb("accounts", { method: "POST", body: JSON.stringify(d) }),
  updateAccount:     (id,d) => sb(`accounts?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d), prefer: "return=minimal" }),
  getTournament:     (id)   => sb(`tournaments?id=eq.${encodeURIComponent(id)}&select=*`),
  createTournament:  (d)    => sb("tournaments", { method: "POST", body: JSON.stringify(d) }),
  getParticipants:   (tid)  => sb(`participants?tournament_id=eq.${encodeURIComponent(tid)}&select=*,account:accounts(*)`),
  addParticipant:    (d)    => sb("participants", { method: "POST", body: JSON.stringify(d) }),
  updateParticipant: (id,d) => sb(`participants?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d), prefer: "return=minimal" }),
  getMatches:        (tid)  => sb(`matches?tournament_id=eq.${encodeURIComponent(tid)}&select=*&order=played_at.desc`),
  createMatch:       (d)    => sb("matches", { method: "POST", body: JSON.stringify(d) }),
  getPending:        (tid)  => sb(`matches?tournament_id=eq.${encodeURIComponent(tid)}&result=is.null&select=*`),
  updateMatch:       (id,d) => sb(`matches?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d), prefer: "return=minimal" }),
  endTournament:     (id)   => sb(`tournaments?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ ended_at: new Date().toISOString() }), prefer: "return=minimal" }),
};

// ─── Constants ───────────────────────────────────────────────
const INITIAL_RATING = 1500;
const K = 32;
const TIMER_SEC = 25 * 60; // 25分カウントダウン

// ─── Elo ─────────────────────────────────────────────────────
const expected = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));
function calcNewRatings(ra, rb, scoreA) {
  const ea = expected(ra, rb);
  return [
    Math.round(ra + K * (scoreA - ea)),
    Math.round(rb + K * ((1 - scoreA) - (1 - ea))),
  ];
}
function pairKey(a, b) { return [a, b].sort().join("-"); }
function genTournamentId() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

// ─── Tier ────────────────────────────────────────────────────
function getTier(r) {
  if (r >= 1800) return { label: "MASTER",   color: "#d97706", bg: "#fef3c7", border: "#fde68a" };
  if (r >= 1650) return { label: "DIAMOND",  color: "#7c3aed", bg: "#ede9fe", border: "#c4b5fd" };
  if (r >= 1575) return { label: "PLATINUM", color: "#059669", bg: "#d1fae5", border: "#6ee7b7" };
  if (r >= 1525) return { label: "GOLD",     color: "#b45309", bg: "#fef9c3", border: "#fde047" };
  if (r >= 1475) return { label: "SILVER",   color: "#475569", bg: "#f1f5f9", border: "#cbd5e1" };
  return                { label: "BRONZE",   color: "#92400e", bg: "#fef3c7", border: "#d97706" };
}

// ─── Design ──────────────────────────────────────────────────
const C = {
  bg: "#0a0c14",
  card: "#12151f",
  border: "#1e2235",
  border2: "#2e2040",
  accent: "#ff4422",
  accent2: "#cc2200",
  green: "#00d4aa",
  red: "#ff3355",
  orange: "#ff8c00",
  text: "#ffffff",      // 純白に
  sub: "#c8d4f0",       // 明るいグレーブルー
  muted: "#7a8aaa",     // 少し明るく
  dim: "#161a28",
};

const S = {
  card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 8, boxShadow: "0 1px 4px #0000000a" },
  input: { background: "#220c0c", border: `1.5px solid ${C.border2}`, borderRadius: 8, color: C.text, padding: "10px 13px", fontSize: 14, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
  select: { background: "#220c0c", border: `1.5px solid ${C.border2}`, borderRadius: 8, color: C.text, padding: "10px 13px", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
  label: { fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: 0.8, marginBottom: 5, display: "block" },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 },
  body: { padding: "16px", maxWidth: 800, margin: "0 auto" },
};

function btn(variant = "primary", sm = false) {
  const base = { border: "none", borderRadius: 8, padding: sm ? "6px 12px" : "10px 18px", cursor: "pointer", fontSize: sm ? 12 : 13, fontFamily: "inherit", fontWeight: 700, letterSpacing: 0.3, flexShrink: 0, transition: "opacity 0.12s" };
  const variants = {
    primary: { background: C.accent,  color: "#fff" },
    indigo:  { background: C.accent2, color: "#fff" },
    green:   { background: C.green,   color: "#fff" },
    orange:  { background: C.orange,  color: "#fff" },
    red:     { background: "#0e1020", color: C.red,  border: "1.5px solid #f8717144" },
    ghost:   { background: "#2d0a0a",  color: C.sub,  border: `1px solid ${C.border}` },
  };
  return { ...base, ...variants[variant] };
}

// ─── UI Components ────────────────────────────────────────────
function Tier({ rating }) {
  const t = getTier(rating);
  return <span style={{ fontSize: 10, fontWeight: 800, color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 4, padding: "2px 7px" }}>{t.label}</span>;
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: toast.type === "error" ? "#0e1020" : "#0a2a1a", color: toast.type === "error" ? "#dc2626" : "#16a34a", border: `1px solid ${toast.type === "error" ? "#f87171" : "#34d399"}`, borderRadius: 10, padding: "10px 24px", fontSize: 13, zIndex: 9999, boxShadow: "0 8px 24px #0000001a", maxWidth: 380, textAlign: "center", pointerEvents: "none", fontWeight: 600 }}>
      {toast.type === "error" ? "⚠️ " : "✅ "}{toast.msg}
    </div>
  );
}

function Spinner() {
  return <div style={{ display: "inline-block", width: 16, height: 16, border: "2.5px solid #1e2235", borderTopColor: C.accent, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />;
}

function ConfirmDialog({ dialog, onConfirm, onCancel }) {
  if (!dialog) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0006", zIndex: 8000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#12151f", borderRadius: 16, padding: "28px 24px", maxWidth: 360, width: "100%", boxShadow: "0 20px 60px #0003" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>結果の確認</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 18, lineHeight: 1.5 }}>{dialog.message}</div>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, fontWeight: 600 }}>レート変動プレビュー</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[[dialog.p1name, dialog.r1after, dialog.diff1], [dialog.p2name, dialog.r2after, dialog.diff2]].map(([name, after, diff], i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", background: "#0a0c14", borderRadius: 8, padding: "10px 6px", border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, color: C.sub, marginBottom: 4, fontWeight: 600 }}>{name}</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{after}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: diff >= 0 ? C.green : C.red }}>{diff >= 0 ? "+" : ""}{diff}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ ...btn("ghost"), flex: 1 }}>キャンセル</button>
          <button onClick={onConfirm} style={{ ...btn("green"), flex: 1 }}>登録する ✓</button>
        </div>
      </div>
    </div>
  );
}

function MatchTimer({ matchId, timerStartedAt, onStart, canControl }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!timerStartedAt) {
    // 未スタート状態
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 3, color: C.muted, fontVariantNumeric: "tabular-nums" }}>25:00</div>
        {canControl ? (
          <button onClick={() => onStart(matchId)} style={{ ...btn("green"), padding: "8px 28px", fontSize: 14, letterSpacing: 1 }}>
            ▶ タイマースタート
          </button>
        ) : (
          <div style={{ fontSize: 12, color: C.muted }}>対戦者がスタートを待っています</div>
        )}
      </div>
    );
  }

  const elapsed = Math.floor((now - new Date(timerStartedAt).getTime()) / 1000);
  const remaining = Math.max(0, TIMER_SEC - elapsed);
  const m = Math.floor(remaining / 60);
  const s = String(remaining % 60).padStart(2, "0");
  const over = remaining === 0;
  const warn = remaining <= TIMER_SEC * 0.2; // 残り20%（5分）で警告
  const color = over ? C.red : warn ? C.orange : C.green;
  const bgColor = over ? "#0d0026" : warn ? "#1a1200" : "#001a2a";
  const borderColor = over ? C.red : warn ? C.orange : C.green;

  return (
    <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 3, color, background: bgColor, border: `2px solid ${borderColor}`, borderRadius: 10, padding: "8px 22px", display: "inline-block", fontVariantNumeric: "tabular-nums", minWidth: 110, textAlign: "center" }}>
      {m}:{s}
      {over && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, marginTop: 2 }}>TIME OVER</div>}
    </div>
  );
}

// ─── Rating Animation ────────────────────────────────────────
function RatingAnimation({ data, onClose }) {
  const [phase, setPhase] = useState("enter"); // enter → counting → done
  const [displayed1, setDisplayed1] = useState(data.r1before);
  const [displayed2, setDisplayed2] = useState(data.r2before);

  useEffect(() => {
    // フェーズ1: 少し待ってからカウント開始
    const t1 = setTimeout(() => setPhase("counting"), 400);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (phase !== "counting") return;
    const duration = 1200;
    const steps = 30;
    const interval = duration / steps;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const progress = step / steps;
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplayed1(Math.round(data.r1before + (data.r1after - data.r1before) * ease));
      setDisplayed2(Math.round(data.r2before + (data.r2after - data.r2before) * ease));
      if (step >= steps) {
        clearInterval(id);
        setPhase("done");
      }
    }, interval);
    return () => clearInterval(id);
  }, [phase]);

  const isWin1 = data.diff1 > 0, isWin2 = data.diff2 > 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={phase === "done" ? onClose : undefined}>
      <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
        {/* 結果ラベル */}
        <div style={{ fontSize: 13, fontWeight: 800, color: C.muted, letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" }}>Result</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 28, letterSpacing: 1 }}>{data.label}</div>

        {/* 2人のレート表示 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          {[
            { name: data.p1name, before: data.r1before, after: data.r1after, diff: data.diff1, displayed: displayed1 },
            { name: data.p2name, before: data.r2before, after: data.r2after, diff: data.diff2, displayed: displayed2 },
          ].map((p, i) => {
            const win = p.diff > 0;
            const glow = win ? `0 0 24px ${C.accent}88` : "none";
            return (
              <div key={i} style={{ flex: 1, background: "#12151f", border: `2px solid ${win ? C.accent : C.border2}`, borderRadius: 14, padding: "20px 12px", boxShadow: glow, transition: "box-shadow 0.3s" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 12 }}>{p.name}</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: win ? C.accent : C.muted, letterSpacing: 1, fontVariantNumeric: "tabular-nums", transition: "color 0.3s", lineHeight: 1 }}>
                  {p.displayed}
                </div>
                <div style={{ fontSize: 11, color: C.muted, margin: "6px 0 10px" }}>{p.before} → {p.after}</div>
                <div style={{
                  fontSize: 18, fontWeight: 900,
                  color: win ? C.accent : p.diff < 0 ? C.red : C.muted,
                  opacity: phase === "done" ? 1 : 0,
                  transform: phase === "done" ? "translateY(0)" : "translateY(8px)",
                  transition: "all 0.4s ease",
                }}>
                  {p.diff > 0 ? `+${p.diff}` : p.diff}
                  
                </div>
              </div>
            );
          })}
        </div>

        {phase === "done" && (
          <div style={{ fontSize: 13, color: C.muted, animation: "pulse 1.2s infinite" }}>
            タップして閉じる
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Auth Screen ─────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handle() {
    const trimName = name.trim();
    if (!trimName || !password) { setError("名前とパスワードを入力してください"); return; }
    setLoading(true); setError("");
    try {
      if (mode === "register") {
        const existing = await api.getAccount(trimName);
        if (existing && existing.length > 0) { setError("この名前はすでに登録されています"); return; }
        const [acc] = await api.createAccount({ name: trimName, password, rating: INITIAL_RATING, wins: 0, losses: 0, draws: 0, history: [] });
        onLogin(acc);
      } else {
        const results = await api.getAccount(trimName);
        if (!results || results.length === 0) { setError("アカウントが見つかりません"); return; }
        const acc = results[0];
        if (acc.password !== password) { setError("パスワードが違います"); return; }
        onLogin(acc);
      }
    } catch (e) { setError("エラー: " + e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Hiragino Sans','Yu Gothic UI',sans-serif", background: "linear-gradient(135deg,#0a0c14 0%,#0e1020 50%,#0a0c14 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 80, height: 80, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}><img src="/logo.jpg" alt="POWERS" style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 12 }} /></div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: C.text, letterSpacing: 1 }}>BATTLE ZONE</h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4, letterSpacing: 1 }}>RATING SYSTEM</div>
        </div>
        <div style={{ background: "#12151f", borderRadius: 16, padding: "28px 24px", boxShadow: "0 4px 24px #0009", border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", background: C.bg, borderRadius: 10, padding: 4, marginBottom: 22 }}>
            {[["login","ログイン"],["register","新規登録"]].map(([m,l]) => (
              <button key={m} onClick={() => { setMode(m); setError(""); }} style={{ flex: 1, padding: "8px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, background: mode === m ? "#1e2235" : "transparent", color: mode === m ? C.accent : C.muted, boxShadow: mode === m ? "0 1px 4px #0000001a" : "none" }}>{l}</button>
            ))}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>トレーナー名</label>
            <input style={S.input} placeholder="名前を入力" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} />
          </div>
          <div style={{ marginBottom: error ? 10 : 20 }}>
            <label style={S.label}>パスワード</label>
            <input style={S.input} type="password" placeholder="パスワードを入力" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} />
          </div>
          {error && <div style={{ background: "#0e1020", border: "1px solid #ff446655", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.red, marginBottom: 14, fontWeight: 600 }}>⚠️ {error}</div>}
          <button onClick={handle} disabled={loading} style={{ ...btn("primary"), width: "100%", padding: "12px", fontSize: 14, opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {loading && <Spinner />}{mode === "login" ? "ログイン →" : "アカウントを作成 →"}
          </button>
          <div style={{ textAlign: "center", marginTop: 14, fontSize: 11, color: C.muted }}>データはクラウドに保存されます</div>
        </div>
      </div>
    </div>
  );
}

// ─── Tournament Lobby ─────────────────────────────────────────
function TournamentLobby({ account, onEnter, onLogout }) {
  const [mode, setMode] = useState("top");
  const [tName, setTName] = useState("");
  const [tableCount, setTableCount] = useState("4");
  const [joinId, setJoinId] = useState("");
  const [opCode, setOpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const OPERATOR_CODE = "powers2025"; // 運営者コード
  const t = getTier(account.rating);

  async function createTournament() {
    if (!tName.trim()) { setError("大会名を入力してください"); return; }
    if (opCode !== OPERATOR_CODE) { setError("運営コードが違います"); return; }
    setLoading(true); setError("");
    try {
      const id = genTournamentId();
      const [tour] = await api.createTournament({ id, name: tName.trim(), table_count: Math.max(1, Math.min(32, parseInt(tableCount) || 4)), created_by: account.name });
      await api.addParticipant({ tournament_id: tour.id, account_id: account.id, rating_at_join: 1500, current_rating: 1500, wins: 0, losses: 0, draws: 0, rematch_limit: 5 });
      onEnter(tour);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function joinTournament() {
    const id = joinId.trim().toUpperCase();
    if (!id) { setError("大会IDを入力してください"); return; }
    setLoading(true); setError("");
    try {
      const results = await api.getTournament(id);
      if (!results || results.length === 0) { setError("大会が見つかりません"); return; }
      const tour = results[0];
      const parts = await api.getParticipants(tour.id);
      if (!parts.find(p => p.account_id === account.id)) {
        await api.addParticipant({ tournament_id: tour.id, account_id: account.id, rating_at_join: 1500, current_rating: 1500, wins: 0, losses: 0, draws: 0, rematch_limit: 5 });
      }
      onEnter(tour);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Hiragino Sans','Yu Gothic UI',sans-serif", background: "linear-gradient(135deg,#0a0c14 0%,#0e1020 50%,#0a0c14 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ width: 64, height: 64, margin: "0 auto 10px", display: "flex", alignItems: "center", justifyContent: "center" }}><img src="/logo.jpg" alt="POWERS" style={{ width: 64, height: 64, objectFit: "contain", borderRadius: 10 }} /></div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.text, letterSpacing: 1 }}>BATTLE ZONE</div>
        </div>

        {/* Account chip */}
        <div style={{ background: "#12151f", borderRadius: 12, padding: "12px 16px", marginBottom: 16, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 4px #0000000a" }}>
          <img src="/logo.jpg" alt="POWERS" style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 8, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{account.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <Tier rating={account.rating} />
              <span style={{ fontSize: 12, color: C.muted }}>{account.rating} pt</span>
            </div>
          </div>
          <button style={btn("ghost", true)} onClick={onLogout}>ログアウト</button>
        </div>

        {mode === "top" && (
          <div style={{ background: "#12151f", borderRadius: 16, padding: "24px", boxShadow: "0 4px 24px #0009", border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16, textAlign: "center" }}>大会を選択してください</div>
            <button style={{ ...btn("primary"), width: "100%", padding: "14px", fontSize: 15, marginBottom: 10 }} onClick={() => setMode("create")}>
              ➕ 新しい大会を作成する
            </button>
            <button style={{ ...btn("ghost"), width: "100%", padding: "14px", fontSize: 15 }} onClick={() => setMode("join")}>
              🔗 大会IDで参加する
            </button>
          </div>
        )}

        {mode === "create" && (
          <div style={{ background: "#12151f", borderRadius: 16, padding: "24px", boxShadow: "0 4px 24px #0009", border: `1px solid ${C.border}` }}>
            <button onClick={() => { setMode("top"); setError(""); }} style={{ ...btn("ghost", true), marginBottom: 16 }}>← 戻る</button>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>新しい大会を作成</div>
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>大会名</label>
              <input style={S.input} placeholder="例: 第3回 BATTLE ZONE杯" value={tName} onChange={e => setTName(e.target.value)} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>対戦台の数（1〜32）</label>
              <input style={S.input} type="number" min="1" max="32" value={tableCount} onChange={e => setTableCount(e.target.value)} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={S.label}>運営コード</label>
              <input style={{ ...S.input, letterSpacing: 2 }} type="password" placeholder="運営者のみ入力可能" value={opCode} onChange={e => setOpCode(e.target.value)} />
            </div>
            {error && <div style={{ background: "#0e1020", border: "1px solid #ff446655", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.red, marginBottom: 14, fontWeight: 600 }}>⚠️ {error}</div>}
            <button onClick={createTournament} disabled={loading} style={{ ...btn("green"), width: "100%", padding: "13px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {loading && <Spinner />} 大会を作成する →
            </button>
          </div>
        )}

        {mode === "join" && (
          <div style={{ background: "#12151f", borderRadius: 16, padding: "24px", boxShadow: "0 4px 24px #0009", border: `1px solid ${C.border}` }}>
            <button onClick={() => { setMode("top"); setError(""); }} style={{ ...btn("ghost", true), marginBottom: 16 }}>← 戻る</button>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>大会に参加する</div>
            <div style={{ marginBottom: 20 }}>
              <label style={S.label}>大会ID（6文字）</label>
              <input style={{ ...S.input, textTransform: "uppercase", letterSpacing: 4, fontSize: 20, textAlign: "center", fontWeight: 700 }} placeholder="XXXXXX" maxLength={6} value={joinId} onChange={e => setJoinId(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && joinTournament()} />
            </div>
            {error && <div style={{ background: "#0e1020", border: "1px solid #ff446655", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.red, marginBottom: 14, fontWeight: 600 }}>⚠️ {error}</div>}
            <button onClick={joinTournament} disabled={loading} style={{ ...btn("primary"), width: "100%", padding: "13px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {loading && <Spinner />} 参加する →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tournament App ───────────────────────────────────────────
function TournamentApp({ account, setAccount, tournament, onLeave }) {
  const [participants, setParticipants] = useState([]);
  const [pendingMatches, setPendingMatches] = useState([]);
  const [matchHistory, setMatchHistory] = useState([]);
  const [waitingQueue, setWaitingQueue] = useState(() => {
    try {
      const s = localStorage.getItem('bz_queue_' + tournament.id);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  // 待機列が変わるたびlocalStorageに保存
  useEffect(() => {
    localStorage.setItem('bz_queue_' + tournament.id, JSON.stringify(waitingQueue));
  }, [waitingQueue, tournament.id]);
  const [tab, setTab] = useState("queue");
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [opForm, setOpForm] = useState({ p1: "", p2: "", table: "" });
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [ratingAnim, setRatingAnim] = useState(null);
  const [showResult, setShowResult] = useState(!!tournament.ended_at);
  const [pushEnabled, setPushEnabled] = useState(false);
  const toastRef = useRef(null);
  const tableCount = tournament.table_count || 4;

  function showToast(msg, type = "success") {
    clearTimeout(toastRef.current);
    setToast({ msg, type });
    toastRef.current = setTimeout(() => setToast(null), 2800);
  }

  const loadAll = useCallback(async () => {
    try {
      const [parts, pend, hist] = await Promise.all([
        api.getParticipants(tournament.id),
        api.getPending(tournament.id),
        api.getMatches(tournament.id),
      ]);
      setParticipants(parts || []);
      setPendingMatches(pend || []);
      setMatchHistory((hist || []).filter(m => m.result !== null));
      // 対戦中になった人を待機列から自動除外
      if (pend && pend.length > 0) {
        const nowPlaying = new Set(pend.flatMap(m => [m.p1_id, m.p2_id]));
        setWaitingQueue(prev => prev.filter(id => !nowPlaying.has(id)));
      }
    } catch (e) { console.error(e); }
  }, [tournament.id]);

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 5000);
    return () => clearInterval(id);
  }, [loadAll]);

  const usedTables = new Set(pendingMatches.map(m => m.table_num));
  const freeTables = Array.from({ length: tableCount }, (_, i) => i + 1).filter(t => !usedTables.has(t));
  const playingIds = new Set(pendingMatches.flatMap(m => [m.p1_id, m.p2_id]));
  const queueSet = new Set(waitingQueue);
  // 各プレイヤーのrematch_limitを考慮した再戦チェック関数
  function hasPlayedRecently(a, b) {
    const limitA = a.rematch_limit ?? 5;
    const limitB = b.rematch_limit ?? 5;
    const limit = Math.max(limitA, limitB); // 厳しい方を優先
    const key = pairKey(a.account_id, b.account_id);
    const recentN = [...matchHistory].slice(0, limit);
    return recentN.some(m => pairKey(m.p1_id, m.p2_id) === key);
  }
  const myPart = participants.find(p => p.account_id === account.id);
  const ranked = [...participants].sort((a, b) => b.current_rating - a.current_rating);
  // 大会作成者のみ運営権限あり
  const isOperator = tournament.created_by === account.name;

  function playerStatus(accountId) {
    if (playingIds.has(accountId)) return "playing";
    if (queueSet.has(accountId)) return "waiting";
    return "free";
  }

  async function createPendingMatch(a, b, table) {
    try {
      const [m] = await api.createMatch({
        tournament_id: tournament.id,
        p1_id: a.account_id, p2_id: b.account_id,
        p1_name: a.account.name, p2_name: b.account.name,
        p1_rating_before: a.current_rating, p2_rating_before: b.current_rating,
        table_num: table, result: null,
        played_at: new Date().toISOString(),
        timer_started_at: null,
      });
      setPendingMatches(prev => [...prev, m]);
    } catch (e) { showToast("マッチ作成に失敗しました", "error"); }
  }

  function joinQueue(accountId) {
    const p = participants.find(x => x.account_id === accountId);
    if (!p) return;
    if (waitingQueue.includes(accountId)) { showToast(`${p.account.name} はすでに待機中です`, "error"); return; }
    if (playingIds.has(accountId)) { showToast(`${p.account.name} は対戦中です`, "error"); return; }

    const newQueue = [...waitingQueue, accountId];
    const queueParts = newQueue.map(id => participants.find(x => x.account_id === id)).filter(Boolean);

    if (queueParts.length >= 2 && freeTables.length > 0) {
      let best = null, bestDiff = Infinity;
      for (let i = 0; i < queueParts.length; i++)
        for (let j = i + 1; j < queueParts.length; j++) {
          const a = queueParts[i], b = queueParts[j];
          if (hasPlayedRecently(a, b)) continue;
          const diff = Math.abs(a.current_rating - b.current_rating);
          if (diff < bestDiff) { bestDiff = diff; best = [a, b]; }
        }
      if (best) {
        const [a, b] = best;
        const table = freeTables[0];
        createPendingMatch(a, b, table);
        setWaitingQueue(newQueue.filter(id => id !== a.account_id && id !== b.account_id));
        showToast(`🎮 台${table}：${a.account.name} vs ${b.account.name} マッチ成立！`);
        sendNotification("マッチング成立！", `台${table}：${a.account.name} vs ${b.account.name}`);
        return;
      }
    }
    setWaitingQueue(newQueue);
    showToast(`${p.account.name} が待機列に入りました`);
  }

  function leaveQueue(accountId) {
    setWaitingQueue(prev => prev.filter(id => id !== accountId));
    const p = participants.find(x => x.account_id === accountId);
    showToast(`${p?.account?.name} が待機列から抜けました`);
  }

  async function updateRematchLimit(limit) {
    if (!myPart) return;
    try {
      await api.updateParticipant(myPart.id, { rematch_limit: limit });
      await loadAll();
      showToast(`連戦拒否を「${limit === 0 ? "なし" : `直近${limit}戦`}」に設定しました`);
    } catch (e) { showToast("設定の保存に失敗しました", "error"); }
  }

  // プッシュ通知
  async function requestPushPermission() {
    if (!("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setPushEnabled(perm === "granted");
    if (perm === "granted") showToast("通知をオンにしました ✓");
    else showToast("通知が許可されませんでした", "error");
  }
  function sendNotification(title, body) {
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/logo.jpg" });
    }
  }

  // 大会終了
  async function endTournament() {
    if (!window.confirm("大会を終了しますか？この操作は取り消せません。")) return;
    try {
      await api.endTournament(tournament.id);
      setShowResult(true);
      showToast("大会を終了しました");
    } catch (e) { showToast("エラー: " + e.message, "error"); }
  }

  async function startTimer(matchId) {
    try {
      await api.updateMatch(matchId, { timer_started_at: new Date().toISOString() });
      await loadAll();
    } catch (e) { showToast("タイマー開始に失敗しました", "error"); }
  }

  async function operatorMatch() {
    const { p1, p2, table } = opForm;
    if (!p1 || !p2 || p1 === p2) { showToast("プレイヤーを正しく選んでください", "error"); return; }
    if (!table) { showToast("対戦台を選んでください", "error"); return; }
    if (usedTables.has(Number(table))) { showToast("その台は使用中です", "error"); return; }
    const pa = participants.find(x => x.account_id === p1);
    const pb = participants.find(x => x.account_id === p2);
    if (pa && pb && hasPlayedRecently(pa, pb)) { showToast("この2人は連戦制限中です", "error"); return; }
    const a = participants.find(x => x.account_id === p1);
    const b = participants.find(x => x.account_id === p2);
    if (!a || !b) return;
    await createPendingMatch(a, b, Number(table));
    setWaitingQueue(prev => prev.filter(id => id !== p1 && id !== p2));
    setOpForm({ p1: "", p2: "", table: "" });
    showToast(`🎮 台${table}：${a.account.name} vs ${b.account.name}`);
  }

  function requestResult(matchId, result) {
    const m = pendingMatches.find(x => x.id === matchId);
    if (!m) return;
    const scoreA = result === "p1" ? 1 : result === "draw" ? 0.5 : 0;
    const [nr1, nr2] = calcNewRatings(m.p1_rating_before, m.p2_rating_before, scoreA);
    const label = result === "p1" ? `${m.p1_name} 勝利` : result === "p2" ? `${m.p2_name} 勝利` : "対戦中止";
    setConfirm({ matchId, result, label, p1name: m.p1_name, p2name: m.p2_name, r1after: nr1, r2after: nr2, diff1: nr1 - m.p1_rating_before, diff2: nr2 - m.p2_rating_before, table: m.table_num });
  }

  async function confirmResult() {
    if (!confirm) return;
    const m = pendingMatches.find(x => x.id === confirm.matchId);
    if (!m) { setConfirm(null); return; }
    try {
      const scoreA = confirm.result === "p1" ? 1 : confirm.result === "draw" ? 0.5 : 0;
      const [nr1, nr2] = calcNewRatings(m.p1_rating_before, m.p2_rating_before, scoreA);
      const duration = Math.floor((Date.now() - new Date(m.played_at).getTime()) / 1000);
      await api.updateMatch(m.id, { result: confirm.label, p1_rating_after: nr1, p2_rating_after: nr2, duration });
      const p1part = participants.find(p => p.account_id === m.p1_id);
      const p2part = participants.find(p => p.account_id === m.p2_id);
      if (p1part) await api.updateParticipant(p1part.id, { current_rating: nr1, wins: p1part.wins + (scoreA === 1 ? 1 : 0), losses: p1part.losses + (scoreA === 0 ? 1 : 0), draws: p1part.draws + (scoreA === .5 ? 1 : 0) });
      if (p2part) await api.updateParticipant(p2part.id, { current_rating: nr2, wins: p2part.wins + (scoreA === 0 ? 1 : 0), losses: p2part.losses + (scoreA === 1 ? 1 : 0), draws: p2part.draws + (scoreA === .5 ? 1 : 0) });
      const dateStr = new Date().toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
      for (const [part, nr, diff, res, opp] of [
        [p1part, nr1, nr1 - m.p1_rating_before, scoreA === 1 ? "win" : scoreA === 0 ? "loss" : "draw", m.p2_name],
        [p2part, nr2, nr2 - m.p2_rating_before, scoreA === 0 ? "win" : scoreA === 1 ? "loss" : "draw", m.p1_name],
      ]) {
        if (!part) continue;
        const [acc] = await api.getAccount(part.account.name);
        if (acc) {
          const newHistory = [...(acc.history || []), { result: res, opponent: opp, ratingAfter: nr, diff, date: dateStr }];
          await api.updateAccount(acc.id, { rating: nr, wins: acc.wins + (res === "win" ? 1 : 0), losses: acc.losses + (res === "loss" ? 1 : 0), draws: acc.draws + (res === "draw" ? 1 : 0), history: newHistory });
          if (acc.id === account.id) setAccount({ ...acc, rating: nr, history: newHistory });
        }
      }
      // アニメーション表示
      setRatingAnim({
        label: confirm.label,
        p1name: confirm.p1name, p2name: confirm.p2name,
        r1before: m.p1_rating_before, r2before: m.p2_rating_before,
        r1after: nr1, r2after: nr2,
        diff1: nr1 - m.p1_rating_before, diff2: nr2 - m.p2_rating_before,
      });
      setConfirm(null);
      await loadAll();
    } catch (e) { showToast("エラー: " + e.message, "error"); }
  }

  function copyId() {
    navigator.clipboard.writeText(tournament.id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const tabs = [
    ["queue",    `⏳ 待機 (${waitingQueue.length})`],
    ["tables",   `🎮 対戦中 (${pendingMatches.length})`],
    ...(isOperator ? [["operator", "🛠 運営"]] : []),
    ["ranking",  "🏆 ランキング"],
    ["history",  "📋 履歴"],
    ["mypage",   "👤 マイページ"],
    ...(showResult ? [["result", "🎖 結果"]] : []),
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Hiragino Sans','Yu Gothic UI',sans-serif", color: C.text }}>
      <Toast toast={toast} />
      <ConfirmDialog dialog={confirm} onConfirm={confirmResult} onCancel={() => setConfirm(null)} />
      {ratingAnim && <RatingAnimation data={ratingAnim} onClose={() => { setRatingAnim(null); showToast(`台${ratingAnim.label}登録完了`); }} />}

      {/* Header */}
      <div style={{ background: "#200a0a", borderBottom: `1px solid ${C.border}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 1px 4px #0000000a", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/logo.jpg" alt="POWERS" style={{ width: 30, height: 30, objectFit: "contain", borderRadius: 6 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.5 }}>BATTLE ZONE</div>
            <div style={{ fontSize: 10, color: C.muted }}>{tournament.name}</div>
          </div>
        </div>

        {/* Tournament ID - tap to copy */}
        <div onClick={copyId} style={{ display: "flex", alignItems: "center", gap: 6, background: C.dim, borderRadius: 20, padding: "4px 12px", cursor: "pointer", userSelect: "none" }}>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: C.accent }}>ID: {tournament.id}</span>
          <span style={{ fontSize: 11, color: copied ? C.green : C.muted }}>{copied ? "✓ コピー済" : "📋"}</span>
        </div>

        {/* Table indicators */}
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {Array.from({ length: tableCount }, (_, i) => i + 1).map(t => (
            <div key={t} style={{ width: 26, height: 26, borderRadius: 6, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", background: usedTables.has(t) ? "#1a0e00" : "#001410", color: usedTables.has(t) ? C.accent : C.green, border: `1.5px solid ${usedTables.has(t) ? C.accent : C.green}` }}>{t}</div>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.dim, border: `1px solid ${C.border}`, borderRadius: 20, padding: "4px 12px" }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{account.name}</span>
            <Tier rating={account.rating} />
          </div>
          <button style={btn("ghost", true)} onClick={onLeave}>退出</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#200a0a", borderBottom: `1px solid ${C.border}`, display: "flex", overflowX: "auto" }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ padding: "11px 15px", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", background: "transparent", color: tab === id ? C.accent : C.muted, borderBottom: tab === id ? `3px solid ${C.accent}` : "3px solid transparent" }}>{label}</button>
        ))}
      </div>

      {/* ── 待機 ── */}
      {tab === "queue" && (
        <div style={S.body}>
          {!myPart
            ? <div style={{ ...S.card, borderColor: "#7f1d1d", background: "#0e1020", marginBottom: 12 }}><div style={{ fontSize: 13, color: C.red, fontWeight: 700 }}>⚠️ あなたはこの大会に参加していません</div></div>
            : <div style={{ ...S.card, borderColor: "#1a5c3a", background: "#0a2a1a", marginBottom: 12 }}><div style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>✅ {account.name} — 参加中 / 今大会レート: {myPart.current_rating} pt</div></div>
          }
          <div style={{ ...S.card, borderColor: "#2e2040", background: "#12151f", marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#f87171", fontWeight: 700, marginBottom: 4 }}>📌 使い方</div>
            <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.7 }}>「対戦申請」を押すと待機列へ。レートが近い相手と自動マッチングされ、対戦台番号が表示されます。</div>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {Array.from({ length: tableCount }, (_, i) => i + 1).map(t => (
              <div key={t} style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: usedTables.has(t) ? "#1a0e00" : "#001410", color: usedTables.has(t) ? C.orange : C.green, border: `1.5px solid ${usedTables.has(t) ? C.orange : C.green}` }}>
                台{t} {usedTables.has(t) ? "使用中" : "空き"}
              </div>
            ))}
          </div>
          {participants.length === 0 && <div style={{ textAlign: "center", color: C.muted, padding: "30px 0" }}>まだ参加者がいません</div>}
          {[...participants].sort((a, b) => {
            if (a.account_id === account.id) return -1;
            if (b.account_id === account.id) return 1;
            return b.current_rating - a.current_rating;
          }).filter(p => isOperator || p.account_id === account.id || playerStatus(p.account_id) !== "waiting").map(p => {
            const st = playerStatus(p.account_id);
            const inQueue = waitingQueue.indexOf(p.account_id);
            const isMe = p.account_id === account.id;
            return (
              <div key={p.id} style={{ ...S.card, borderColor: isMe ? C.accent : st === "playing" ? "#86efac" : st === "waiting" ? "#fde047" : C.border, borderWidth: isMe ? 2 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{p.account.name}</span>
                      {isMe && <span style={{ fontSize: 10, fontWeight: 800, color: C.accent, background: "#1a0e00", border: "1px solid #ff4422", borderRadius: 4, padding: "1px 6px" }}>YOU</span>}
                      <Tier rating={p.current_rating} />
                      {st === "playing" && <span style={{ fontSize: 11, fontWeight: 700, color: C.green, background: "#001410", border: "1px solid #00d4aa", borderRadius: 12, padding: "2px 8px" }}>🎮 対戦中</span>}
                      {st === "waiting" && (p.account_id === account.id || isOperator) && <span style={{ fontSize: 11, fontWeight: 700, color: C.orange, background: "#1a1000", border: "1px solid #ff8c00", borderRadius: 12, padding: "2px 8px" }}>⏳ 待機中</span>}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted }}>{p.current_rating} pt ／ {p.wins}勝 {p.losses}敗</div>
                  </div>
                  {st === "free"    && (p.account_id === account.id || isOperator) && <button style={btn("green", true)} onClick={() => joinQueue(p.account_id)}>⚡ 対戦申請</button>}
                  {st === "waiting" && (p.account_id === account.id || isOperator) && <button style={btn("red", true)} onClick={() => leaveQueue(p.account_id)}>キャンセル</button>}
                  {st === "playing" && <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>台{pendingMatches.find(m => m.p1_id === p.account_id || m.p2_id === p.account_id)?.table_num}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 対戦中 ── */}
      {tab === "tables" && (
        <div style={S.body}>
          {pendingMatches.length === 0 && <div style={{ textAlign: "center", color: C.muted, padding: "40px 0" }}>進行中の対戦はありません</div>}
          {[...pendingMatches].sort((a, b) => {
            const myMatch = a.p1_id === account.id || a.p2_id === account.id;
            const myMatchB = b.p1_id === account.id || b.p2_id === account.id;
            if (myMatch && !myMatchB) return -1;
            if (!myMatch && myMatchB) return 1;
            return 0;
          }).map(m => {
            const ea = expected(m.p1_rating_before, m.p2_rating_before);
            const isMyMatch = m.p1_id === account.id || m.p2_id === account.id;
            return (
              <div key={m.id} style={{ background: isMyMatch ? "#161a28" : "#12151f", border: `2px solid ${isMyMatch ? C.accent : C.border2}`, borderRadius: 14, padding: "18px 16px", marginBottom: 12, boxShadow: isMyMatch ? `0 0 16px ${C.accent}44` : "0 2px 8px #0000000a", position: "relative" }}>
                <div style={{ position: "absolute", top: -1, right: 14, background: C.accent, color: "#fff", fontSize: 11, fontWeight: 800, padding: "3px 14px", borderRadius: "0 0 10px 10px" }}>台 {m.table_num}</div>
                <div style={{ textAlign: "center", marginBottom: 14, marginTop: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 1.5, marginBottom: 6 }}>経過時間</div>
                  <MatchTimer matchId={m.id} timerStartedAt={m.timer_started_at} onStart={startTimer} canControl={isMyMatch || isOperator} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  {[[m.p1_name, m.p1_rating_before, Math.round(ea * 100)], [m.p2_name, m.p2_rating_before, Math.round((1 - ea) * 100)]].map(([name, rating, pct], i) => (
                    <div key={i} style={{ flex: 1, textAlign: "center", background: "#161a28", borderRadius: 10, padding: "12px 8px", border: `1px solid ${C.border}` }}>
                      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{name}</div>
                      <div style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>{rating} pt</div>
                      <div style={{ color: C.accent, fontSize: 14, fontWeight: 800 }}>勝率 {pct}%</div>
                    </div>
                  ))}
                  <div style={{ color: C.muted, fontSize: 16, flexShrink: 0, padding: "0 4px" }}>VS</div>
                </div>
                <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 14, gap: 2 }}>
                  <div style={{ flex: Math.round(ea * 100), background: C.accent, borderRadius: "4px 0 0 4px" }} />
                  <div style={{ flex: Math.round((1 - ea) * 100), background: C.accent2, borderRadius: "0 4px 4px 0" }} />
                </div>
                {(isMyMatch || isOperator) ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ ...btn("primary"), flex: 1 }} onClick={() => requestResult(m.id, "p1")}>{m.p1_name} 勝利</button>
                    <button style={{ ...btn("ghost"), flex: 0.7 }} onClick={() => requestResult(m.id, "draw")}>対戦中止</button>
                    <button style={{ ...btn("indigo"), flex: 1 }} onClick={() => requestResult(m.id, "p2")}>{m.p2_name} 勝利</button>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", fontSize: 12, color: C.muted, padding: "8px 0", background: C.dim, borderRadius: 8 }}>結果の登録は対戦者・運営者のみ</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 運営 ── */}
      {tab === "operator" && (
        <div style={S.body}>
          <div style={{ ...S.card, marginBottom: 14 }}>
            <div style={S.sectionTitle}>手動マッチング</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[["p1","プレイヤー 1"],["p2","プレイヤー 2"]].map(([key, label]) => (
                <div key={key} style={{ flex: 1 }}>
                  <label style={S.label}>{label}</label>
                  <select style={S.select} value={opForm[key]} onChange={e => setOpForm(f => ({ ...f, [key]: e.target.value }))}>
                    <option value="">選択してください</option>
                    {participants.filter(p => playerStatus(p.account_id) !== "playing" && (key === "p1" || p.account_id !== opForm.p1)).map(p => (
                      <option key={p.id} value={p.account_id}>{p.account.name} ({p.current_rating}){playerStatus(p.account_id) === "waiting" ? " [待機中]" : ""}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>対戦台を選択</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Array.from({ length: tableCount }, (_, i) => i + 1).map(t => (
                  <button key={t} onClick={() => setOpForm(f => ({ ...f, table: String(t) }))} style={{ ...btn(opForm.table === String(t) ? "primary" : "ghost", true), opacity: usedTables.has(t) ? 0.4 : 1, pointerEvents: usedTables.has(t) ? "none" : "auto" }}>台{t}</button>
                ))}
              </div>
            </div>
            <button style={{ ...btn("green"), width: "100%" }} onClick={operatorMatch}>マッチングする</button>
          </div>
          {/* 通知設定 */}
          <div style={{ ...S.card, marginBottom: 14 }}>
            <div style={S.sectionTitle}>通知設定</div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>マッチング成立時にスマホ通知を受け取れます</div>
            <button style={{ ...btn(pushEnabled ? "ghost" : "primary"), width: "100%" }} onClick={requestPushPermission}>
              {pushEnabled ? "✓ 通知オン" : "🔔 通知を許可する"}
            </button>
          </div>

          {/* 大会終了 */}
          {isOperator && !showResult && (
            <div style={{ ...S.card, borderColor: C.red, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 8 }}>⚠️ 危険ゾーン</div>
              <button style={{ ...btn("red"), width: "100%" }} onClick={endTournament}>
                🏁 大会を終了する
              </button>
            </div>
          )}

          {waitingQueue.length > 0 && (
            <div style={S.card}>
              <div style={S.sectionTitle}>待機列 ({waitingQueue.length}人)</div>
              {waitingQueue.map((id, i) => {
                const p = participants.find(x => x.account_id === id);
                return p ? (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.muted, fontSize: 12, width: 24, fontWeight: 700 }}>#{i + 1}</span>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{p.account.name}</span>
                    <Tier rating={p.current_rating} />
                    <span style={{ color: C.muted, fontSize: 12, marginLeft: "auto" }}>{p.current_rating} pt</span>
                  </div>
                ) : null;
              })}
            </div>
          )}
        </div>
      )}

      {/* ── ランキング ── */}
      {tab === "ranking" && (
        <div style={S.body}>
          <input style={{ ...S.input, marginBottom: 14 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 名前で検索..." />
          {ranked.filter(p => p.account.name.toLowerCase().includes(search.toLowerCase())).map((p, i) => {
            const t = getTier(p.current_rating);
            const total = p.wins + p.losses + p.draws;
            const wr = total > 0 ? Math.round(p.wins / total * 100) : 0;
            const isMe = p.account_id === account.id;
            return (
              <div key={p.id} style={{ ...S.card, borderColor: isMe ? C.accent : i === 0 ? t.border : C.border, borderWidth: isMe ? 2 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 32, textAlign: "center", fontSize: i < 3 ? 20 : 14, fontWeight: 800, color: i < 3 ? t.color : C.muted, flexShrink: 0 }}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{p.account.name}</span>
                      {isMe && <span style={{ fontSize: 10, fontWeight: 800, color: C.accent, background: "#1a0e00", border: "1px solid #ff4422", borderRadius: 4, padding: "1px 6px" }}>YOU</span>}
                      <Tier rating={p.current_rating} />
                      {playerStatus(p.account_id) === "playing" && <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>●対戦中</span>}
                      {playerStatus(p.account_id) === "waiting" && <span style={{ fontSize: 11, color: C.orange, fontWeight: 700 }}>●待機中</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: C.dim, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${wr}%`, height: "100%", background: `linear-gradient(90deg,#e03030,#b01010)`, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>{p.wins}勝 {p.losses}敗 ({wr}%)</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: t.color, flexShrink: 0 }}>{p.current_rating}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 履歴 ── */}
      {tab === "history" && (
        <div style={S.body}>
          <div style={S.sectionTitle}>{matchHistory.length} 試合の記録</div>
          {matchHistory.length === 0 && <div style={{ textAlign: "center", color: C.muted, padding: "40px 0" }}>まだ対戦記録がありません</div>}
          {matchHistory.map(m => (
            <div key={m.id} style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: C.muted }}>
                  {new Date(m.played_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                  {m.duration != null ? ` ／ ${Math.floor(m.duration / 60)}分${String(m.duration % 60).padStart(2, "0")}秒` : ""}
                </span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, background: "#1a0e00", border: "1px solid #ff4422", borderRadius: 12, padding: "2px 9px" }}>台{m.table_num}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.orange }}>{m.result}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {[[m.p1_name, m.p1_rating_before, m.p1_rating_after], [m.p2_name, m.p2_rating_before, m.p2_rating_after]].map(([name, before, after], i) => {
                  const diff = (after || 0) - (before || 0);
                  return (
                    <div key={i} style={{ flex: 1, textAlign: "center", background: "#161a28", borderRadius: 8, padding: "10px 6px" }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{name}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{before} →</div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: diff >= 0 ? C.green : C.red }}>
                        {after ?? "—"}{after != null && <span style={{ fontSize: 11 }}> ({diff >= 0 ? "+" : ""}{diff})</span>}
                      </div>
                    </div>
                  );
                })}
                <div style={{ color: C.border2, fontSize: 16, flexShrink: 0 }}>⚔</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── マイページ ── */}
      {tab === "mypage" && (() => {
        const t = getTier(account.rating);
        const total = account.wins + account.losses + account.draws;
        const wr = total > 0 ? Math.round(account.wins / total * 100) : 0;
        return (
          <div style={S.body}>
            <div style={{ ...S.card, background: `linear-gradient(135deg,${t.bg}33,#12151f)`, borderColor: t.border, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <img src="/logo.jpg" alt="POWERS" style={{ width: 52, height: 52, objectFit: "contain", borderRadius: 10, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: 17 }}>{account.name}</span>
                    <Tier rating={account.rating} />
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: t.color }}>{account.rating} <span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}>pt（通算）</span></div>
                </div>
              </div>
            </div>
            {myPart && (
              <div style={{ ...S.card, marginBottom: 14, borderColor: "#fbb4b4" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, marginBottom: 6 }}>今大会のレート</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.accent }}>{myPart.current_rating} pt</div>
                <div style={{ fontSize: 12, color: C.muted }}>{myPart.wins}勝 {myPart.losses}敗 (大会内)</div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
              {[["勝", account.wins, C.green], ["敗", account.losses, C.red], ["引", account.draws, C.muted]].map(([l, n, c]) => (
                <div key={l} style={{ ...S.card, textAlign: "center", padding: "16px 8px", margin: 0 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: c }}>{n}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{l}（通算）</div>
                </div>
              ))}
            </div>
            <div style={{ ...S.card, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={S.sectionTitle}>通算勝率</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: t.color }}>{wr}%</span>
              </div>
              <div style={{ height: 10, background: C.dim, borderRadius: 6, overflow: "hidden" }}>
                <div style={{ width: `${wr}%`, height: "100%", background: `linear-gradient(90deg,#e03030,#b01010)`, borderRadius: 6 }} />
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{total} 試合</div>
            </div>
            {/* 連戦拒否設定 */}
            {myPart && (
              <div style={{ ...S.card, marginBottom: 14, borderColor: C.accent }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, marginBottom: 10, letterSpacing: 1 }}>🔄 連戦拒否設定</div>
                <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>同じ相手と何戦前まで対戦しないか設定します（デフォルト: 5戦前）</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[0,1,2,3,5,10].map(n => (
                      <button key={n} onClick={() => updateRematchLimit(n)} style={{
                        ...btn(myPart.rematch_limit === n || (n === 5 && myPart.rematch_limit == null) ? "primary" : "ghost", true),
                        minWidth: 36,
                      }}>{n === 0 ? "なし" : `${n}戦`}</button>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
                  現在: {myPart.rematch_limit === 0 ? "制限なし" : `直近 ${myPart.rematch_limit ?? 5} 戦以内の相手とは対戦しない`}
                </div>
              </div>
            )}
            <div style={S.sectionTitle}>対戦履歴（通算）</div>
            {(!account.history || account.history.length === 0) && <div style={{ textAlign: "center", color: C.muted, padding: "24px 0" }}>まだ対戦記録がありません</div>}
            {(account.history || []).slice().reverse().map((h, i) => (
              <div key={i} style={{ ...S.card, margin: "0 0 8px", borderLeft: `4px solid ${h.result === "win" ? C.green : h.result === "loss" ? C.red : C.muted}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: h.result === "win" ? C.green : h.result === "loss" ? C.red : C.muted }}>
                      {h.result === "win" ? "🏆 勝利" : h.result === "loss" ? "💔 敗北" : "🤝 対戦中止"}
                    </span>
                    <span style={{ fontSize: 12, color: C.sub, marginLeft: 8 }}>vs {h.opponent}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{h.ratingAfter}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: h.diff >= 0 ? C.green : C.red }}>{h.diff >= 0 ? "+" : ""}{h.diff}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{h.date}</div>
              </div>
            ))}
          </div>
        );
      })()}
      {/* ── 結果 ── */}
      {tab === "result" && (
        <div style={S.body}>
          {/* 優勝者 */}
          {(() => {
            const sorted = [...participants].sort((a, b) => b.current_rating - a.current_rating);
            const top3 = sorted.slice(0, 3);
            const mvpWins = [...participants].sort((a, b) => b.wins - a.wins)[0];
            const medals = ["🥇", "🥈", "🥉"];
            return (
              <>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 2, marginBottom: 8 }}>FINAL RESULT</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: C.text }}>{tournament.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>大会終了</div>
                </div>

                {/* 表彰台TOP3 */}
                <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "flex-end" }}>
                  {[top3[1], top3[0], top3[2]].filter(Boolean).map((p, vi) => {
                    const realIdx = vi === 0 ? 1 : vi === 1 ? 0 : 2;
                    const heights = [160, 200, 140];
                    const t2 = getTier(p.current_rating);
                    const isMe = p.account_id === account.id;
                    return (
                      <div key={p.id} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: realIdx === 0 ? 16 : 13, fontWeight: 800, color: C.sub, marginBottom: 6 }}>{p.account.name}</div>
                        <div style={{ fontSize: realIdx === 0 ? 13 : 11, color: t2.color, marginBottom: 4, fontWeight: 700 }}>{p.current_rating} pt</div>
                        <div style={{ height: heights[vi], background: realIdx === 0 ? `linear-gradient(180deg,${C.accent},${C.accent2})` : C.dim, border: `2px solid ${realIdx === 0 ? C.accent : C.border}`, borderRadius: "8px 8px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxShadow: realIdx === 0 ? `0 0 20px ${C.accent}66` : "none" }}>
                          <div style={{ fontSize: realIdx === 0 ? 40 : 28 }}>{medals[realIdx]}</div>
                          {isMe && <div style={{ fontSize: 10, fontWeight: 800, color: "#fff", marginTop: 4 }}>YOU</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* MVP */}
                {mvpWins && mvpWins.wins > 0 && (
                  <div style={{ ...S.card, borderColor: C.orange, background: "#1a1200", marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, marginBottom: 8, letterSpacing: 1 }}>⚡ MVP - 最多勝利</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ fontSize: 28 }}>🏆</div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>{mvpWins.account.name}</div>
                        <div style={{ fontSize: 12, color: C.muted }}>{mvpWins.wins}勝 {mvpWins.losses}敗</div>
                      </div>
                      <div style={{ marginLeft: "auto", fontSize: 20, fontWeight: 900, color: C.orange }}>{mvpWins.current_rating} pt</div>
                    </div>
                  </div>
                )}

                {/* 全順位 */}
                <div style={S.sectionTitle}>最終順位</div>
                {sorted.map((p, i) => {
                  const t2 = getTier(p.current_rating);
                  const isMe = p.account_id === account.id;
                  const total = p.wins + p.losses + p.draws;
                  const wr = total > 0 ? Math.round(p.wins / total * 100) : 0;
                  return (
                    <div key={p.id} style={{ ...S.card, borderColor: isMe ? C.accent : i < 3 ? t2.border : C.border, borderWidth: isMe ? 2 : 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, textAlign: "center", fontSize: i < 3 ? 20 : 14, fontWeight: 800, color: i < 3 ? t2.color : C.muted }}>
                          {i < 3 ? medals[i] : `#${i + 1}`}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontWeight: 700 }}>{p.account.name}</span>
                            {isMe && <span style={{ fontSize: 10, fontWeight: 800, color: C.accent, background: "#1a0e00", border: `1px solid ${C.accent}`, borderRadius: 4, padding: "1px 6px" }}>YOU</span>}
                            <Tier rating={p.current_rating} />
                          </div>
                          <div style={{ fontSize: 12, color: C.muted }}>{p.wins}勝 {p.losses}敗 · 勝率{wr}%</div>
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 900, color: t2.color }}>{p.current_rating}</div>
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      )}

    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────
export default function App() {
  const [account, setAccount] = useState(() => {
    try { const s = localStorage.getItem("bz_account"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [tournament, setTournament] = useState(() => {
    try { const s = localStorage.getItem("bz_tournament"); return s ? JSON.parse(s) : null; } catch { return null; }
  });

  function handleLogin(acc) {
    setAccount(acc);
    localStorage.setItem("bz_account", JSON.stringify(acc));
  }
  function handleSetAccount(acc) {
    setAccount(acc);
    localStorage.setItem("bz_account", JSON.stringify(acc));
  }
  function handleEnterTournament(t) {
    setTournament(t);
    localStorage.setItem("bz_tournament", JSON.stringify(t));
  }
  function handleLogout() {
    setAccount(null);
    setTournament(null);
    localStorage.removeItem("bz_account");
    localStorage.removeItem("bz_tournament");
  }
  function handleLeave() {
    setTournament(null);
    localStorage.removeItem("bz_tournament");
  }

  return (
    <>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } @keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
      {!account && <AuthScreen onLogin={handleLogin} />}
      {account && !tournament && <TournamentLobby account={account} onEnter={handleEnterTournament} onLogout={handleLogout} />}
      {account && tournament && <TournamentApp account={account} setAccount={handleSetAccount} tournament={tournament} onLeave={handleLeave} />}
    </>
  );
}
