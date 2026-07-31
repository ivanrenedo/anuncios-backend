import * as React from 'react';
import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

interface Props {
  userName: string;
  reason?: string;
  contactEmail: string;
}

export function AccountSuspendedEmail({
  userName,
  reason,
  contactEmail,
}: Props) {
  return (
    <EmailLayout preview="Tu cuenta ha sido suspendida">
      <Heading style={styles.heading}>Cuenta suspendida</Heading>
      <Text style={styles.body}>
        Hola {userName}, hemos suspendido temporalmente tu cuenta en Bomelh.
        Tus anuncios activos se han retirado de la plataforma.
      </Text>

      {reason && (
        <Section style={styles.reason}>
          <Text style={styles.reasonLabel}>Motivo:</Text>
          <Text style={styles.reasonText}>{reason}</Text>
        </Section>
      )}

      <Text style={styles.body}>
        Si crees que se trata de un error o quieres apelar la decisión,
        escríbenos a <strong>{contactEmail}</strong> y revisaremos tu caso.
      </Text>
    </EmailLayout>
  );
}

export const accountSuspendedSubject = 'Cuenta suspendida - Bomelh';

const styles: Record<string, React.CSSProperties> = {
  heading: {
    fontSize: 22,
    fontWeight: 800,
    color: '#991b1b',
    margin: '0 0 12px',
  },
  body: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 1.6,
    margin: '0 0 16px',
  },
  reason: {
    backgroundColor: '#fef2f2',
    borderLeft: '4px solid #ef4444',
    padding: '12px 16px',
    borderRadius: 4,
    margin: '0 0 20px',
  },
  reasonLabel: {
    fontSize: 12,
    color: '#991b1b',
    fontWeight: 700,
    margin: 0,
  },
  reasonText: {
    fontSize: 14,
    color: '#7f1d1d',
    margin: '4px 0 0',
  },
};
