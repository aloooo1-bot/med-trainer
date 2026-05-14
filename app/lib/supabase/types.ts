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
        }
        Update: Partial<Database['public']['Tables']['cases']['Insert']>
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type CaseRow        = Tables<'cases'>
export type ProfileRow     = Tables<'profiles'>
export type RatingRow      = Tables<'ratings'>
export type CaseReportRow  = Tables<'case_reports'>
