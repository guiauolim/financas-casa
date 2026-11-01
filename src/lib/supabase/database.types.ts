// Tipos parciais escritos à mão (só o que a Fase 1 usa).
// Depois de `supabase link`, substituir por `pnpm db:types`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      households: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      profiles: {
        Row: {
          user_id: string;
          household_id: string;
          display_name: string;
          phone_e164: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          household_id: string;
          display_name: string;
          phone_e164?: string | null;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          household_id?: string;
          display_name?: string;
          phone_e164?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      household_invites: {
        Row: {
          id: string;
          household_id: string;
          email: string;
          invited_by: string | null;
          created_at: string;
          accepted_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          email: string;
          invited_by?: string | null;
          created_at?: string;
          accepted_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          email?: string;
          invited_by?: string | null;
          created_at?: string;
          accepted_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_household: {
        Args: { p_household_name: string; p_display_name: string };
        Returns: string;
      };
      get_pending_invite: {
        Args: Record<PropertyKey, never>;
        Returns: { invite_id: string; household_id: string; household_name: string }[];
      };
      accept_household_invite: {
        Args: { p_display_name: string };
        Returns: string;
      };
      is_household_member: {
        Args: { hid: string };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
