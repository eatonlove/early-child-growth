const string = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
const stringArray = (maxItems: number, maxLength = 2000) => ({
  type: "array",
  items: string(maxLength),
  maxItems,
});
const confidence = { type: "number", minimum: 0, maximum: 1 };

export const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "objectiveSummary", "facts", "interpretations", "hypotheses", "teacherComparison",
    "currentExperience", "interestsAndStrengths", "evidenceGaps", "developmentReferences",
    "responseSuggestions", "nextObservation", "evidenceSufficiency", "warnings",
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
    evidenceSufficiency: { type: "string", enum: ["有限", "初步充分"] },
    warnings: { ...stringArray(8), minItems: 1 },
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
