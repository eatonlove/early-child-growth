import { createRequire } from "node:module";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const require = createRequire(import.meta.url);
const WordExtractor = require("word-extractor") as new () => {
  extract(input: Buffer): Promise<{ getBody(): string; getTextboxes(options?: Record<string, boolean>): string }>;
};

const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_DOC = "application/msword";
const MIME_PDF = "application/pdf";

const observationDocumentFormats = new Map([
  [MIME_DOCX, { extension: "docx", mimeType: MIME_DOCX }],
  [MIME_DOC, { extension: "doc", mimeType: MIME_DOC }],
  [MIME_PDF, { extension: "pdf", mimeType: MIME_PDF }],
  ["image/jpeg", { extension: "jpg", mimeType: "image/jpeg" }],
  ["image/png", { extension: "png", mimeType: "image/png" }],
]);

export function documentStorageObjectPath(tenantId: string, classroomId: string, exportId: string) {
  return `${tenantId}/${classroomId}/exports/${exportId}/document.docx`;
}

export function observationDocumentFormat(fileName: string, suppliedMimeType: string) {
  const byMimeType = observationDocumentFormats.get(suppliedMimeType);
  if (byMimeType) return byMimeType;
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "docx") return { extension, mimeType: MIME_DOCX };
  if (extension === "doc") return { extension, mimeType: MIME_DOC };
  return null;
}

export async function extractDocumentText(buffer: Buffer, mimeType: string, fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop();
  if (mimeType === MIME_DOCX || extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return normalizeExtractedText(result.value);
  }
  if (mimeType === MIME_DOC || extension === "doc") {
    const extractor = new WordExtractor();
    const result = await extractor.extract(buffer);
    return normalizeExtractedText(`${result.getBody()}\n${result.getTextboxes({ includeHeadersAndFooters: false })}`);
  }
  if (mimeType === MIME_PDF || extension === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return normalizeExtractedText(result.text);
    } finally {
      await parser.destroy();
    }
  }
  if (mimeType.startsWith("image/")) return "";
  throw new Error("不支持的观察表格式");
}

function normalizeExtractedText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 50000);
}

const font = "Microsoft YaHei";
const heading = (text: string, level: typeof HeadingLevel.HEADING_1 | typeof HeadingLevel.HEADING_2 | typeof HeadingLevel.HEADING_3 = HeadingLevel.HEADING_1) => new Paragraph({
  heading: level,
  spacing: { before: level === HeadingLevel.HEADING_1 ? 260 : 160, after: 100 },
  children: [new TextRun({ text, bold: true, font, color: level === HeadingLevel.HEADING_1 ? "315C45" : "704A32" })],
});
const paragraph = (text: unknown, bold = false) => new Paragraph({
  spacing: { after: 100, line: 360 },
  children: [new TextRun({ text: String(text ?? "").trim() || "（待填写）", bold, font, size: 22 })],
});
const bulletParagraphs = (items: unknown) => (Array.isArray(items) ? items : [])
  .filter(Boolean)
  .map((item) => new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60, line: 340 },
    children: [new TextRun({ text: String(item), font, size: 21 })],
  }));
const label = (name: string, value: unknown) => new Paragraph({
  spacing: { after: 90 },
  children: [new TextRun({ text: `${name}：`, bold: true, font, size: 21 }), new TextRun({ text: String(value ?? "").trim() || "________________", font, size: 21 })],
});

function baseDocument(title: string, children: Array<Paragraph | Table>) {
  return new Document({
    styles: {
      default: { document: { run: { font, size: 22 }, paragraph: { spacing: { line: 360 } } } },
    },
    sections: [{
      properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 280 },
          children: [new TextRun({ text: title, bold: true, font, size: 36, color: "25392F" })],
        }),
        ...children,
      ],
    }],
  });
}

export async function generateBlankObservationTemplate() {
  const fields = [
    "观察教师：________________    班级：________________",
    "观察时间：________________    游戏场地：________________",
    "游戏主题：________________    组织阶段：计划 / 导入 / 过程 / 分享 / 评价",
    "幼儿姓名、人数及本次情境特征：",
    "________________________________________________________________________",
    "客观白描（请在白描中保留关键幼儿原话）：",
    "________________________________________________________________________",
    "________________________________________________________________________",
    "教师识别：",
    "________________________________________________________________________",
    "教师原始应答：",
    "________________________________________________________________________",
    "下一次观察重点：",
    "________________________________________________________________________",
  ];
  return Packer.toBuffer(baseDocument("同迹·游戏观察记录表", fields.map((item) => paragraph(item))));
}

export interface ObservationDocumentData {
  variant: "teacher" | "professional";
  schoolName: string;
  classroomName: string;
  observerNames: string[];
  observation: Record<string, any>;
  subjects: Array<{ displayName: string; role: string; contextualFeature?: string | null }>;
  evidence: Array<{ file_name?: string | null; evidence_type: string }>;
  analysis?: Record<string, any> | null;
  analyses?: Array<{ childId: string; childName: string; result: Record<string, any> }>;
}

function professionalAnalysisSections(analysis: Record<string, any>) {
  return [
    heading("AI观察：客观整理", HeadingLevel.HEADING_3),
    paragraph(analysis.objectiveSummary),
    ...bulletParagraphs((analysis.facts ?? []).map((item: any) => `${item.content}【证据：${item.evidenceIds?.join("、") || item.evidence || "教师原稿"}】`)),
    heading("AI识别：《指南》循证参照", HeadingLevel.HEADING_3),
    paragraph(analysis.currentExperience),
    ...bulletParagraphs((analysis.developmentReferences ?? []).map((item: any) => {
      const interpretation = (analysis.interpretations ?? []).find((entry: any) => entry.indicatorCode === item.indicatorCode);
      return `${item.domain}｜${item.indicatorCode}｜${item.title}｜${item.ageBand}｜${item.status}\n行为证据：${item.evidenceStatement}\n可能经验：${interpretation?.content || "待持续观察"}\n证据边界：${interpretation?.limitation || item.missingEvidence}`;
    })),
    heading("AI应答：教师可选择方案", HeadingLevel.HEADING_3),
    ...bulletParagraphs((analysis.responsePlans ?? []).map((plan: any) => `${plan.title}\n建议理由：${plan.rationale}\n活动：${plan.activitySupport?.activityName}；${(plan.activitySupport?.steps ?? []).join("→")}\n材料：${(plan.materialSupport?.materials ?? []).map((item: any) => `${item.name}（${item.quantity || "按需"}，${item.variable || "开放使用"}）`).join("、")}\n教师语言：${(plan.experienceSupport?.suggestedQuestions ?? []).join("；")}\n退出条件：${plan.experienceSupport?.withdrawalCondition}\n复察：${plan.observationCut}`)),
    heading("连续观察对比", HeadingLevel.HEADING_3),
    paragraph(analysis.historicalComparison?.caution),
    ...bulletParagraphs((analysis.historicalComparison?.changes ?? []).map((item: any) => `${item.dimension}：${item.content}`)),
    heading("拓展：游戏经验", HeadingLevel.HEADING_3),
    ...bulletParagraphs((analysis.gameExperience ?? []).map((item: any) => `${item.dimension}：${item.possibleExperience}`)),
    heading("拓展：五大领域经验", HeadingLevel.HEADING_3),
    ...bulletParagraphs((analysis.domainExperiences ?? []).map((item: any) => `${item.domain}：${item.possibleExperience}`)),
    heading("拓展：学习品质线索", HeadingLevel.HEADING_3),
    ...bulletParagraphs((analysis.learningDispositions ?? []).map((item: any) => `${item.dimension}：${item.possibleExperience}`)),
    heading("学习与游戏可能", HeadingLevel.HEADING_3),
    ...bulletParagraphs([...(analysis.learningPossibilities ?? []), ...(analysis.gamePossibilities ?? [])]),
    heading("观察切口与重点", HeadingLevel.HEADING_3),
    ...bulletParagraphs([...(analysis.observationCut ?? []), ...(analysis.observationFocus ?? [])]),
    heading("公开资料补充", HeadingLevel.HEADING_3),
    ...bulletParagraphs((analysis.externalSupportReferences ?? []).map((item: any) => `${item.title}（${item.source}）\n${item.appliedSuggestion}\n${item.url}`)),
  ];
}

export async function generateObservationDocument(input: ObservationDocumentData) {
  const { observation } = input;
  const subjectRows = [
    new TableRow({ children: ["幼儿", "角色", "本次情境特征"].map((text) => new TableCell({ children: [paragraph(text, true)] })) }),
    ...input.subjects.map((subject) => new TableRow({ children: [
      new TableCell({ children: [paragraph(subject.displayName)] }),
      new TableCell({ children: [paragraph(subject.role === "primary" ? "主要观察" : subject.role === "incidental" ? "偶发参与" : "共同参与")] }),
      new TableCell({ children: [paragraph(subject.contextualFeature || "未补充")] }),
    ] })),
  ];
  const children: Array<Paragraph | Table> = [
    label("园所", input.schoolName),
    label("班级", input.classroomName),
    label("观察教师", input.observerNames.join("、")),
    label("发生时间", new Date(observation.occurred_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })),
    label("游戏场地", observation.scene),
    label("游戏主题", observation.theme),
    label("游戏组织阶段", observation.organization_stage),
    heading("观察对象", HeadingLevel.HEADING_2),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: subjectRows,
      borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 }, insideHorizontal: { style: BorderStyle.SINGLE, size: 1 }, insideVertical: { style: BorderStyle.SINGLE, size: 1 } },
    }),
    heading("一、客观观察"),
    paragraph(observation.teacher_observation),
    heading("二、教师识别"),
    paragraph(observation.teacher_identification),
    heading("三、教师原始应答"),
    paragraph(observation.teacher_response?.strategy),
    label("下一次观察重点", observation.teacher_response?.nextObservationFocus),
    heading("四、证据目录"),
    ...bulletParagraphs(input.evidence.map((item) => `${item.evidence_type}：${item.file_name || "未命名证据"}`)),
  ];
  if (input.variant === "professional" && (input.analyses?.length || input.analysis)) {
    children.push(heading("五、教师终审后的专业分析"));
    if (input.analyses?.length) {
      input.analyses.forEach((item) => {
        children.push(heading(item.childName, HeadingLevel.HEADING_2), ...professionalAnalysisSections(item.result));
      });
    } else if (input.analysis) {
      children.push(...professionalAnalysisSections(input.analysis));
    }
  }
  children.push(paragraph("说明：本文档只包含教师已确认内容；AI建议不替代教师专业判断。"));
  return Packer.toBuffer(baseDocument(`同迹·游戏观察记录（${input.variant === "professional" ? "专业版" : "教师原稿版"}）`, children));
}

export interface CurriculumDocumentData {
  schoolName: string;
  classroomName: string;
  implementationPeriod: string;
  title: string;
  coreInquiryClue: string;
  content: Record<string, any>;
  cycles: Array<Record<string, any>>;
}

export async function generateCurriculumDocument(input: CurriculumDocumentData) {
  const content = input.content;
  const children: Array<Paragraph | Table> = [
    label("园所", input.schoolName), label("实施班级", input.classroomName),
    label("实施周期", input.implementationPeriod), label("核心探究线索", input.coreInquiryClue),
    heading("一、主题缘起与核心素养"),
    label("一个核心生发点", content.themeOrigin?.coreEmergencePoint),
    paragraph(content.themeOrigin?.sourceDescription),
    heading("与自然、生活、自我同生", HeadingLevel.HEADING_2),
    ...bulletParagraphs([
      ...(content.coreCompetencies?.与自然同生 ?? []).map((item: string) => `与自然同生：${item}`),
      ...(content.coreCompetencies?.与生活同生 ?? []).map((item: string) => `与生活同生：${item}`),
      ...(content.coreCompetencies?.与自我同生 ?? []).map((item: string) => `与自我同生：${item}`),
    ]),
    heading("预设方向与生成可能", HeadingLevel.HEADING_2),
    ...bulletParagraphs(content.generatedPossibilities?.presetDirections),
    paragraph(content.generatedPossibilities?.opennessNote),
    heading("二、四区七步N循环实施架构"),
    heading("教师支持策略与关键提问", HeadingLevel.HEADING_2),
    ...bulletParagraphs(content.implementationFramework?.teacherSupportAndQuestions),
    heading("幼儿可能的活动与表现", HeadingLevel.HEADING_2),
    ...bulletParagraphs(content.implementationFramework?.anticipatedChildActivities),
    heading("环境与材料支持", HeadingLevel.HEADING_2),
    ...bulletParagraphs(content.implementationFramework?.environmentAndMaterials),
    heading("三、主题具体活动网络"),
    ...bulletParagraphs((content.generatedPossibilities?.mindMap ?? []).map((item: any) => `${item.branch}：${(item.activities ?? []).join("；")}`)),
    heading("四、资源支持与家园共育"),
    ...bulletParagraphs([
      ...(content.resources?.environment ?? []).map((item: string) => `环境创设：${item}`),
      ...(content.resources?.materials ?? []).map((item: string) => `材料投放：${item}`),
      ...(content.resources?.familyPartnership ?? []).map((item: string) => `家园共育：${item}`),
      ...(content.resources?.sharedOutcomes ?? []).map((item: string) => `成果共建：${item}`),
    ]),
  ];
  input.cycles.forEach((cycle) => children.push(
    heading(`第${cycle.cycle_number}轮：${cycle.zone}`, HeadingLevel.HEADING_2),
    ...bulletParagraphs(Object.entries(cycle.seven_steps ?? {}).map(([key, value]) => `${key}：${String(value)}`)),
    paragraph(cycle.reflection || "本轮仍在推进中"),
  ));
  children.push(paragraph("说明：课程计划是可调整的地图，不是必须执行的固定活动清单。"));
  return Packer.toBuffer(baseDocument(input.title, children));
}

export const documentMimeTypes = {
  docx: MIME_DOCX,
  doc: MIME_DOC,
  pdf: MIME_PDF,
};
