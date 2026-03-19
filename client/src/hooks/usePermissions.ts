import { useAuth } from "@/_core/hooks/useAuth";

// Define all available permissions
export type Permission =
  | "view_dashboard"
  | "view_jobs"
  | "create_jobs"
  | "edit_jobs"
  | "delete_jobs"
  | "view_calendar"
  | "view_flight_board"
  | "update_flight_status"
  | "view_sites"
  | "create_sites"
  | "edit_sites"
  | "delete_sites"
  | "view_service_plans"
  | "create_service_plans"
  | "edit_service_plans"
  | "delete_service_plans"
  | "view_equipment"
  | "create_equipment"
  | "edit_equipment"
  | "delete_equipment"
  | "view_equipment_analytics"
  | "view_customers"
  | "create_customers"
  | "edit_customers"
  | "delete_customers"
  | "manage_team"
  | "view_products"
  | "create_products"
  | "edit_products"
  | "delete_products"
  | "view_personnel"
  | "create_personnel"
  | "edit_personnel"
  | "delete_personnel"
  | "view_user_management"
  | "edit_user_roles"
  | "view_ai_chat"
  | "view_maps"
  | "view_weather"
  | "view_settings"
  | "edit_settings";

// Role permissions matrix
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    // Admins have ALL permissions
    "view_dashboard",
    "view_jobs",
    "create_jobs",
    "edit_jobs",
    "delete_jobs",
    "view_calendar",
    "view_flight_board",
    "update_flight_status",
    "view_sites",
    "create_sites",
    "edit_sites",
    "delete_sites",
    "view_service_plans",
    "create_service_plans",
    "edit_service_plans",
    "delete_service_plans",
    "view_equipment",
    "create_equipment",
    "edit_equipment",
    "delete_equipment",
    "view_equipment_analytics",
    "view_customers",
    "create_customers",
    "edit_customers",
    "delete_customers",
    "view_products",
    "create_products",
    "edit_products",
    "delete_products",
    "view_personnel",
    "create_personnel",
    "edit_personnel",
    "delete_personnel",
    "view_user_management",
    "edit_user_roles",
    "view_ai_chat",
    "view_maps",
    "view_weather",
    "view_settings",
    "edit_settings",
  ],
  owner: [
    // Owners have ALL permissions
    "view_dashboard",
    "view_jobs",
    "create_jobs",
    "edit_jobs",
    "delete_jobs",
    "view_calendar",
    "view_flight_board",
    "update_flight_status",
    "view_sites",
    "create_sites",
    "edit_sites",
    "delete_sites",
    "view_service_plans",
    "create_service_plans",
    "edit_service_plans",
    "delete_service_plans",
    "view_equipment",
    "create_equipment",
    "edit_equipment",
    "delete_equipment",
    "view_equipment_analytics",
    "view_customers",
    "create_customers",
    "edit_customers",
    "delete_customers",
    "view_products",
    "create_products",
    "edit_products",
    "delete_products",
    "view_personnel",
    "create_personnel",
    "edit_personnel",
    "delete_personnel",
    "view_user_management",
    "edit_user_roles",
    "view_ai_chat",
    "view_maps",
    "view_weather",
    "view_settings",
    "edit_settings",
  ],
  manager: [
    // Managers have full access except Settings and User Management (admin only)
    "view_dashboard",
    "view_jobs",
    "create_jobs",
    "edit_jobs",
    "delete_jobs",
    "view_calendar",
    "view_flight_board",
    "update_flight_status",
    "view_sites",
    "create_sites",
    "edit_sites",
    "delete_sites",
    "view_service_plans",
    "create_service_plans",
    "edit_service_plans",
    "delete_service_plans",
    "view_equipment",
    "create_equipment",
    "edit_equipment",
    "delete_equipment",
    "view_equipment_analytics",
    "view_customers",
    "create_customers",
    "edit_customers",
    "delete_customers",
    "view_products",
    "create_products",
    "edit_products",
    "delete_products",
    "view_personnel",
    "create_personnel",
    "edit_personnel",
    "delete_personnel",
    "view_ai_chat",
    "view_maps",
    "view_weather",
  ],
  technician: [
    // Technicians have full access except Settings and User Management (admin only)
    "view_dashboard",
    "view_jobs",
    "create_jobs",
    "edit_jobs",
    "delete_jobs",
    "view_calendar",
    "view_flight_board",
    "update_flight_status",
    "view_sites",
    "create_sites",
    "edit_sites",
    "delete_sites",
    "view_service_plans",
    "create_service_plans",
    "edit_service_plans",
    "delete_service_plans",
    "view_equipment",
    "create_equipment",
    "edit_equipment",
    "delete_equipment",
    "view_equipment_analytics",
    "view_customers",
    "create_customers",
    "edit_customers",
    "delete_customers",
    "view_products",
    "create_products",
    "edit_products",
    "delete_products",
    "view_personnel",
    "create_personnel",
    "edit_personnel",
    "delete_personnel",
    "view_ai_chat",
    "view_maps",
    "view_weather",
  ],
  pilot: [
    // Pilots have full access except Settings and User Management (admin only)
    "view_dashboard",
    "view_jobs",
    "create_jobs",
    "edit_jobs",
    "delete_jobs",
    "view_calendar",
    "view_flight_board",
    "update_flight_status",
    "view_sites",
    "create_sites",
    "edit_sites",
    "delete_sites",
    "view_service_plans",
    "create_service_plans",
    "edit_service_plans",
    "delete_service_plans",
    "view_equipment",
    "create_equipment",
    "edit_equipment",
    "delete_equipment",
    "view_equipment_analytics",
    "view_customers",
    "create_customers",
    "edit_customers",
    "delete_customers",
    "view_products",
    "create_products",
    "edit_products",
    "delete_products",
    "view_personnel",
    "create_personnel",
    "edit_personnel",
    "delete_personnel",
    "view_ai_chat",
    "view_maps",
    "view_weather",
  ],
  sales: [
    // Sales have full access except Settings and User Management (admin only)
    "view_dashboard",
    "view_jobs",
    "create_jobs",
    "edit_jobs",
    "delete_jobs",
    "view_calendar",
    "view_flight_board",
    "update_flight_status",
    "view_sites",
    "create_sites",
    "edit_sites",
    "delete_sites",
    "view_service_plans",
    "create_service_plans",
    "edit_service_plans",
    "delete_service_plans",
    "view_equipment",
    "create_equipment",
    "edit_equipment",
    "delete_equipment",
    "view_equipment_analytics",
    "view_customers",
    "create_customers",
    "edit_customers",
    "delete_customers",
    "view_products",
    "create_products",
    "edit_products",
    "delete_products",
    "view_personnel",
    "create_personnel",
    "edit_personnel",
    "delete_personnel",
    "view_ai_chat",
    "view_maps",
    "view_weather",
  ],
};

export function usePermissions() {
  const { user } = useAuth();
  
  const userRole = user?.userRole || "admin";
  const permissions = userRole ? ROLE_PERMISSIONS[userRole] || [] : [];

  const hasPermission = (permission: Permission): boolean => {
    if (!user || !userRole) return false;
    return permissions.includes(permission);
  };

  const hasAnyPermission = (requiredPermissions: Permission[]): boolean => {
    return requiredPermissions.some((permission) => hasPermission(permission));
  };

  const hasAllPermissions = (requiredPermissions: Permission[]): boolean => {
    return requiredPermissions.every((permission) => hasPermission(permission));
  };

  // Convenience methods for common permission checks
  const canView = (resource: string): boolean => {
    return hasPermission(`view_${resource}` as Permission);
  };

  const canCreate = (resource: string): boolean => {
    return hasPermission(`create_${resource}` as Permission);
  };

  const canEdit = (resource: string): boolean => {
    return hasPermission(`edit_${resource}` as Permission);
  };

  const canDelete = (resource: string): boolean => {
    return hasPermission(`delete_${resource}` as Permission);
  };

  return {
    userRole,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canView,
    canCreate,
    canEdit,
    canDelete,
  };
}
