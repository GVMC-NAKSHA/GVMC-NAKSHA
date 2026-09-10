// app/layout.tsx
export const metadata = { title: 'GVMC · NAKSHA', description: 'Land-record integration & harmonization' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
