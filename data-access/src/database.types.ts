export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      caregiver: {
        Row: {
          created_at: string
          display_name: string
          household_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          household_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          household_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      category: {
        Row: {
          created_at: string
          household_id: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          household_id?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          household_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      child: {
        Row: {
          birthdate: string
          created_at: string
          household_id: string
          id: string
          name: string
        }
        Insert: {
          birthdate: string
          created_at?: string
          household_id: string
          id?: string
          name: string
        }
        Update: {
          birthdate?: string
          created_at?: string
          household_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      food: {
        Row: {
          category_id: string
          created_at: string
          household_id: string
          id: string
          name: string
        }
        Insert: {
          category_id: string
          created_at?: string
          household_id: string
          id?: string
          name: string
        }
        Update: {
          category_id?: string
          created_at?: string
          household_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      household: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      household_invite: {
        Row: {
          created_at: string
          email: string
          household_id: string
          id: string
          invited_by: string
        }
        Insert: {
          created_at?: string
          email: string
          household_id: string
          id?: string
          invited_by: string
        }
        Update: {
          created_at?: string
          email?: string
          household_id?: string
          id?: string
          invited_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_invite_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_invite_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "caregiver"
            referencedColumns: ["id"]
          },
        ]
      }
      location: {
        Row: {
          created_at: string
          household_id: string
          id: string
          latitude: number
          longitude: number
          mapbox_place_id: string | null
          name: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          latitude: number
          longitude: number
          mapbox_place_id?: string | null
          name: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          latitude?: number
          longitude?: number
          mapbox_place_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      log_entry: {
        Row: {
          child_id: string
          created_at: string
          created_by: string
          food_id: string
          household_id: string
          id: string
          intensity: number | null
          location_id: string | null
          notes: string | null
          occurred_at: string
          status: string
        }
        Insert: {
          child_id: string
          created_at?: string
          created_by: string
          food_id: string
          household_id: string
          id?: string
          intensity?: number | null
          location_id?: string | null
          notes?: string | null
          occurred_at?: string
          status: string
        }
        Update: {
          child_id?: string
          created_at?: string
          created_by?: string
          food_id?: string
          household_id?: string
          id?: string
          intensity?: number | null
          location_id?: string | null
          notes?: string | null
          occurred_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_entry_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_entry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "caregiver"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_entry_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_entry_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_entry_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location"
            referencedColumns: ["id"]
          },
        ]
      }
      log_entry_reason_tag: {
        Row: {
          household_id: string
          log_entry_id: string
          reason_tag_id: string
        }
        Insert: {
          household_id: string
          log_entry_id: string
          reason_tag_id: string
        }
        Update: {
          household_id?: string
          log_entry_id?: string
          reason_tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_entry_reason_tag_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_entry_reason_tag_log_entry_id_fkey"
            columns: ["log_entry_id"]
            isOneToOne: false
            referencedRelation: "log_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_entry_reason_tag_reason_tag_id_fkey"
            columns: ["reason_tag_id"]
            isOneToOne: false
            referencedRelation: "reason_tag"
            referencedColumns: ["id"]
          },
        ]
      }
      reason_tag: {
        Row: {
          created_at: string
          household_id: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          household_id?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          household_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "reason_tag_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_household_id: { Args: never; Returns: string }
      household_has_caregiver: {
        Args: { target_household_id: string }
        Returns: boolean
      }
      household_has_pending_invite: {
        Args: { invitee_email: string; target_household_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

