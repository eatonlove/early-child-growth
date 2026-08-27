import { Pool } from "pg";
import { config } from "../src/config.js";

if (!config.isLocalLite) throw new Error("本地种子只允许在 RUNTIME_MODE=local-lite 下运行");

const pool = new Pool({ connectionString: config.LOCAL_DATABASE_URL });
const tenantId = "10000000-0000-4000-8000-000000000001";
const researcherId = "20000000-0000-4000-8000-000000000001";
const teacherId = "20000000-0000-4000-8000-000000000002";
const curriculumTemplateStructure = {
  metadata: ["主题名称", "实施班级", "实施周期", "核心探究线索"],
  originAndCompetencies: {
    coreEmergence: "一个核心生发点及来源描述",
    dimensions: ["与自然同生", "与生活同生", "与自我同生"],
    possibilities: ["预设方向", "思维导图", "留白与生成"],
  },
  implementation: {
    zones: ["起始区", "聚焦区", "探究区", "解决区/新起始区"],
    steps: ["发现真问题", "详细描述问题表现", "明确问题关键", "确定解决方向", "探索解决方法", "实施方案与过程", "解决当下问题并发现新问题"],
    cycleFields: ["教师支持策略与关键提问", "幼儿活动与表现", "环境与材料支持", "经验生成及新问题走向"],
  },
  resources: ["环境创设", "材料投放", "家园共育策略", "过程活动板块", "成果共建"],
};
const classrooms = [
  ["30000000-0000-4000-8000-000000000001", "小一班", "small"],
  ["30000000-0000-4000-8000-000000000002", "中四班", "middle"],
  ["30000000-0000-4000-8000-000000000003", "大二班", "large"],
] as const;

try {
  await pool.query(
    `insert into auth.users (id, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
     values
       ($1, 'research.admin@tongji-v3.local', crypt('LocalResearch123!', gen_salt('bf')), '{"application":"tongji_v3"}', '{}', now()),
       ($2, 'teacher.demo@tongji-v3.local', crypt('LocalTeacher123!', gen_salt('bf')), '{"application":"tongji_v3"}', '{}', now())
     on conflict (id) do update set banned_until = null`,
    [researcherId, teacherId],
  );
  await pool.query(
    `insert into tongji_v3.tenants (id, code, name, settings)
     values ($1, 'local-demo', '同迹本地验证幼儿园', '{"localDemo":true}')
     on conflict (id) do update set name = excluded.name`,
    [tenantId],
  );
  await pool.query(
    `insert into tongji_v3.profiles (user_id, tenant_id, username, display_name, role, status, created_by)
     values
       ($1, $3, 'research.admin', '本地教研员', 'researcher', 'active', $1),
       ($2, $3, 'teacher.demo', '本地教师', 'teacher', 'active', $1)
     on conflict (user_id) do update set status = 'active', disabled_at = null, disabled_reason = null`,
    [researcherId, teacherId, tenantId],
  );
  await pool.query(
    `insert into tongji_v3.curriculum_template_versions
       (tenant_id, code, name, version, description, structure, is_default, status, created_by)
     values ($1, 'TONGSHENG_1N', '“同生”课程·四区七步N循环', 1,
       '基于真实游戏证据生成课程地图，并在四区七步中持续记录N次探究循环。', $2, true, 'active', $3)
     on conflict (tenant_id, code, version) do update set
       structure = excluded.structure, is_default = true, status = 'active'`,
    [tenantId, curriculumTemplateStructure, researcherId],
  );
  for (const [id, name, grade] of classrooms) {
    await pool.query(
      `insert into tongji_v3.classrooms (id, tenant_id, name, grade, academic_year, semester, created_by)
       values ($1, $2, $3, $4, '2026-2027', '上学期', $5)
       on conflict (id) do update set status = 'active'`,
      [id, tenantId, name, grade, researcherId],
    );
    await pool.query(
      `insert into tongji_v3.classroom_teachers (classroom_id, user_id, tenant_id, assigned_by)
       values ($1, $2, $3, $4) on conflict (classroom_id, user_id) do nothing`,
      [id, teacherId, tenantId, researcherId],
    );
  }
  const children = [
    ["40000000-0000-4000-8000-000000000001", classrooms[0][0], "S001", "安安", "2023-05-01", ["沙水", "角色游戏"]],
    ["40000000-0000-4000-8000-000000000002", classrooms[0][0], "S002", "乐乐", "2023-03-01", ["建构", "运动"]],
    ["40000000-0000-4000-8000-000000000003", classrooms[1][0], "M001", "朵朵", "2022-01-01", ["自然探究", "绘画"]],
    ["40000000-0000-4000-8000-000000000004", classrooms[1][0], "M002", "Kiki", "2021-11-01", ["泡泡", "科学实验"]],
    ["40000000-0000-4000-8000-000000000005", classrooms[2][0], "L001", "晨晨", "2020-08-01", ["建构", "合作游戏"]],
    ["40000000-0000-4000-8000-000000000006", classrooms[2][0], "L002", "小宇", "2020-06-01", ["表演", "讲述"]],
  ] as const;
  for (const [id, classroomId, internalCode, displayName, birthMonth, interests] of children) {
    await pool.query(
      `insert into tongji_v3.children
         (id, tenant_id, classroom_id, internal_code, display_name, birth_month, enrolled_on, guardian_consent_status, interests, created_by)
       values ($1, $2, $3, $4, $5, $6, '2026-09-01', 'granted', $7, $8)
       on conflict (id) do update set status = 'active', interests = excluded.interests`,
      [id, tenantId, classroomId, internalCode, displayName, birthMonth, interests, researcherId],
    );
  }
  console.log("local demo accounts and classrooms seeded");
} finally {
  await pool.end();
}

for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    const response = await fetch(`${config.LOCAL_POSTGREST_URL}/`);
    if (response.ok) break;
  } catch {
    // PostgREST can take a moment to load its schema cache after migration.
  }
  if (attempt === 30) throw new Error("PostgREST did not become ready");
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
}

await import("./seed-knowledge.js");
