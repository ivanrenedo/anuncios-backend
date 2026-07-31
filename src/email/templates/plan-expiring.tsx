import * as React from 'react';
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

interface Props {
  userName: string;
  planLabel: string;
  daysLeft: number;
  expiresAt: Date;
  contactWhatsapp: string;
}

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export function PlanExpiringEmail({
  userName,
  planLabel,
  daysLeft,
  expiresAt,
  contactWhatsapp,
}: Props) {
  return (
    <EmailLayout
      preview={`Tu plan ${planLabel} expira en ${daysLeft} días`}
    >
      <Heading style={styles.heading}>
        Tu plan {planLabel} está a punto de expirar
      </Heading>
      <Text style={styles.body}>
        Hola {userName}, tu plan <strong>{planLabel}</strong> vence el{' '}
        <strong>{fmtDate(expiresAt)}</strong> (en {daysLeft}{' '}
        {daysLeft === 1 ? 'día' : 'días'}).
      </Text>
      <Text style={styles.body}>
        Renuévalo antes para no perder tus ventajas: más anuncios activos,
        insignia de plan, y prioridad en el escaparate.
      </Text>
      <Text style={styles.body}>
        Escríbenos por WhatsApp al <strong>{contactWhatsapp}</strong> para
        renovar en minutos.
      </Text>
    </EmailLayout>
  );
}

export const planExpiringSubject = (planLabel: string) =>
  `Tu plan ${planLabel} expira pronto - Bomelh`;

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
