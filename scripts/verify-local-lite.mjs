const baseUrl = process.env.TONGJI_LOCAL_URL ?? "http://127.0.0.1:5300";

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  return { response, body };
}

function sessionCookie(response) {
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  const values = setCookies
    .flatMap((item) => item.split(/,(?=\s*[^;,]+=)/))
    .map((item) => item.split(";", 1)[0])
    .filter((item) => item.startsWith("tj_access=") || item.startsWith("tj_refresh="));
  if (values.length < 2) throw new Error("登录响应未返回完整本地会话Cookie");
  return values.join("; ");
}

const health = await jsonRequest("/api/healthz");
if (health.body.runtime !== "local-lite" || !["simulated", "qianwen"].includes(health.body.ai.mode)) {
  throw new Error(`运行模式不符合预期: ${JSON.stringify(health.body)}`);
}
if (health.body.ai.mode === "qianwen" && health.body.ai.fallbackEnabled) throw new Error("真实AI本地验证不得静默退回模拟结果");

const researcherLogin = await jsonRequest("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: baseUrl },
  body: JSON.stringify({ username: "research.admin", password: "LocalResearch123!" }),
});
const researcherCookie = sessionCookie(researcherLogin.response);
const researcherHeaders = { Cookie: researcherCookie };
const me = await jsonRequest("/api/me", { headers: researcherHeaders });
if (me.body.user.role !== "researcher") throw new Error("教研员会话角色错误");

const classrooms = await jsonRequest("/api/classrooms", { headers: researcherHeaders });
if (!Array.isArray(classrooms.body.items) || classrooms.body.items.length < 3) throw new Error("班级种子数据不完整");
const children = await jsonRequest("/api/children", { headers: researcherHeaders });
if (!Array.isArray(children.body.items) || children.body.items.length < 6) throw new Error("幼儿种子数据不完整");
const knowledge = await jsonRequest("/api/knowledge?grade=middle", { headers: researcherHeaders });
if (!Array.isArray(knowledge.body.items) || knowledge.body.items.length === 0) throw new Error("年龄段知识库未初始化");
const curriculumTemplates = await jsonRequest("/api/curriculum-templates", { headers: researcherHeaders });
if (!Array.isArray(curriculumTemplates.body.items) || curriculumTemplates.body.items.length === 0) throw new Error("默认课程模板未初始化");
const curriculumResources = await jsonRequest("/api/curriculum-resource-packages", { headers: researcherHeaders });
if (!Array.isArray(curriculumResources.body.items)) throw new Error("游戏课程资源包接口未就绪");

const teacherLogin = await jsonRequest("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: baseUrl },
  body: JSON.stringify({ username: "teacher.demo", password: "LocalTeacher123!" }),
});
const teacherCookie = sessionCookie(teacherLogin.response);
const teacherClasses = await jsonRequest("/api/classrooms", { headers: { Cookie: teacherCookie } });
if (!Array.isArray(teacherClasses.body.items) || teacherClasses.body.items.length !== 3) throw new Error("教师班级RLS访问结果错误");

console.log(`local-lite smoke passed: ${health.body.ai.mode} AI, auth, RLS, classes, children, knowledge, curriculum template, curriculum resources`);
