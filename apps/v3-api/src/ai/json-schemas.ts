const string = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
const stringArray = (maxItems: number, maxLength = 2000) => ({
  type: "array",
  items: string(maxLength),
  maxItems,
});
const confidence = { type: "number", minimum: 0, maximum: 1 };
const evidenceIds = stringArray(8, 100);
const responsePlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "rationale", "targetExperience", "activitySupport", "materialSupport", "experienceSupport", "observationCut", "observationFocus", "adjustmentCondition", "evidenceIds"],
  properties: {
    title: string(160),
    rationale: string(2000),
    targetExperience: { ...stringArray(6), minItems: 1 },
    activitySupport: {
      type: "object", additionalProperties: false,
      required: ["activityName", "timing", "objective", "steps", "teacherRole", "suggestedDuration"],
      properties: {
        activityName: string(160), timing: string(500), objective: string(1000),
        steps: { ...stringArray(8), minItems: 2 }, teacherRole: string(1000), suggestedDuration: string(120),
      },
    },
    materialSupport: {
      type: "object", additionalProperties: false,
      required: ["materials", "placement", "purpose", "safetyNotes"],
      properties: {
        materials: {
          type: "array", minItems: 1, maxItems: 12,
          items: {
            type: "object", additionalProperties: false,
            required: ["name", "quantity", "variable"],
            properties: { name: string(120), quantity: { type: "string", maxLength: 120 }, variable: { type: "string", maxLength: 300 } },
          },
        },
        placement: string(600), purpose: string(1000), safetyNotes: stringArray(6),
      },
    },
    experienceSupport: {
      type: "object", additionalProperties: false,
      required: ["suggestedQuestions", "participationMode", "demonstration", "withdrawalCondition"],
      properties: {
        suggestedQuestions: { ...stringArray(8), minItems: 1 }, participationMode: string(1000),
        demonstration: { type: "string", maxLength: 1000 }, withdrawalCondition: string(1000),
      },
    },
    observationCut: string(1000),
    observationFocus: { ...stringArray(6), minItems: 2 },
    adjustmentCondition: string(1000),
    evidenceIds,
  },
};

export const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "objectiveSummary", "facts", "interpretations", "hypotheses", "teacherComparison",
    "currentExperience", "interestsAndStrengths", "evidenceGaps", "developmentReferences",
    "responseSuggestions", "nextObservation", "gameExperience", "domainExperiences",
    "learningDispositions", "learningPossibilities", "gamePossibilities", "responsePlans",
    "observationCut", "observationFocus", "historicalComparison", "evidenceSufficiency", "warnings",
  ],
  properties: {
    objectiveSummary: string(4000),
    facts: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["content", "evidence", "evidenceIds", "confidence"],
        properties: {
          content: string(2000),
          evidence: string(300),
          evidenceIds: stringArray(5, 100),
          confidence,
        },
      },
    },
    interpretations: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["content", "indicatorCode", "evidenceIds", "limitation", "confidence"],
        properties: {
          content: string(2000),
          indicatorCode: string(100),
          evidenceIds: stringArray(5, 100),
          limitation: string(1000),
          confidence,
        },
      },
    },
    hypotheses: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["content", "nextObservation", "confidence"],
        properties: {
          content: string(2000),
          nextObservation: string(1000),
          confidence,
        },
      },
    },
    teacherComparison: {
      type: "object",
      additionalProperties: false,
      required: ["teacherIdentification", "teacherResponse", "aiAddition"],
      properties: {
        teacherIdentification: { type: "string", maxLength: 6000 },
        teacherResponse: {
          type: "object",
          additionalProperties: false,
          required: ["category", "strategy", "nextObservationFocus"],
          properties: {
            category: { type: "string", maxLength: 80 },
            strategy: { type: "string", maxLength: 2000 },
            nextObservationFocus: { type: "string", maxLength: 1000 },
          },
        },
        aiAddition: string(2000),
      },
    },
    currentExperience: string(3000),
    interestsAndStrengths: stringArray(8),
    evidenceGaps: { ...stringArray(8), minItems: 1 },
    developmentReferences: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["indicatorCode", "title", "domain", "ageBand", "status", "evidenceStatement", "missingEvidence"],
        properties: {
          indicatorCode: string(100),
          title: string(300),
          domain: string(80),
          ageBand: string(80),
          status: { type: "string", enum: ["线索", "部分证据", "较充分证据"] },
          evidenceStatement: string(1500),
          missingEvidence: string(1000),
        },
      },
    },
    responseSuggestions: {
      type: "object",
      additionalProperties: false,
      required: ["experience", "material", "activity"],
      properties: {
        experience: { ...stringArray(5), minItems: 1 },
        material: { ...stringArray(5), minItems: 1 },
        activity: { ...stringArray(5), minItems: 1 },
      },
    },
    nextObservation: { ...stringArray(6), minItems: 1 },
    gameExperience: {
      type: "array", minItems: 1, maxItems: 7,
      items: {
        type: "object", additionalProperties: false,
        required: ["dimension", "evidence", "evidenceIds", "possibleExperience", "limitation"],
        properties: {
          dimension: { type: "string", enum: ["计划与意图", "材料使用", "角色与情节", "问题解决", "合作协商", "规则与自我调节", "表达与回顾"] },
          evidence: string(1500), evidenceIds, possibleExperience: string(1500), limitation: string(1000),
        },
      },
    },
    domainExperiences: {
      type: "array", minItems: 5, maxItems: 5,
      items: {
        type: "object", additionalProperties: false,
        required: ["domain", "evidence", "evidenceIds", "possibleExperience", "indicatorCodes", "missingEvidence", "noJudgment"],
        properties: {
          domain: { type: "string", enum: ["健康", "语言", "社会", "科学", "艺术"] },
          evidence: { type: "string", maxLength: 1500 }, evidenceIds, possibleExperience: string(1500),
          indicatorCodes: stringArray(8, 100), missingEvidence: string(1000), noJudgment: { type: "boolean" },
        },
      },
    },
    learningDispositions: {
      type: "array", maxItems: 6,
      items: {
        type: "object", additionalProperties: false,
        required: ["dimension", "evidence", "evidenceIds", "possibleExperience", "confidence"],
        properties: {
          dimension: { type: "string", enum: ["好奇与探究", "主动性", "专注与坚持", "想象与创造", "合作", "反思与调整"] },
          evidence: string(1500), evidenceIds, possibleExperience: string(1500), confidence,
        },
      },
    },
    learningPossibilities: { ...stringArray(6), minItems: 1 },
    gamePossibilities: { ...stringArray(6), minItems: 1 },
    responsePlans: { type: "array", minItems: 3, maxItems: 3, items: responsePlanJsonSchema },
    observationCut: { ...stringArray(2), minItems: 1 },
    observationFocus: { ...stringArray(5), minItems: 2 },
    historicalComparison: {
      type: "object",
      additionalProperties: false,
      required: ["evidenceCount", "timePointCount", "changes", "stablePatterns", "caution"],
      properties: {
        evidenceCount: { type: "integer", minimum: 0, maximum: 20 },
        timePointCount: { type: "integer", minimum: 0, maximum: 20 },
        changes: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["dimension", "content", "previousEvidenceIds", "currentEvidenceIds", "confidence"],
            properties: {
              dimension: string(120),
              content: string(2000),
              previousEvidenceIds: { ...stringArray(8, 100), minItems: 1 },
              currentEvidenceIds: { ...stringArray(5, 100), minItems: 1 },
              confidence,
            },
          },
        },
        stablePatterns: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["content", "evidenceIds", "confidence"],
            properties: {
              content: string(2000),
              evidenceIds: { ...stringArray(10, 100), minItems: 2 },
              confidence,
            },
          },
        },
        caution: string(1000),
      },
    },
    evidenceSufficiency: { type: "string", enum: ["有限", "初步充分"] },
    warnings: { ...stringArray(8), minItems: 1 },
  },
} as const;

export const observationDocumentExtractionJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["observerName", "occurredAtText", "scene", "theme", "organizationStage", "subjects", "unlistedParticipantCount", "groupContext", "objectiveObservation", "teacherIdentification", "teacherResponseDraft", "nextObservationFocus", "fieldConfidence", "warnings"],
  properties: {
    observerName: { type: "string", maxLength: 80 }, occurredAtText: { type: "string", maxLength: 120 },
    scene: { type: "string", maxLength: 120 }, theme: { type: "string", maxLength: 160 },
    organizationStage: { type: "string", enum: ["plan", "introduction", "process", "sharing", "evaluation"] },
    subjects: {
      type: "array", maxItems: 30,
      items: {
        type: "object", additionalProperties: false, required: ["displayName", "contextualFeature", "role"],
        properties: { displayName: string(80), contextualFeature: { type: "string", maxLength: 500 }, role: { type: "string", enum: ["primary", "participant", "incidental"] } },
      },
    },
    unlistedParticipantCount: { type: "integer", minimum: 0, maximum: 99 },
    groupContext: { type: "string", maxLength: 2000 }, objectiveObservation: { type: "string", maxLength: 12000 },
    teacherIdentification: { type: "string", maxLength: 6000 }, teacherResponseDraft: { type: "string", maxLength: 4000 },
    nextObservationFocus: { type: "string", maxLength: 2000 },
    fieldConfidence: { type: "object", additionalProperties: { type: "number", minimum: 0, maximum: 1 } },
    warnings: stringArray(12),
  },
} as const;

const socialNatureSelfSchema = {
  type: "object", additionalProperties: false, required: ["社会", "自然", "自我"],
  properties: { 社会: stringArray(5), 自然: stringArray(5), 自我: stringArray(5) },
};

const curriculumActivityOptionJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["title", "valuePoint", "coreQuestion", "socialNatureSelf", "developmentLinks", "mainActivities", "materials", "teacherSupport", "observationFocus", "riskNote"],
  properties: {
    title: string(160), valuePoint: string(1200), coreQuestion: string(500), socialNatureSelf: socialNatureSelfSchema,
    developmentLinks: { ...stringArray(8), minItems: 1 }, mainActivities: { ...stringArray(8), minItems: 2 },
    materials: { ...stringArray(10), minItems: 1 }, teacherSupport: { ...stringArray(8), minItems: 1 },
    observationFocus: { ...stringArray(6), minItems: 1 }, riskNote: string(1000),
  },
};

export const curriculumActivityOptionsJsonSchema = {
  type: "object", additionalProperties: false, required: ["options"],
  properties: { options: { type: "array", minItems: 4, maxItems: 4, items: curriculumActivityOptionJsonSchema } },
} as const;

export const curriculumPlanContentJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["themeOrigin", "coreCompetencies", "generatedPossibilities", "implementationFramework", "resources", "adjustmentBasis"],
  properties: {
    themeOrigin: {
      type: "object", additionalProperties: false, required: ["coreEmergencePoint", "sourceDescription", "evidenceReferences"],
      properties: { coreEmergencePoint: string(2000), sourceDescription: string(3000), evidenceReferences: { type: "array", minItems: 1, maxItems: 100, items: { type: "string", format: "uuid" } } },
    },
    coreCompetencies: {
      type: "object", additionalProperties: false, required: ["与自然同生", "与生活同生", "与自我同生", "qualities"],
      properties: {
        与自然同生: stringArray(8), 与生活同生: stringArray(8), 与自我同生: stringArray(8),
        qualities: { type: "object", additionalProperties: false, required: ["慧创生", "懂生活", "悦生长"], properties: { 慧创生: stringArray(6), 懂生活: stringArray(6), 悦生长: stringArray(6) } },
      },
    },
    generatedPossibilities: {
      type: "object", additionalProperties: false, required: ["presetDirections", "mindMap", "opennessNote"],
      properties: {
        presetDirections: { ...stringArray(10), minItems: 1 },
        mindMap: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["branch", "activities"], properties: { branch: string(2000), activities: { ...stringArray(10), minItems: 1 } } } },
        opennessNote: string(1500),
      },
    },
    implementationFramework: {
      type: "object", additionalProperties: false, required: ["teacherSupportAndQuestions", "anticipatedChildActivities", "environmentAndMaterials", "experienceAndNewDirections"],
      properties: {
        teacherSupportAndQuestions: { ...stringArray(12), minItems: 1 }, anticipatedChildActivities: { ...stringArray(12), minItems: 1 },
        environmentAndMaterials: { ...stringArray(12), minItems: 1 }, experienceAndNewDirections: { ...stringArray(12), minItems: 1 },
      },
    },
    resources: {
      type: "object", additionalProperties: false, required: ["environment", "materials", "familyPartnership", "processActivities", "sharedOutcomes"],
      properties: { environment: stringArray(10), materials: stringArray(12), familyPartnership: stringArray(10), processActivities: stringArray(10), sharedOutcomes: stringArray(10) },
    },
    adjustmentBasis: { ...stringArray(8), minItems: 1 },
  },
} as const;

export const interestClusterJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["clusters"],
  properties: {
    clusters: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "aliases", "observationIds", "rationale"],
        properties: {
          label: string(120),
          aliases: stringArray(12, 120),
          observationIds: { type: "array", minItems: 1, maxItems: 100, items: { type: "string", format: "uuid" } },
          rationale: string(1000),
        },
      },
    },
  },
} as const;

export const reportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "evidenceBoundary", "observationCoverage", "interests", "evidencedGrowth", "teacherSupport", "pendingQuestions", "nextPlan", "familySuggestions", "audience"],
  properties: {
    title: string(200),
    evidenceBoundary: string(1000),
    observationCoverage: string(1000),
    interests: stringArray(8),
    evidencedGrowth: { ...stringArray(8), minItems: 1 },
    teacherSupport: stringArray(8),
    pendingQuestions: stringArray(8),
    nextPlan: stringArray(8),
    familySuggestions: stringArray(6),
    audience: { type: "string", enum: ["teacher", "guardian"] },
  },
} as const;

export const classroomReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "evidenceBoundary", "observationCoverage", "observationCount", "timePointCount",
    "observedChildCount", "totalChildCount", "sceneCoverage", "commonInterests", "recurringQuestions",
    "domainEvidence", "supportFollowUpRate", "nextSuggestions", "curriculumClues", "audience",
  ],
  properties: {
    title: string(200),
    evidenceBoundary: string(1000),
    observationCoverage: string(1000),
    observationCount: { type: "integer", minimum: 0 },
    timePointCount: { type: "integer", minimum: 0 },
    observedChildCount: { type: "integer", minimum: 0 },
    totalChildCount: { type: "integer", minimum: 0 },
    sceneCoverage: stringArray(30, 120),
    commonInterests: stringArray(8),
    recurringQuestions: stringArray(8),
    domainEvidence: {
      type: "object",
      additionalProperties: false,
      required: ["健康", "语言", "社会", "科学", "艺术"],
      properties: Object.fromEntries(["健康", "语言", "社会", "科学", "艺术"].map((domain) => [domain, { type: "integer", minimum: 0 }])),
    },
    supportFollowUpRate: { type: "integer", minimum: 0, maximum: 100 },
    nextSuggestions: { ...stringArray(8), minItems: 1 },
    curriculumClues: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "theme", "status"],
        properties: {
          id: { type: "string", format: "uuid" },
          title: string(200),
          theme: string(160),
          status: string(80),
        },
      },
    },
    audience: { type: "string", enum: ["classroom"] },
  },
} as const;

export const curriculumJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "origin", "inquiryQuestions", "existingExperience", "keyExperiences", "materialsAndEnvironment", "possiblePaths", "observationFocus", "familyAndCommunity", "adjustmentBasis"],
  properties: {
    title: string(160),
    origin: string(2000),
    inquiryQuestions: { ...stringArray(8), minItems: 1 },
    existingExperience: { ...stringArray(8), minItems: 1 },
    keyExperiences: { ...stringArray(8), minItems: 1 },
    materialsAndEnvironment: { ...stringArray(8), minItems: 1 },
    possiblePaths: { ...stringArray(8), minItems: 1 },
    observationFocus: { ...stringArray(8), minItems: 1 },
    familyAndCommunity: stringArray(6),
    adjustmentBasis: { ...stringArray(6), minItems: 1 },
  },
} as const;
