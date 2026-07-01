import { AdminHeader } from '@/components/AdminHeader';

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AdminHeader />
      {children}
    </>
  );
}
