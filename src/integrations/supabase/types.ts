export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      ingestion_jobs: {
        Row: {
          bucket: string;
          chunks_inserted: number;
          created_at: string;
          job_id: string;
          last_error: string | null;
          shard_done: number;
          shard_prefix: string;
          shard_total: number;
          source_label: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          bucket: string;
          chunks_inserted?: number;
          created_at?: string;
          job_id?: string;
          last_error?: string | null;
          shard_done?: number;
          shard_prefix: string;
          shard_total?: number;
          source_label: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          bucket?: string;
          chunks_inserted?: number;
          created_at?: string;
          job_id?: string;
          last_error?: string | null;
          shard_done?: number;
          shard_prefix?: string;
          shard_total?: number;
          source_label?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      kb_chunks: {
        Row: {
          char_count: number | null;
          chunk_id: string;
          chunk_index: number | null;
          created_at: string;
          cross_source_tags: string[] | null;
          id: string;
          page_id: string | null;
          page_short_id: string | null;
          page_type: string | null;
          retrieval_hints: string[] | null;
          section_heading: string | null;
          section_level: number | null;
          source: string;
          source_name: string | null;
          source_tier: number;
          source_url: string | null;
          text: string;
          title: string | null;
          token_estimate: number | null;
          topic_area: string | null;
          topic_code: string | null;
          tsv: unknown;
        };
        Insert: {
          char_count?: number | null;
          chunk_id: string;
          chunk_index?: number | null;
          created_at?: string;
          cross_source_tags?: string[] | null;
          id?: string;
          page_id?: string | null;
          page_short_id?: string | null;
          page_type?: string | null;
          retrieval_hints?: string[] | null;
          section_heading?: string | null;
          section_level?: number | null;
          source: string;
          source_name?: string | null;
          source_tier?: number;
          source_url?: string | null;
          text: string;
          title?: string | null;
          token_estimate?: number | null;
          topic_area?: string | null;
          topic_code?: string | null;
          tsv?: unknown;
        };
        Update: {
          char_count?: number | null;
          chunk_id?: string;
          chunk_index?: number | null;
          created_at?: string;
          cross_source_tags?: string[] | null;
          id?: string;
          page_id?: string | null;
          page_short_id?: string | null;
          page_type?: string | null;
          retrieval_hints?: string[] | null;
          section_heading?: string | null;
          section_level?: number | null;
          source?: string;
          source_name?: string | null;
          source_tier?: number;
          source_url?: string | null;
          text?: string;
          title?: string | null;
          token_estimate?: number | null;
          topic_area?: string | null;
          topic_code?: string | null;
          tsv?: unknown;
        };
        Relationships: [];
      };
      lookup_indexes: {
        Row: {
          chunk_id: string;
          concept_key: string;
          concept_type: string;
          created_at: string;
          id: string;
          weight: number;
        };
        Insert: {
          chunk_id: string;
          concept_key: string;
          concept_type: string;
          created_at?: string;
          id?: string;
          weight?: number;
        };
        Update: {
          chunk_id?: string;
          concept_key?: string;
          concept_type?: string;
          created_at?: string;
          id?: string;
          weight?: number;
        };
        Relationships: [];
      };
      medication_dictionary: {
        Row: {
          aliases: string[] | null;
          atc_hint: string | null;
          brand_names: string[] | null;
          created_at: string;
          drug_class: string | null;
          generic_name: string;
          id: string;
        };
        Insert: {
          aliases?: string[] | null;
          atc_hint?: string | null;
          brand_names?: string[] | null;
          created_at?: string;
          drug_class?: string | null;
          generic_name: string;
          id?: string;
        };
        Update: {
          aliases?: string[] | null;
          atc_hint?: string | null;
          brand_names?: string[] | null;
          created_at?: string;
          drug_class?: string | null;
          generic_name?: string;
          id?: string;
        };
        Relationships: [];
      };
      patient_cases: {
        Row: {
          age: number | null;
          allergies: string | null;
          breastfeeding_status: string | null;
          case_id: string;
          case_label: string | null;
          confirmed_medications: Json | null;
          counselling_goal: string | null;
          created_at: string;
          detected_drug_classes: Json | null;
          detected_patient_factors: Json | null;
          existing_supplements: string | null;
          medical_history: string | null;
          medication_text: string | null;
          parsed_medications: Json | null;
          pathology_notes: string | null;
          pharmacist_notes: string | null;
          pregnancy_status: string | null;
          sex: string | null;
          symptoms: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          age?: number | null;
          allergies?: string | null;
          breastfeeding_status?: string | null;
          case_id?: string;
          case_label?: string | null;
          confirmed_medications?: Json | null;
          counselling_goal?: string | null;
          created_at?: string;
          detected_drug_classes?: Json | null;
          detected_patient_factors?: Json | null;
          existing_supplements?: string | null;
          medical_history?: string | null;
          medication_text?: string | null;
          parsed_medications?: Json | null;
          pathology_notes?: string | null;
          pharmacist_notes?: string | null;
          pregnancy_status?: string | null;
          sex?: string | null;
          symptoms?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          age?: number | null;
          allergies?: string | null;
          breastfeeding_status?: string | null;
          case_id?: string;
          case_label?: string | null;
          confirmed_medications?: Json | null;
          counselling_goal?: string | null;
          created_at?: string;
          detected_drug_classes?: Json | null;
          detected_patient_factors?: Json | null;
          existing_supplements?: string | null;
          medical_history?: string | null;
          medication_text?: string | null;
          parsed_medications?: Json | null;
          pathology_notes?: string | null;
          pharmacist_notes?: string | null;
          pregnancy_status?: string | null;
          sex?: string | null;
          symptoms?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      pharmacist_feedback: {
        Row: {
          case_id: string;
          created_at: string;
          feedback_id: string;
          notes: string | null;
          recommendation_id: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          case_id: string;
          created_at?: string;
          feedback_id?: string;
          notes?: string | null;
          recommendation_id?: string | null;
          status: string;
          user_id: string;
        };
        Update: {
          case_id?: string;
          created_at?: string;
          feedback_id?: string;
          notes?: string | null;
          recommendation_id?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pharmacist_feedback_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "patient_cases";
            referencedColumns: ["case_id"];
          },
          {
            foreignKeyName: "pharmacist_feedback_recommendation_id_fkey";
            columns: ["recommendation_id"];
            isOneToOne: false;
            referencedRelation: "recommendations";
            referencedColumns: ["recommendation_id"];
          },
        ];
      };
      products: {
        Row: {
          active_ingredients: string[] | null;
          avoid_if_tags: string[] | null;
          brand: string | null;
          category: string | null;
          cautions: string[] | null;
          clinical_use_tags: string[] | null;
          counselling_flags: string[] | null;
          created_at: string;
          indications: string[] | null;
          medicine_interaction_flags: string[] | null;
          name: string;
          notes: string | null;
          pack_sizes: string[] | null;
          product_id: string;
          reviewed: boolean;
          schedule: string | null;
          source_url: string | null;
          updated_at: string;
        };
        Insert: {
          active_ingredients?: string[] | null;
          avoid_if_tags?: string[] | null;
          brand?: string | null;
          category?: string | null;
          cautions?: string[] | null;
          clinical_use_tags?: string[] | null;
          counselling_flags?: string[] | null;
          created_at?: string;
          indications?: string[] | null;
          medicine_interaction_flags?: string[] | null;
          name: string;
          notes?: string | null;
          pack_sizes?: string[] | null;
          product_id?: string;
          reviewed?: boolean;
          schedule?: string | null;
          source_url?: string | null;
          updated_at?: string;
        };
        Update: {
          active_ingredients?: string[] | null;
          avoid_if_tags?: string[] | null;
          brand?: string | null;
          category?: string | null;
          cautions?: string[] | null;
          clinical_use_tags?: string[] | null;
          counselling_flags?: string[] | null;
          created_at?: string;
          indications?: string[] | null;
          medicine_interaction_flags?: string[] | null;
          name?: string;
          notes?: string | null;
          pack_sizes?: string[] | null;
          product_id?: string;
          reviewed?: boolean;
          schedule?: string | null;
          source_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      recommendations: {
        Row: {
          advice: string | null;
          ai_reviewer_notes: Json | null;
          alternatives: Json | null;
          brand: string | null;
          case_id: string;
          confidence: string;
          confidence_score: number | null;
          created_at: string;
          deferred: boolean;
          feedback_status: string | null;
          hidden: boolean;
          interaction_notes: Json | null;
          matched_factors: Json | null;
          matched_medicines: Json | null;
          matched_patient_factors: Json | null;
          matched_product_tags: Json | null;
          mechanism: string | null;
          onset: string | null;
          pharmacist_checks: Json | null;
          product_id: string | null;
          product_name: string | null;
          rank: number;
          recommendation_id: string;
          recommendation_type: string;
          review_status: string | null;
          safety_cautions: Json | null;
          safety_net: string | null;
          score: number;
          sense_check_status: string | null;
          severity_tier: string | null;
          source_references: Json | null;
          talking_points: Json | null;
          title: string;
          user_id: string;
          why_triggered: string | null;
        };
        Insert: {
          advice?: string | null;
          ai_reviewer_notes?: Json | null;
          alternatives?: Json | null;
          brand?: string | null;
          case_id: string;
          confidence?: string;
          confidence_score?: number | null;
          created_at?: string;
          deferred?: boolean;
          feedback_status?: string | null;
          hidden?: boolean;
          interaction_notes?: Json | null;
          matched_factors?: Json | null;
          matched_medicines?: Json | null;
          matched_patient_factors?: Json | null;
          matched_product_tags?: Json | null;
          mechanism?: string | null;
          onset?: string | null;
          pharmacist_checks?: Json | null;
          product_id?: string | null;
          product_name?: string | null;
          rank?: number;
          recommendation_id?: string;
          recommendation_type: string;
          review_status?: string | null;
          safety_cautions?: Json | null;
          safety_net?: string | null;
          score?: number;
          sense_check_status?: string | null;
          severity_tier?: string | null;
          source_references?: Json | null;
          talking_points?: Json | null;
          title: string;
          user_id: string;
          why_triggered?: string | null;
        };
        Update: {
          advice?: string | null;
          ai_reviewer_notes?: Json | null;
          alternatives?: Json | null;
          brand?: string | null;
          case_id?: string;
          confidence?: string;
          confidence_score?: number | null;
          created_at?: string;
          deferred?: boolean;
          feedback_status?: string | null;
          hidden?: boolean;
          interaction_notes?: Json | null;
          matched_factors?: Json | null;
          matched_medicines?: Json | null;
          matched_patient_factors?: Json | null;
          matched_product_tags?: Json | null;
          mechanism?: string | null;
          onset?: string | null;
          pharmacist_checks?: Json | null;
          product_id?: string | null;
          product_name?: string | null;
          rank?: number;
          recommendation_id?: string;
          recommendation_type?: string;
          review_status?: string | null;
          safety_cautions?: Json | null;
          safety_net?: string | null;
          score?: number;
          sense_check_status?: string | null;
          severity_tier?: string | null;
          source_references?: Json | null;
          talking_points?: Json | null;
          title?: string;
          user_id?: string;
          why_triggered?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recommendations_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "patient_cases";
            referencedColumns: ["case_id"];
          },
        ];
      };
      safety_rules: {
        Row: {
          advice: string | null;
          avoid_product_keywords: string[] | null;
          created_at: string;
          description: string;
          evidence_level: string | null;
          match_product_tags: string[] | null;
          mechanism: string | null;
          mechanism_detail: string | null;
          name: string;
          onset: string | null;
          pharmacist_checks: Json | null;
          pharmacist_message: string;
          recommendation_type: string;
          review_required: boolean;
          rule_id: string;
          rule_source: string | null;
          safety_net: string | null;
          severity: string;
          severity_tier: string | null;
          trigger_drug_classes: string[] | null;
          trigger_keywords: string[] | null;
          trigger_patient_factors: string[] | null;
        };
        Insert: {
          advice?: string | null;
          avoid_product_keywords?: string[] | null;
          created_at?: string;
          description: string;
          evidence_level?: string | null;
          match_product_tags?: string[] | null;
          mechanism?: string | null;
          mechanism_detail?: string | null;
          name: string;
          onset?: string | null;
          pharmacist_checks?: Json | null;
          pharmacist_message: string;
          recommendation_type: string;
          review_required?: boolean;
          rule_id: string;
          rule_source?: string | null;
          safety_net?: string | null;
          severity: string;
          severity_tier?: string | null;
          trigger_drug_classes?: string[] | null;
          trigger_keywords?: string[] | null;
          trigger_patient_factors?: string[] | null;
        };
        Update: {
          advice?: string | null;
          avoid_product_keywords?: string[] | null;
          created_at?: string;
          description?: string;
          evidence_level?: string | null;
          match_product_tags?: string[] | null;
          mechanism?: string | null;
          mechanism_detail?: string | null;
          name?: string;
          onset?: string | null;
          pharmacist_checks?: Json | null;
          pharmacist_message?: string;
          recommendation_type?: string;
          review_required?: boolean;
          rule_id?: string;
          rule_source?: string | null;
          safety_net?: string | null;
          severity?: string;
          severity_tier?: string | null;
          trigger_drug_classes?: string[] | null;
          trigger_keywords?: string[] | null;
          trigger_patient_factors?: string[] | null;
        };
        Relationships: [];
      };
      sense_check_audits: {
        Row: {
          applied_changes: Json | null;
          audit_id: string;
          case_id: string;
          created_at: string;
          error_message: string | null;
          input_summary: Json | null;
          latency_ms: number | null;
          model: string;
          raw_response: Json | null;
          rejected_changes: Json | null;
          status: string;
          user_id: string;
        };
        Insert: {
          applied_changes?: Json | null;
          audit_id?: string;
          case_id: string;
          created_at?: string;
          error_message?: string | null;
          input_summary?: Json | null;
          latency_ms?: number | null;
          model: string;
          raw_response?: Json | null;
          rejected_changes?: Json | null;
          status: string;
          user_id: string;
        };
        Update: {
          applied_changes?: Json | null;
          audit_id?: string;
          case_id?: string;
          created_at?: string;
          error_message?: string | null;
          input_summary?: Json | null;
          latency_ms?: number | null;
          model?: string;
          raw_response?: Json | null;
          rejected_changes?: Json | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sense_check_audits_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "patient_cases";
            referencedColumns: ["case_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
