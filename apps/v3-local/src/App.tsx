import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, BarChart3, BookOpen, CalendarRange, ChevronDown, ClipboardCheck,
  Database, FileCheck2, FileText, Home, KeyRound, Library, Menu, Microscope,
  RefreshCcw, Search, ShieldCheck, Sprout, Users, X,
} from "lucide-react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "./router";
import type { Role } from "./domain/types";
import { useAppStore } from "./store/useAppStore";
import { Notice } from "./components/ui";
import {
  ChildrenPage, ClassroomPage, CurriculumPage, EvidenceWorkspacePage,
  GamePlansPage, GrowthPage, ReportsPage, TodayPage,
} from "./pages/TeacherPages";
import {
  AccountsPage, ExportApprovalPage, KnowledgePage, QualityReviewPage,
  ResearchActivityPage,
} from "./pages/AdminPages";

const roleLabels: Record<Role, string> = { teacher: "教师", research_admin: "教研管理员", principal_viewer: "园长查看" };

const teacherNav: Array<[string, string, LucideIcon]> = [
  ["/today", "今日工作台", Home], ["/children", "幼儿与班级", Users], ["/plans", "游戏计划", CalendarRange],
  ["/evidence", "观察·识别·应答", Activity], ["/growth", "个体成长", Sprout], ["/classroom", "班级分析", BarChart3],
  ["/reports", "周期报告", FileText], ["/curriculum", "课程建构", BookOpen], ["/knowledge", "知识与模板", Library],
];

const researchNav: Array<[string, string, LucideIcon]> = [
  ["/today", "治理工作台", Home], ["/classroom", "班级分析", BarChart3], ["/quality", "观察质量审核", ClipboardCheck],
  ["/exports", "导出审批", FileCheck2], ["/accounts", "账号管理", KeyRound], ["/research", "教研活动", Microscope],
  ["/curriculum", "课程建构", BookOpen], ["/knowledge", "知识与模板", Library],
];

const principalNav: Array<[string, string, LucideIcon]> = [
  ["/today", "园所总览", Home], ["/classroom", "班级分析", BarChart3], ["/reports", "周期报告", FileText],
  ["/curriculum", "课程建构", BookOpen], ["/exports", "导出记录", FileCheck2],
];

export function App() {
  const { loading, busy, role, setRole, notice, clearNotice, initialize, resetDemo, children } = useAppStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { void initialize(); }, [initialize]);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const nav = role === "teacher" ? teacherNav : role === "research_admin" ? researchNav : principalNav;
  const switchRole = (next: Role) => {
    setRole(next); setRoleOpen(false);
    navigate(next === "teacher" ? "/today" : next === "research_admin" ? "/quality" : "/today");
  };

  if (loading) return <div className="loading-screen"><span className="brand-glyph">童</span><h1>正在准备童迹 3.0</h1><p>载入证据包、教师原始判断与本地治理数据…</p><span className="loading-line" /></div>;

  return (
    <div className="app-shell v3-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-glyph">童</span>
          <div><strong>童迹 3.0</strong><small>循证游戏观察 · 本地完整演示</small></div>
          <button className="icon-btn mobile-close" onClick={() => setMenuOpen(false)} aria-label="关闭菜单"><X /></button>
        </div>
        <div className="version-ribbon"><span>3.0</span> 教师判断先行 · AI 对照增强</div>
        <nav className="main-nav">{nav.map(([path, label, Icon]) => <NavLink key={path} to={path} className={({ isActive }) => isActive ? "active" : ""}><Icon size={19} /><span>{label}</span></NavLink>)}</nav>
        <div className="sidebar-principle"><Sprout size={20} /><div><strong>证据先于结论</strong><span>观察 · 识别 · 应答 · 再观察</span></div></div>
        <div className="local-chip"><Database size={14} /> 模拟 AI · 数据仅存本机</div>
      </aside>
      {menuOpen && <button className="sidebar-overlay" onClick={() => setMenuOpen(false)} aria-label="关闭菜单遮罩" />}

      <div className="app-main">
        <header className="topbar">
          <button className="icon-btn menu-trigger" onClick={() => setMenuOpen(true)} aria-label="打开菜单"><Menu /></button>
          <div className="school-context"><span>向阳实验幼儿园</span><strong>大一班 · 2026年秋季学期</strong></div>
          <div className="topbar-tools">
            <button className="search-box"><Search size={17} /><span>搜索证据包、幼儿或课程</span></button>
            <button className="icon-btn reset-top" disabled={busy} onClick={() => void resetDemo()} title="恢复演示数据"><RefreshCcw size={17} /></button>
            <div className="role-switcher">
              <button className="role-button" onClick={() => setRoleOpen(!roleOpen)}><span className="role-avatar">{roleLabels[role].slice(0, 1)}</span><span><small>演示角色</small><strong>{roleLabels[role]}</strong></span><ChevronDown size={16} /></button>
              {roleOpen && <div className="role-menu">{(["teacher", "research_admin", "principal_viewer"] as Role[]).map((item) => <button key={item} className={role === item ? "selected" : ""} onClick={() => switchRole(item)}><ShieldCheck /><span><strong>{roleLabels[item]}</strong><small>{item === "teacher" ? "记录与专业判断" : item === "research_admin" ? "审核、治理与教研" : "查看园所成效"}</small></span></button>)}</div>}
            </div>
          </div>
        </header>

        <main className="content">
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/children" element={<ChildrenPage />} />
            <Route path="/plans" element={<GamePlansPage />} />
            <Route path="/evidence" element={<EvidenceWorkspacePage />} />
            <Route path="/growth" element={<GrowthPage />} />
            <Route path="/classroom" element={<ClassroomPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/curriculum" element={<CurriculumPage />} />
            <Route path="/quality" element={<QualityReviewPage />} />
            <Route path="/exports" element={<ExportApprovalPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/research" element={<ResearchActivityPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </main>
        <nav className="mobile-nav">{nav.slice(0, 5).map(([path, label, Icon]) => <NavLink key={path} to={path}><Icon size={19} /><span>{label}</span></NavLink>)}</nav>
      </div>
      {notice && <Notice type={notice.type} message={notice.message} onClose={clearNotice} />}
      {busy && <div className="global-busy"><span />正在处理本地演示数据…</div>}
      {children.length === 0 && <div className="fatal-banner"><ClipboardCheck />未检测到演示数据，请使用右上角重置按钮恢复。</div>}
    </div>
  );
}
