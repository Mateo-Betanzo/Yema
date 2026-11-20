
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "delivery_slots": {
                  Row: {
                    "active": boolean,"archived_at": string | null,"capacity": number,"created_at": string,"ends_at": string,"id": number,"starts_at": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"archived_at"?: string | null,"capacity": number,"created_at"?: string,"ends_at": string,"id"?: never,"starts_at": string,"weekday": number
                  }
                  Update: {
                    "active"?: boolean,"archived_at"?: string | null,"capacity"?: number,"created_at"?: string,"ends_at"?: string,"id"?: never,"starts_at"?: string,"weekday"?: number
                  }
                  Relationships: [
                    
                  ]
                },"egg_types": {
                  Row: {
                    "active": boolean,"archived_at": string | null,"created_at": string,"id": number,"name": string,"stock": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"archived_at"?: string | null,"created_at"?: string,"id"?: never,"name": string,"stock"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"archived_at"?: string | null,"created_at"?: string,"id"?: never,"name"?: string,"stock"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"formats": {
                  Row: {
                    "active": boolean,"archived_at": string | null,"created_at": string,"eggs": number,"id": number,"is_load_format": boolean,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"archived_at"?: string | null,"created_at"?: string,"eggs": number,"id"?: never,"is_load_format"?: boolean,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"archived_at"?: string | null,"created_at"?: string,"eggs"?: number,"id"?: never,"is_load_format"?: boolean,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"order_items": {
                  Row: {
                    "id": number,"order_id": number,"product_id": number,"quantity": number,"unit_eggs": number,"unit_price": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"order_id": number,"product_id": number,"quantity": number,"unit_eggs": number,"unit_price": number
                  }
                  Update: {
                    "id"?: never,"order_id"?: number,"product_id"?: number,"quantity"?: number,"unit_eggs"?: number,"unit_price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "admin_order_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "product_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "accepted_at": string | null,"address": string | null,"address_notes": string | null,"cancelled_at": string | null,"cancelled_by": Database["public"]['Enums']["user_role"] | null,"client_id": string | null,"counter_sale": boolean,"created_at": string,"customer_name": string | null,"delivered_at": string | null,"delivery_date": string | null,"delivery_slot_id": number | null,"id": number,"on_the_way_at": string | null,"rejected_at": string | null,"slot_ends_at": string | null,"slot_starts_at": string | null,"status": Database["public"]['Enums']["order_status"],"status_reason": string | null,"total": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"address"?: string | null,"address_notes"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: Database["public"]['Enums']["user_role"] | null,"client_id"?: string | null,"counter_sale"?: boolean,"created_at"?: string,"customer_name"?: string | null,"delivered_at"?: string | null,"delivery_date"?: string | null,"delivery_slot_id"?: number | null,"id"?: never,"on_the_way_at"?: string | null,"rejected_at"?: string | null,"slot_ends_at"?: string | null,"slot_starts_at"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"status_reason"?: string | null,"total": number,"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"address"?: string | null,"address_notes"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: Database["public"]['Enums']["user_role"] | null,"client_id"?: string | null,"counter_sale"?: boolean,"created_at"?: string,"customer_name"?: string | null,"delivered_at"?: string | null,"delivery_date"?: string | null,"delivery_slot_id"?: number | null,"id"?: never,"on_the_way_at"?: string | null,"rejected_at"?: string | null,"slot_ends_at"?: string | null,"slot_starts_at"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"status_reason"?: string | null,"total"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_delivery_slot_id_fkey"
      columns: ["delivery_slot_id"]
isOneToOne: false
      referencedRelation: "delivery_slot_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_delivery_slot_id_fkey"
      columns: ["delivery_slot_id"]
isOneToOne: false
      referencedRelation: "delivery_slots"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "active": boolean,"archived_at": string | null,"created_at": string,"description": string | null,"egg_type_id": number,"format_id": number,"id": number,"name": string,"price": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"archived_at"?: string | null,"created_at"?: string,"description"?: string | null,"egg_type_id": number,"format_id": number,"id"?: never,"name": string,"price": number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"archived_at"?: string | null,"created_at"?: string,"description"?: string | null,"egg_type_id"?: number,"format_id"?: number,"id"?: never,"name"?: string,"price"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_egg_type_id_fkey"
      columns: ["egg_type_id"]
isOneToOne: false
      referencedRelation: "egg_type_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_egg_type_id_fkey"
      columns: ["egg_type_id"]
isOneToOne: false
      referencedRelation: "egg_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_format_id_fkey"
      columns: ["format_id"]
isOneToOne: false
      referencedRelation: "formats"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "address": string | null,"address_notes": string | null,"created_at": string,"first_name": string,"id": string,"last_name": string,"phone": string | null,"role": Database["public"]['Enums']["user_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"address_notes"?: string | null,"created_at"?: string,"first_name": string,"id": string,"last_name": string,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"address_notes"?: string | null,"created_at"?: string,"first_name"?: string,"id"?: string,"last_name"?: string,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"stock_movements": {
                  Row: {
                    "created_at": string,"created_by": string,"egg_type_id": number,"eggs": number,"id": number,"kind": Database["public"]['Enums']["stock_movement_kind"],"note": string | null,"order_id": number | null,"packs": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"egg_type_id": number,"eggs": number,"id"?: never,"kind": Database["public"]['Enums']["stock_movement_kind"],"note"?: string | null,"order_id"?: number | null,"packs"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"egg_type_id"?: number,"eggs"?: number,"id"?: never,"kind"?: Database["public"]['Enums']["stock_movement_kind"],"note"?: string | null,"order_id"?: number | null,"packs"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_egg_type_id_fkey"
      columns: ["egg_type_id"]
isOneToOne: false
      referencedRelation: "egg_type_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_egg_type_id_fkey"
      columns: ["egg_type_id"]
isOneToOne: false
      referencedRelation: "egg_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "admin_order_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "admin_order_overview": {
                  Row: {
                    "accepted_at": string | null,"address": string | null,"address_notes": string | null,"cancelled_at": string | null,"cancelled_by": Database["public"]['Enums']["user_role"] | null,"client_first_name": string | null,"client_id": string | null,"client_last_name": string | null,"client_phone": string | null,"counter_sale": boolean,"created_at": string,"customer_name": string | null,"delivered_at": string | null,"delivery_date": string | null,"delivery_slot_id": number | null,"id": number,"items": Json | null,"on_the_way_at": string | null,"rejected_at": string | null,"slot_ends_at": string | null,"slot_starts_at": string | null,"status": Database["public"]['Enums']["order_status"],"status_reason": string | null,"total": number,"units": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "orders_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_delivery_slot_id_fkey"
      columns: ["delivery_slot_id"]
isOneToOne: false
      referencedRelation: "delivery_slot_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_delivery_slot_id_fkey"
      columns: ["delivery_slot_id"]
isOneToOne: false
      referencedRelation: "delivery_slots"
      referencedColumns: ["id"]
    }
                  ]
                },"delivery_slot_overview": {
                  Row: {
                    "active": boolean,"active_orders": number | null,"capacity": number,"ends_at": string,"id": number,"starts_at": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                           "active"?: boolean | null,"active_orders"?: never,"capacity"?: number | null,"ends_at"?: string | null,"id"?: number | null,"starts_at"?: string | null,"weekday"?: number | null
                         }
                        Update: {
                           "active"?: boolean | null,"active_orders"?: never,"capacity"?: number | null,"ends_at"?: string | null,"id"?: number | null,"starts_at"?: string | null,"weekday"?: number | null
                         }
                        Relationships: [
                    
                  ]
                },"egg_type_overview": {
                  Row: {
                    "active": boolean,"created_at": string,"id": number,"name": string,"reserved_eggs": number | null,"shortfall": number | null,"stock": number,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"egg_type_reservations": {
                  Row: {
                    "egg_type_id": number,"reserved_eggs": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "products_egg_type_id_fkey"
      columns: ["egg_type_id"]
isOneToOne: false
      referencedRelation: "egg_type_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_egg_type_id_fkey"
      columns: ["egg_type_id"]
isOneToOne: false
      referencedRelation: "egg_types"
      referencedColumns: ["id"]
    }
                  ]
                },"product_overview": {
                  Row: {
                    "active": boolean,"created_at": string,"description": string | null,"egg_type_id": number,"format_active": boolean,"format_eggs": number,"format_id": number,"format_name": string,"id": number,"name": string,"price": number,"status": string | null,"type_active": boolean,"type_name": string,"units_available": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "products_egg_type_id_fkey"
      columns: ["egg_type_id"]
isOneToOne: false
      referencedRelation: "egg_type_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_egg_type_id_fkey"
      columns: ["egg_type_id"]
isOneToOne: false
      referencedRelation: "egg_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_format_id_fkey"
      columns: ["format_id"]
isOneToOne: false
      referencedRelation: "formats"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "adjust_stock":
{ Args: { "p_egg_type_id": number,"p_eggs": number,"p_reason": string }; Returns: number
                           },
"admin_sales_by_type":
{ Args: Record<PropertyKey, never>; Returns: {
              "active": boolean,"egg_type_id": number,"eggs_month": number,"eggs_week": number,"eggs_year": number,"name": string
            }[]
                           },
"admin_sales_by_type_at":
{ Args: { "p_now": string }; Returns: {
              "active": boolean,"egg_type_id": number,"eggs_month": number,"eggs_week": number,"eggs_year": number,"name": string
            }[]
                           },
"admin_totals":
{ Args: Record<PropertyKey, never>; Returns: {
              "delivered_today": number,"income_month": number,"income_today": number,"income_week": number,"to_deliver": number
            }[]
                           },
"admin_totals_at":
{ Args: { "p_now": string }; Returns: {
              "delivered_today": number,"income_month": number,"income_today": number,"income_week": number,"to_deliver": number
            }[]
                           },
"archive_delivery_slot":
{ Args: { "p_slot_id": number }; Returns: undefined
                           },
"archive_egg_type":
{ Args: { "p_egg_type_id": number }; Returns: undefined
                           },
"archive_format":
{ Args: { "p_format_id": number }; Returns: undefined
                           },
"archive_product":
{ Args: { "p_product_id": number }; Returns: undefined
                           },
"cancel_order":
{ Args: { "p_order_id": number }; Returns: Database["public"]['Enums']["order_status"]
                           },
"check_items_available":
{ Args: { "p_ids": (number)[],"p_quantities": (number)[] }; Returns: undefined
                           },
"client_orders":
{ Args: Record<PropertyKey, never>; Returns: {
              "accepted_at": string,"address": string,"address_notes": string,"cancelled_at": string,"cancelled_by": Database["public"]['Enums']["user_role"],"created_at": string,"delivered_at": string,"delivery_date": string,"id": number,"items": Json,"on_the_way_at": string,"rejected_at": string,"slot_ends_at": string,"slot_starts_at": string,"status": Database["public"]['Enums']["order_status"],"status_reason": string,"total": number,"units": number
            }[]
                           },
"create_counter_sale":
{ Args: { "p_customer_name"?: string,"p_expected_total": number,"p_items": Json }; Returns: {
              "order_id": number,"total": number
            }[]
                           },
"create_order":
{ Args: { "p_delivery_date": string,"p_expected_total": number,"p_items": Json,"p_slot_id": number }; Returns: {
              "delivery_date": string,"ends_at": string,"order_id": number,"starts_at": string,"total": number
            }[]
                           },
"delivery_options":
{ Args: Record<PropertyKey, never>; Returns: {
              "delivery_date": string,"ends_at": string,"is_full": boolean,"slot_id": number,"starts_at": string
            }[]
                           },
"delivery_options_at":
{ Args: { "p_now": string }; Returns: {
              "delivery_date": string,"ends_at": string,"is_full": boolean,"slot_id": number,"starts_at": string
            }[]
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"load_stock":
{ Args: { "p_egg_type_id": number,"p_note"?: string,"p_packs": number }; Returns: number
                           },
"set_order_status":
{ Args: { "p_order_id": number,"p_reason"?: string,"p_status": Database["public"]['Enums']["order_status"] }; Returns: Database["public"]['Enums']["order_status"]
                           },
"shop_products":
{ Args: Record<PropertyKey, never>; Returns: {
              "available": boolean,"description": string,"format_eggs": number,"format_id": number,"format_name": string,"id": number,"name": string,"price": number,"units_available": number
            }[]
                           },
"subtract_order_eggs":
{ Args: { "p_order_id": number }; Returns: undefined
                           }
          }
          Enums: {
            "order_status": "pending"|"accepted"|"on_the_way"|"delivered"|"rejected"|"cancelled","stock_movement_kind": "load"|"adjustment"|"sale","user_role": "client"|"admin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "order_status": ["pending", "accepted", "on_the_way", "delivered", "rejected", "cancelled"],"stock_movement_kind": ["load", "adjustment", "sale"],"user_role": ["client", "admin"]
          }
        }
} as const
