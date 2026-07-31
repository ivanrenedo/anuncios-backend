import * as React from 'react';
import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

interface Props {
  userName: string;
  reason?: string;
}

export function VerificationRejectedEmail({ userName, reason }: Props) {
  return (
    <EmailLayout preview="Tu solicitud de verificación fue rechazada">
      <Heading style={styles.heading}>Solicitud de verificación rechazada</Heading>
      <Text style={styles.body}>
        Hola {userName}, hemos revisado tu solicitud de verificación y de
        momento no podemos aprobarla.
      </Text>

      {reason && (
        <Section style={styles.reason}>
          <Text style={styles.reasonLabel}>Motivo:</Text>
          <Text style={styles.reasonText}>{reason}</Text>
        </Section>
      )}

      <Text style={styles.body}>
        Puedes volver a solicitar la verificación desde tu perfil en la app,
        adjuntando la documentación que se te haya indicado.
      </Text>
    </EmailLayout>
  );
}

export const verificationRejectedSubject =
  'Solicitud de verificación rechazada - Bomelh';

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
