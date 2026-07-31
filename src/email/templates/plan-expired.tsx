import * as React from 'react';
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

interface Props {
  userName: string;
  planLabel: string;
  contactWhatsapp: string;
}

export function PlanExpiredEmail({
  userName,
  planLabel,
  contactWhatsapp,
}: Props) {
  return (
    <EmailLayout preview={`Tu plan ${planLabel} ha expirado`}>
      <Heading style={styles.heading}>
        Tu plan {planLabel} ha expirado
      </Heading>
      <Text style={styles.body}>
        Hola {userName}, tu plan <strong>{planLabel}</strong> venció y tu
        cuenta ha vuelto al plan Gratis. Tus anuncios siguen publicados,
        pero pierdes la insignia de plan, el auto-bump y las estadísticas.
      </Text>
      <Text style={styles.body}>
        Si quieres seguir aprovechando las ventajas del plan {planLabel},
        renuévalo escribiéndonos por WhatsApp al{' '}
        <strong>{contactWhatsapp}</strong>.
      </Text>
    </EmailLayout>
  );
}

export const planExpiredSubject = (planLabel: string) =>
  `Tu plan ${planLabel} ha expirado - Bomelh`;

const styles: Record<string, React.CSSProperties> = {
  heading: {
    fontSize: 22,
    fontWeight: 800,
    color: '#111827',
    margin: '0 0 12px',
  },
  body: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 1.6,
    margin: '0 0 16px',
  },
};
