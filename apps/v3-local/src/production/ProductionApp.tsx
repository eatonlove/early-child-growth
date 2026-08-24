import { useEffect, useState, type FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Database,
  FileCheck2,
  FileText,
  Home,
  KeyRound,
  LogOut,
  Library,
  Menu,
  Microscope,
  School,
  ShieldCheck,
  Sprout,
  Users,
  X,
} from "lucide-react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "../router";
import { RemoteApiError } from "./api";
import { RemoteAuthProvider, useRemoteAuth } from "./auth";
import {
  RemoteAccountsPage,
  RemoteClassroomPage,
  RemoteDashboardPage,
  RemoteExportsPage,
  RemoteGrowthPage,
  RemoteKnowledgePage,
  RemoteObservationPage,
  RemoteReportsPage,
  RemoteCurriculumPage,
  RemoteQualityPage,
  RemoteResearchPage,
} from "./pages";
import "./production-design.css";

const navigation: Array<[string, string, LucideIcon]> = [
  ["/", "工作台", Home],
  ["/classrooms", "班级与幼儿", Users],
  ["/observations", "标准观察", Activity],
  ["/growth", "成长与应答", Sprout],
  ["/reports", "周期报告", FileText],
  ["/curriculum", "课程生成", BookOpen],
  ["/knowledge", "知识库", Library],
];

function LoginPage() {
  const { login } = useRemoteAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password);
    } catch (reason) {
      setError(
        reason instanceof RemoteApiError
          ? reason.message
          : "登录失败，请稍后重试",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="remote-login">
      <section className="remote-login-story">
        <div className="brand">
          <span className="brand-glyph">同</span>
          <div>
            <strong>同迹 3.0</strong>
            <small>幼儿游戏循证评估系统</small>
          </div>
        </div>
        <div>
          <BadgeMark />
          <h1>让零散的游戏信息，成为可以追踪、解释和回应的成长证据。</h1>
          <p>
            教师先观察与思考，AI结合《3-6岁儿童学习与发展指南》提供第二视角。
          </p>
        </div>
        <div className="remote-login-flow">
          <span>观察</span>
          <ChevronRight />
          <span>识别</span>
          <ChevronRight />
          <span>应答</span>
          <ChevronRight />
          <span>拓展</span>
        </div>
      </section>
      <section className="remote-login-card">
        <div className="remote-login-logo">
          <span>同</span>
          <div>
            <strong>欢迎使用同迹</strong>
            <small>请使用园所分配的账号登录</small>
          </div>
        </div>
        <form onSubmit={submit}>
          <label>
            <span>账号</span>
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入登录账号"
            />
          </label>
          <label>
            <span>密码</span>
            <input
              autoComplete="current-password"
              type="password"
              minLength={10}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
            />
          </label>
          {error && <p className="remote-login-error">{error}</p>}
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? "正在验证…" : "登录系统"}
          </button>
        </form>
        <div className="remote-login-security">
          <ShieldCheck />
          <span>
            账号密码由Supabase Auth验证，业务数据按园所schema与班级权限隔离。
          </span>
        </div>
      </section>
    </main>
  );
}

function BadgeMark() {
  return (
    <span className="remote-system-mark">
      <Sprout />
      儿童为本 · 证据可追溯
    </span>
  );
}

function RemoteShell() {
  const { user, logout } = useRemoteAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => setMenuOpen(false), [location.pathname]);
  if (!user) return null;
  const nav =
    user.role === "researcher"
      ? [
          ...navigation,
          ["/quality", "观察质量审核", ClipboardCheck] as [string, string, LucideIcon],
          ["/exports", "导出审批", FileCheck2] as [string, string, LucideIcon],
          ["/research", "教研活动", Microscope] as [string, string, LucideIcon],
          ["/accounts", "账号管理", KeyRound] as [string, string, LucideIcon],
        ]
      : [
          ...navigation,
          ["/exports", "导出申请", FileCheck2] as [string, string, LucideIcon],
          ["/research", "教研活动", Microscope] as [string, string, LucideIcon],
        ];
  const currentPage = nav.find(([path]) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path),
  )?.[1] ?? "工作台";
  const isHome = location.pathname === "/";
  const workspaceLabel = user.role === "researcher" ? "教研员" : "教师";
  const signOut = async () => {
    await logout();
    navigate("/");
  };
  const userControl = (
    <div className="remote-user">
      <span>{user.displayName.slice(0, 1)}</span>
      <div>
        <strong>{user.displayName}</strong>
        <small>
          {user.role === "researcher" ? "教研员" : "教师"} · {user.username}
        </small>
      </div>
      <button
        className="icon-btn"
        title="退出登录"
        aria-label="退出登录"
        onClick={() => void signOut()}
      >
        <LogOut />
      </button>
    </div>
  );
  return (
    <div className={`app-shell v3-shell remote-shell ${isHome ? "home-mode" : "workspace-mode"}`}>
      <aside id="app-sidebar" className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-glyph">同</span>
          <div>
            <strong>同迹 3.0</strong>
            <small>循证游戏观察 · 正式数据模式</small>
          </div>
          <button
            className="icon-btn mobile-close"
            onClick={() => setMenuOpen(false)}
            aria-label="关闭全部功能菜单"
          >
            <X />
          </button>
        </div>
        <div className="version-ribbon">
          <span>3.0</span> Supabase · 证据链可追溯
        </div>
        <nav className="main-nav" aria-label="全部功能">
          {nav.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-principle">
          <Sprout size={20} />
          <div>
            <strong>教师判断先行</strong>
            <span>观察 · 识别 · 应答 · 拓展</span>
          </div>
        </div>
        <div className="remote-live-chip">
          <Database /> Supabase 正式数据
        </div>
      </aside>
      {menuOpen && (
        <button
          className="sidebar-overlay"
          onClick={() => setMenuOpen(false)}
          aria-label="关闭全部功能菜单"
        />
      )}
      <div className="app-main">
        {isHome ? (
          <header className="home-toolbar">
            <button
              className="home-menu-button"
              onClick={() => setMenuOpen(true)}
              aria-label="打开全部功能菜单"
              aria-controls="app-sidebar"
              aria-expanded={menuOpen}
            >
              <Menu />
              <span>全部功能</span>
            </button>
            {userControl}
          </header>
        ) : (
          <header className="topbar">
            <button
              className="icon-btn menu-trigger"
              onClick={() => setMenuOpen(true)}
              aria-label="打开全部功能菜单"
              aria-controls="app-sidebar"
              aria-expanded={menuOpen}
            >
              <Menu />
            </button>
            <NavLink to="/" className="topbar-brand" aria-label="返回同迹主页">
              <span>同</span>
              <strong>同迹 3.0</strong>
            </NavLink>
            <div className="school-context">
              <span>{user.tenantName} · {workspaceLabel}</span>
              <strong>{currentPage}</strong>
            </div>
            {userControl}
          </header>
        )}
        <main className="content">
          <Routes>
            <Route path="/" element={<RemoteDashboardPage user={user} />} />
            <Route
              path="/classrooms"
              element={<RemoteClassroomPage user={user} />}
            />
            <Route path="/observations" element={<RemoteObservationPage />} />
            <Route path="/growth" element={<RemoteGrowthPage />} />
            <Route path="/reports" element={<RemoteReportsPage />} />
            <Route path="/curriculum" element={<RemoteCurriculumPage />} />
            <Route path="/knowledge" element={<RemoteKnowledgePage />} />
            <Route path="/exports" element={<RemoteExportsPage user={user} />} />
            <Route path="/research" element={<RemoteResearchPage user={user} />} />
            <Route
              path="/quality"
              element={
                user.role === "researcher" ? (
                  <RemoteQualityPage />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/accounts"
              element={
                user.role === "researcher" ? (
                  <RemoteAccountsPage currentUser={user} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <nav className="mobile-nav" aria-label="常用功能">
          {nav.slice(0, 5).map(([path, label, Icon]) => (
            <NavLink key={path} to={path}>
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

function RemoteGate() {
  const { error, loading, retry, user } = useRemoteAuth();
  if (loading)
    return (
      <div className="loading-screen">
        <span className="brand-glyph">同</span>
        <h1>正在验证同迹会话</h1>
        <p>连接账号权限、班级范围和知识库…</p>
        <span className="loading-line" />
      </div>
    );
  if (error)
    return (
      <div className="loading-screen service-error-screen" role="alert">
        <span className="brand-glyph">!</span>
        <h1>暂时无法连接同迹服务</h1>
        <p>{error}。这不是登录状态问题，请稍后重试。</p>
        <button className="btn btn-primary" onClick={() => void retry()}>
          重新连接
        </button>
      </div>
    );
  return user ? <RemoteShell /> : <LoginPage />;
}

export function ProductionApp() {
  return (
    <RemoteAuthProvider>
      <RemoteGate />
    </RemoteAuthProvider>
  );
}
