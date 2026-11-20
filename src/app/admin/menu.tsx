import { ProfileMenu, type ProfileMenuLink } from "@/components/profile-menu";

// The menu of the admin Perfil (spec 011: RF-2, RF-5, RF-7, RF-8, RF-21), the same as the client's:
// the configuration of the business first and the account after, with "Cerrar sesión" last (ProfileMenu).
// Tipos y formatos and the delivery schedule open as they are (specs 003 and 009).
const LINKS: readonly ProfileMenuLink[] = [
  { label: "Tipos y formatos", icon: "list", href: "/admin/catalog-setup" },
  { label: "Agenda de reparto", icon: "calendar", href: "/admin/schedule" },
  { label: "Historial de stock", icon: "clock", href: "/admin/stock-history" },
  { label: "Editar perfil", icon: "edit-pencil", href: "/admin/edit-profile" },
];

export default function AdminMenu() {
  return <ProfileMenu links={LINKS} />;
}
