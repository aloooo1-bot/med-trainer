export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      cases: {
        Relationships: []
        Row: {
          id: string
          system: string
          difficulty: string
          diagnosis: string
          variant_index: number
          case_data: Record<string, unknown> | null
          is_generated: boolean
          generated_at: string | null
          created_at: string
          verified_images: Record<string, unknown> | null
          imaging_cache: Record<string, unknown> | null
          // Tiered case data (migration 0001) — only presentation_data is
          // client-readable; the rest are service-role-only columns.
          presentation_data: Record<string, unknown> | null
          patient_knowledge: Record<string, unknown> | null
          clinical_findings: Record<string, unknown> | null
          ground_truth: Record<string, unknown> | null
        }
        Insert: {
          id: string
          system: string
          difficulty: string
          diagnosis: string
          variant_index?: number
          case_data?: Record<string, unknown> | null
          is_generated?: boolean
          generated_at?: string | null
          created_at?: string
          verified_images?: Record<string, unknown> | null
          imaging_cache?: Record<string, unknown> | null
          presentation_data?: Record<string, unknown> | null
          patient_knowledge?: Record<string, unknown> | null
          clinical_findings?: Record<string, unknown> | null
          ground_truth?: Record<string, unknown> | null
        }
        Update: Partial<Database['public']['Tables']['cases']['Insert']>
      }
      trainer_sessions: {
        Relationships: []
        Row: {
          id: string
          user_id: string
          case_id: string | null
          system: string
          difficulty: string
          phase: 'active' | 'presentation' | 'graded'
          case_snapshot: Record<string, unknown>
          created_at: string
        }
        Insert: {
          id: string
          user_id: string
          case_id?: string | null
          system: string
          difficulty: string
          phase?: 'active' | 'presentation' | 'graded'
          case_snapshot: Record<string, unknown>
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['trainer_sessions']['Insert']>
      }
      session_events: {
        Relationships: []
        Row: {
          id: number
          session_id: string
          ts: string
          type: 'start' | 'ask' | 'exam' | 'order' | 'prediction' | 'enter_presentation' | 'submit'
          payload: Record<string, unknown>
        }
        Insert: {
          id?: number
          session_id: string
          ts?: string
          type: 'start' | 'ask' | 'exam' | 'order' | 'prediction' | 'enter_presentation' | 'submit'
          payload?: Record<string, unknown>
        }
        Update: Partial<Database['public']['Tables']['session_events']['Insert']>
      }
      profiles: {
        Relationships: []
        Row: {
          id: string
          display_name: string | null
          role: 'student' | 'admin'
          tier: 'free' | 'pro'
          cases_used_today: number
          cases_today_reset_at: string
          first_case_completed: boolean
          created_at: string
          email_case_reminders: boolean
          email_weekly_summary: boolean
          rest_days: string[] | null
          weekly_volume: number | null
          difficulty_mix: string | null
          default_system: string | null
        }
        Insert: {
          id: string
          display_name?: string | null
          role?: 'student' | 'admin'
          tier?: 'free' | 'pro'
          cases_used_today?: number
          cases_today_reset_at?: string
          first_case_completed?: boolean
          created_at?: string
          email_case_reminders?: boolean
          email_weekly_summary?: boolean
          rest_days?: string[] | null
          weekly_volume?: number | null
          difficulty_mix?: string | null
          default_system?: string | null
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      case_sessions: {
        Relationships: []
        Row: {
          id: string
          user_id: string
          started_at: string
          completed_at: string
          system: string
          difficulty: string
          diagnosis: string
          user_diagnosis: string
          correct: boolean
          score: number
          question_count: number
          elapsed_seconds: number
          total_cost_usd: number | null
          total_input_tokens: number | null
          total_output_tokens: number | null
          api_calls: Json | null
          grading_result: Json | null
          bookmarked: boolean
          parent_session_id: string | null
          notes: string
          created_at: string
        }
        Insert: {
          id: string
          user_id: string
          started_at: string
          completed_at: string
          system: string
          difficulty: string
          diagnosis: string
          user_diagnosis: string
          correct: boolean
          score: number
          question_count: number
          elapsed_seconds: number
          total_cost_usd?: number | null
          total_input_tokens?: number | null
          total_output_tokens?: number | null
          api_calls?: Json | null
          grading_result?: Json | null
          bookmarked?: boolean
          parent_session_id?: string | null
          notes?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['case_sessions']['Insert']>
      }
      case_reports: {
        Relationships: []
        Row: {
          id: string
          user_id: string
          session_id: string | null
          case_id: string | null
          system: string
          difficulty: string
          diagnosis: string
          category: 'incorrect-grading' | 'inaccurate-content' | 'confusing-ui' | 'other'
          comment: string
          status: 'open' | 'resolved' | 'dismissed'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          session_id?: string | null
          case_id?: string | null
          system: string
          difficulty: string
          diagnosis: string
          category: 'incorrect-grading' | 'inaccurate-content' | 'confusing-ui' | 'other'
          comment?: string
          status?: 'open' | 'resolved' | 'dismissed'
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['case_reports']['Insert']>
      }
      ratings: {
        Relationships: []
        Row: {
          id: string
          user_id: string | null
          case_id: string | null
          diagnosis: string
          system: string
          difficulty: string
          patient_name: string
          overall: number | null
          clinical_realism: number | null
          grading_fairness: number | null
          patient_communication: number | null
          difficulty_accuracy: number | null
          comment: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          case_id?: string | null
          diagnosis: string
          system: string
          difficulty: string
          patient_name?: string
          overall?: number | null
          clinical_realism?: number | null
          grading_fairness?: number | null
          patient_communication?: number | null
          difficulty_accuracy?: number | null
          comment?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['ratings']['Insert']>
      }
      case_regeneration_jobs: {
        Relationships: []
        Row: {
          id: string
          case_id: string
          status: 'pending' | 'running' | 'done' | 'error'
          started_at: string | null
          completed_at: string | null
          error: string | null
          result_diagnosis: string | null
          created_at: string
        }
        Insert: {
          id?: string
          case_id: string
          status?: 'pending' | 'running' | 'done' | 'error'
          started_at?: string | null
          completed_at?: string | null
          error?: string | null
          result_diagnosis?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['case_regeneration_jobs']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: {
      cache_imaging_test: {
        Args: { p_case_id: string; p_test_name: string; p_results: Json }
        Returns: undefined
      }
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type CaseRow             = Tables<'cases'>
export type ProfileRow          = Tables<'profiles'>
export type RatingRow           = Tables<'ratings'>
export type CaseReportRow       = Tables<'case_reports'>
export type RegenJobRow         = Tables<'case_regeneration_jobs'>
export type RegenJobStatus      = RegenJobRow['status']
