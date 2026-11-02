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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          aliases: string[]
          archived: boolean
          closing_day: number | null
          created_at: string
          credit_limit_cents: number | null
          due_day: number | null
          household_id: string
          id: string
          kind: Database["public"]["Enums"]["account_kind"]
          name: string
          opening_balance_cents: number
          opening_balance_date: string | null
          owner_user_id: string | null
        }
        Insert: {
          aliases?: string[]
          archived?: boolean
          closing_day?: number | null
          created_at?: string
          credit_limit_cents?: number | null
          due_day?: number | null
          household_id: string
          id?: string
          kind: Database["public"]["Enums"]["account_kind"]
          name: string
          opening_balance_cents?: number
          opening_balance_date?: string | null
          owner_user_id?: string | null
        }
        Update: {
          aliases?: string[]
          archived?: boolean
          closing_day?: number | null
          created_at?: string
          credit_limit_cents?: number | null
          due_day?: number | null
          household_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["account_kind"]
          name?: string
          opening_balance_cents?: number
          opening_balance_date?: string | null
          owner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      b3_imports: {
        Row: {
          archived_count: number
          created_count: number
          household_id: string
          id: number
          imported_at: string
          imported_by: string | null
          owner_user_id: string
          reference_date: string
          updated_count: number
        }
        Insert: {
          archived_count?: number
          created_count?: number
          household_id: string
          id?: never
          imported_at?: string
          imported_by?: string | null
          owner_user_id: string
          reference_date: string
          updated_count?: number
        }
        Update: {
          archived_count?: number
          created_count?: number
          household_id?: string
          id?: never
          imported_at?: string
          imported_by?: string | null
          owner_user_id?: string
          reference_date?: string
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "b3_imports_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b3_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "b3_imports_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      budgets: {
        Row: {
          account_id: string | null
          category_id: string | null
          created_at: string
          household_id: string
          id: string
          limit_cents: number
          period: Database["public"]["Enums"]["budget_period"]
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          category_id?: string | null
          created_at?: string
          household_id: string
          id?: string
          limit_cents: number
          period: Database["public"]["Enums"]["budget_period"]
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          category_id?: string | null
          created_at?: string
          household_id?: string
          id?: string
          limit_cents?: number
          period?: Database["public"]["Enums"]["budget_period"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      card_holders: {
        Row: {
          account_id: string
          created_at: string
          household_id: string
          id: string
          last_digits: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          household_id: string
          id?: string
          last_digits: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          household_id?: string
          id?: string
          last_digits?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_holders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_holders_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_holders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      card_statement_imports: {
        Row: {
          account_id: string
          created_count: number
          due_date: string
          duplicate_count: number
          household_id: string
          id: number
          imported_at: string
          imported_by: string | null
          paid: boolean
          total_cents: number | null
        }
        Insert: {
          account_id: string
          created_count?: number
          due_date: string
          duplicate_count?: number
          household_id: string
          id?: never
          imported_at?: string
          imported_by?: string | null
          paid?: boolean
          total_cents?: number | null
        }
        Update: {
          account_id?: string
          created_count?: number
          due_date?: string
          duplicate_count?: number
          household_id?: string
          id?: never
          imported_at?: string
          imported_by?: string | null
          paid?: boolean
          total_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "card_statement_imports_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statement_imports_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statement_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      categories: {
        Row: {
          aliases: string[]
          archived: boolean
          household_default: boolean
          household_id: string
          icon: string | null
          id: string
          name: string
          type: Database["public"]["Enums"]["tx_type"]
        }
        Insert: {
          aliases?: string[]
          archived?: boolean
          household_default?: boolean
          household_id: string
          icon?: string | null
          id?: string
          name: string
          type?: Database["public"]["Enums"]["tx_type"]
        }
        Update: {
          aliases?: string[]
          archived?: boolean
          household_default?: boolean
          household_id?: string
          icon?: string | null
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["tx_type"]
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          household_id: string
          id: string
          invited_by: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          household_id: string
          id?: string
          invited_by?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          household_id?: string
          id?: string
          invited_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      households: {
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
      investment_snapshots: {
        Row: {
          household_id: string
          id: number
          investment_id: string
          taken_on: string
          value_cents: number
        }
        Insert: {
          household_id: string
          id?: never
          investment_id: string
          taken_on: string
          value_cents: number
        }
        Update: {
          household_id?: string
          id?: never
          investment_id?: string
          taken_on?: string
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "investment_snapshots_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_snapshots_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
        ]
      }
      investments: {
        Row: {
          aliases: string[]
          archived_on: string | null
          asset_class: Database["public"]["Enums"]["asset_class"]
          avg_price_cents: number | null
          created_at: string
          current_value_cents: number
          external_id: string | null
          household_id: string
          id: string
          institution: string | null
          last_quote_cents: number | null
          name: string
          net_value_cents: number | null
          owner_user_id: string | null
          quantity: number | null
          source: string
          ticker: string | null
          updated_at: string
          value_as_of: string | null
        }
        Insert: {
          aliases?: string[]
          archived_on?: string | null
          asset_class: Database["public"]["Enums"]["asset_class"]
          avg_price_cents?: number | null
          created_at?: string
          current_value_cents?: number
          external_id?: string | null
          household_id: string
          id?: string
          institution?: string | null
          last_quote_cents?: number | null
          name: string
          net_value_cents?: number | null
          owner_user_id?: string | null
          quantity?: number | null
          source?: string
          ticker?: string | null
          updated_at?: string
          value_as_of?: string | null
        }
        Update: {
          aliases?: string[]
          archived_on?: string | null
          asset_class?: Database["public"]["Enums"]["asset_class"]
          avg_price_cents?: number | null
          created_at?: string
          current_value_cents?: number
          external_id?: string | null
          household_id?: string
          id?: string
          institution?: string | null
          last_quote_cents?: number | null
          name?: string
          net_value_cents?: number | null
          owner_user_id?: string | null
          quantity?: number | null
          source?: string
          ticker?: string | null
          updated_at?: string
          value_as_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investments_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investments_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      merchant_rules: {
        Row: {
          category_id: string
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          pattern: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          pattern: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          pattern?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "merchant_rules_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          household_id: string
          phone_e164: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          household_id: string
          phone_e164?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          household_id?: string
          phone_e164?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount_cents: number
          card_last_digits: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          household_id: string
          id: string
          import_hash: string | null
          installment_group_id: string | null
          installment_number: number | null
          installment_total: number | null
          occurred_on: string
          source: Database["public"]["Enums"]["tx_source"]
          spent_by: string | null
          transfer_account_id: string | null
          type: Database["public"]["Enums"]["tx_type"]
          updated_at: string
        }
        Insert: {
          account_id: string
          amount_cents: number
          card_last_digits?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          household_id: string
          id?: string
          import_hash?: string | null
          installment_group_id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          occurred_on?: string
          source?: Database["public"]["Enums"]["tx_source"]
          spent_by?: string | null
          transfer_account_id?: string | null
          type: Database["public"]["Enums"]["tx_type"]
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount_cents?: number
          card_last_digits?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          household_id?: string
          id?: string
          import_hash?: string | null
          installment_group_id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          occurred_on?: string
          source?: Database["public"]["Enums"]["tx_source"]
          spent_by?: string | null
          transfer_account_id?: string | null
          type?: Database["public"]["Enums"]["tx_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_spent_by_fkey"
            columns: ["spent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_transfer_account_id_fkey"
            columns: ["transfer_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          created_at: string
          direction: string
          household_id: string | null
          id: number
          tool_calls: Json | null
          user_id: string | null
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          direction: string
          household_id?: string | null
          id?: never
          tool_calls?: Json | null
          user_id?: string | null
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          direction?: string
          household_id?: string | null
          id?: never
          tool_calls?: Json | null
          user_id?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_household_invite: {
        Args: { p_display_name: string }
        Returns: string
      }
      apply_b3_import: {
        Args: {
          p_archive_ids: string[]
          p_household_id: string
          p_items: Json
          p_owner_user_id: string
          p_reference_date: string
        }
        Returns: Json
      }
      apply_card_import: {
        Args: {
          p_account_id: string
          p_holders: Json
          p_household_id: string
          p_items: Json
          p_rules: Json
          p_statements: Json
        }
        Returns: Json
      }
      create_household: {
        Args: { p_display_name: string; p_household_name: string }
        Returns: string
      }
      get_pending_invite: {
        Args: never
        Returns: {
          household_id: string
          household_name: string
          invite_id: string
        }[]
      }
      is_household_member: { Args: { hid: string }; Returns: boolean }
      seed_default_categories: { Args: { hid: string }; Returns: undefined }
    }
    Enums: {
      account_kind:
        | "checking"
        | "savings"
        | "credit_card"
        | "cash"
        | "meal_voucher"
      asset_class:
        | "stock"
        | "fii"
        | "etf"
        | "fixed_income"
        | "treasury"
        | "crypto"
        | "fund"
        | "other"
      budget_period: "monthly" | "weekly"
      tx_source: "whatsapp" | "web" | "import"
      tx_type: "expense" | "income" | "transfer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      account_kind: [
        "checking",
        "savings",
        "credit_card",
        "cash",
        "meal_voucher",
      ],
      asset_class: [
        "stock",
        "fii",
        "etf",
        "fixed_income",
        "treasury",
        "crypto",
        "fund",
        "other",
      ],
      budget_period: ["monthly", "weekly"],
      tx_source: ["whatsapp", "web", "import"],
      tx_type: ["expense", "income", "transfer"],
    },
  },
} as const
