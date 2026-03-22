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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          changed_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      cash_balance: {
        Row: {
          amount: number
          balance_date: string
          bank_account: string | null
          created_at: string
          id: string
          notes: string | null
        }
        Insert: {
          amount: number
          balance_date: string
          bank_account?: string | null
          created_at?: string
          id?: string
          notes?: string | null
        }
        Update: {
          amount?: number
          balance_date?: string
          bank_account?: string | null
          created_at?: string
          id?: string
          notes?: string | null
        }
        Relationships: []
      }
      custom_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          type?: string
        }
        Relationships: []
      }
      negotiations: {
        Row: {
          contact_method: string
          contacted_at: string | null
          counterpart: string
          created_at: string
          id: string
          notes: string | null
          original_amount: number
          original_due_date: string | null
          proposed_amount: number | null
          proposed_due_date: string | null
          resolved_at: string | null
          result: string
          strategy: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          contact_method?: string
          contacted_at?: string | null
          counterpart?: string
          created_at?: string
          id?: string
          notes?: string | null
          original_amount?: number
          original_due_date?: string | null
          proposed_amount?: number | null
          proposed_due_date?: string | null
          resolved_at?: string | null
          result?: string
          strategy?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          contact_method?: string
          contacted_at?: string | null
          counterpart?: string
          created_at?: string
          id?: string
          notes?: string | null
          original_amount?: number
          original_due_date?: string | null
          proposed_amount?: number | null
          proposed_due_date?: string | null
          resolved_at?: string | null
          result?: string
          strategy?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      obra_stages: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          created_at: string
          estimated_end_date: string | null
          estimated_start_date: string | null
          estimated_value: number
          id: string
          name: string
          notes: string | null
          obra_id: string
          sort_order: number
          status: string
          supplier: string
          updated_at: string
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          created_at?: string
          estimated_end_date?: string | null
          estimated_start_date?: string | null
          estimated_value?: number
          id?: string
          name: string
          notes?: string | null
          obra_id: string
          sort_order?: number
          status?: string
          supplier?: string
          updated_at?: string
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          created_at?: string
          estimated_end_date?: string | null
          estimated_start_date?: string | null
          estimated_value?: number
          id?: string
          name?: string
          notes?: string | null
          obra_id?: string
          sort_order?: number
          status?: string
          supplier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "obra_stages_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      obras: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          address: string | null
          budget_target: number | null
          client_email: string | null
          client_name: string
          code: string
          condominium: string
          contract_value: number
          created_at: string
          expected_end_date: string | null
          expected_start_date: string | null
          id: string
          notes: string | null
          payment_terms: string | null
          status: string
          unit_number: string
          updated_at: string
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          address?: string | null
          budget_target?: number | null
          client_email?: string | null
          client_name: string
          code: string
          condominium?: string
          contract_value?: number
          created_at?: string
          expected_end_date?: string | null
          expected_start_date?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          status?: string
          unit_number?: string
          updated_at?: string
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          address?: string | null
          budget_target?: number | null
          client_email?: string | null
          client_name?: string
          code?: string
          condominium?: string
          contract_value?: number
          created_at?: string
          expected_end_date?: string | null
          expected_start_date?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          status?: string
          unit_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          attachment_url: string | null
          billing_count: number
          billing_sent_at: string | null
          category: string
          cost_center: string
          counterpart: string
          created_at: string
          description: string
          due_date: string
          id: string
          notes: string | null
          obra_id: string | null
          paid_at: string | null
          payment_method: string | null
          priority: string
          recurrence: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          amount?: number
          attachment_url?: string | null
          billing_count?: number
          billing_sent_at?: string | null
          category?: string
          cost_center?: string
          counterpart?: string
          created_at?: string
          description: string
          due_date: string
          id?: string
          notes?: string | null
          obra_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          priority?: string
          recurrence?: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          billing_count?: number
          billing_sent_at?: string | null
          category?: string
          cost_center?: string
          counterpart?: string
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          notes?: string | null
          obra_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          priority?: string
          recurrence?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
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
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
