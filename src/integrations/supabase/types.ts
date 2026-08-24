export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      interview_recordings: {
        Row: {
          audio_path: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          invitation_id: string
          is_follow_up: boolean
          mime_type: string
          position: number
          question_id: string
          storage_path: string
          transcript: string | null
          transcript_segments: Json | null
          transcript_status: string
        }
        Insert: {
          audio_path?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          invitation_id: string
          is_follow_up?: boolean
          mime_type?: string
          position: number
          question_id: string
          storage_path: string
          transcript?: string | null
          transcript_segments?: Json | null
          transcript_status?: string
        }
        Update: {
          audio_path?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          invitation_id?: string
          is_follow_up?: boolean
          mime_type?: string
          position?: number
          question_id?: string
          storage_path?: string
          transcript?: string | null
          transcript_segments?: Json | null
          transcript_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_recordings_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_recordings_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "template_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_summaries: {
        Row: {
          article_title: string | null
          created_at: string
          executive_summary: string | null
          full_transcript: string | null
          id: string
          invitation_id: string
          key_insights: string[]
          key_themes: string[]
          memorable_quotes: string[]
          profile_paragraph: string | null
          pull_quotes: string[]
          suggested_headline: string | null
        }
        Insert: {
          article_title?: string | null
          created_at?: string
          executive_summary?: string | null
          full_transcript?: string | null
          id?: string
          invitation_id: string
          key_insights?: string[]
          key_themes?: string[]
          memorable_quotes?: string[]
          profile_paragraph?: string | null
          pull_quotes?: string[]
          suggested_headline?: string | null
        }
        Update: {
          article_title?: string | null
          created_at?: string
          executive_summary?: string | null
          full_transcript?: string | null
          id?: string
          invitation_id?: string
          key_insights?: string[]
          key_themes?: string[]
          memorable_quotes?: string[]
          profile_paragraph?: string | null
          pull_quotes?: string[]
          suggested_headline?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_summaries_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: true
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_templates: {
        Row: {
          allow_pause: boolean
          allow_retries: boolean
          created_at: string
          created_by: string
          description: string | null
          id: string
          max_duration_seconds: number
          name: string
        }
        Insert: {
          allow_pause?: boolean
          allow_retries?: boolean
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          max_duration_seconds?: number
          name: string
        }
        Update: {
          allow_pause?: boolean
          allow_retries?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          max_duration_seconds?: number
          name?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          completed_at: string | null
          consent_given: boolean
          created_at: string
          created_by: string
          department: string | null
          designation: string | null
          email: string
          expires_at: string | null
          id: string
          leader_name: string
          started_at: string | null
          status: Database["public"]["Enums"]["invitation_status"]
          template_id: string
          token: string
        }
        Insert: {
          completed_at?: string | null
          consent_given?: boolean
          created_at?: string
          created_by: string
          department?: string | null
          designation?: string | null
          email: string
          expires_at?: string | null
          id?: string
          leader_name: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          template_id: string
          token: string
        }
        Update: {
          completed_at?: string | null
          consent_given?: boolean
          created_at?: string
          created_by?: string
          department?: string | null
          designation?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          leader_name?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          template_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "interview_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      template_questions: {
        Row: {
          created_at: string
          follow_up_keywords: string[]
          follow_up_prompt: string | null
          id: string
          position: number
          prompt: string
          template_id: string
        }
        Insert: {
          created_at?: string
          follow_up_keywords?: string[]
          follow_up_prompt?: string | null
          id?: string
          position: number
          prompt: string
          template_id: string
        }
        Update: {
          created_at?: string
          follow_up_keywords?: string[]
          follow_up_prompt?: string | null
          id?: string
          position?: number
          prompt?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "interview_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "editor"
      invitation_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "editor"],
      invitation_status: [
        "pending",
        "in_progress",
        "completed",
        "cancelled",
        "expired",
      ],
    },
  },
} as const
