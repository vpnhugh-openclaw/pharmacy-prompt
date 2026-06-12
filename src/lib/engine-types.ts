// Shared types used by engine + recommendation modules.
// Hoisted out of engine.ts to avoid circular imports.
export type PatientCtx = {
  age: number | null;
  sex: string | null;
  pregnancy_status: string | null;
  breastfeeding_status: string | null;
  allergies: string;
  medical_history: string;
  symptoms: string;
  counselling_goal: string;
  existing_supplements: string;
  pathology_notes: string;
  confirmed_medications: Array<{
    generic_name: string;
    brand_name?: string;
    drug_class?: string | null;
  }>;
};

export type PatientFactors = string[];
