import { ProfileMenu, type ProfileMenuLink } from "@/components/profile-menu";

// The menu of the client Perfil (spec 010: RF-17, RF-20, RF-29), with the history and "Editar perfil";
// "Cerrar sesión" goes last (ProfileMenu, shared with the admin since spec 011).
const LINKS: readonly ProfileMenuLink[] = [
  { label: "Historial de compras", icon: "clock", href: "/client/history" },
  { label: "Editar perfil", icon: "edit-pencil", href: "/client/edit-profile" },
];

export default function ClientMenu() {
  return <ProfileMenu links={LINKS} />;
}
