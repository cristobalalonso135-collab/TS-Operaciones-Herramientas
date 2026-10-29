'use client';

import { useRouter } from 'next/navigation';
import TarifasTool from '@/components/TarifasTool';
import { AccessGate, useAccess } from '@/components/AccessProvider';

export default function TarifasPage() {
  const router = useRouter();
  const access = useAccess();
  return (
    <AccessGate>
      <TarifasTool onBack={access.required ? undefined : () => router.push('/')} />
    </AccessGate>
  );
}
