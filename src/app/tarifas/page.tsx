'use client';

import { useRouter } from 'next/navigation';
import TarifasTool from '@/components/TarifasTool';

export default function TarifasPage() {
  const router = useRouter();
  return <TarifasTool onBack={() => router.push('/')} />;
}
