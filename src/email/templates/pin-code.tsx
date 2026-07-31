import * as React from 'react';
import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

interface Props {
  code: string;
  /** Minutes until the code expires (matches OTP_EXPIRY_MS in otp.service). */
  expiresInMinutes: number;
}

export function PinCodeEmail({ code, expiresInMinutes }: Props) {
  return (
    <EmailLayout preview={`Tu código de verificación: ${code}`}>
      <Heading style={styles.heading}>Código de verificación</Heading>
      <Text style={styles.body}>
        Usa el siguiente código para completar tu operación en Bomelh:
      </Text>
      <Section style={styles.codeBox}>
        <Text style={styles.code}>{code}</Text>
      </Section>
      <Text style={styles.caption}>
        Este código expira en {expiresInMinutes} minutos.
      </Text>
      <Text style={styles.caption}>
        Si no solicitaste este código, ignora este mensaje.
      </Text>
    </EmailLayout>
  );
}

export const pinCodeSubject = 'Tu código de verificación - Bomelh';

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
    margin: '0 0 20px',
  },
  codeBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: '20px 16px',
    textAlign: 'center' as const,
    margin: '0 0 20px',
  },
  code: {
    fontSize: 32,
    letterSpacing: 8,
    fontWeight: 800,
    color: '#004940',
    margin: 0,
  },
  caption: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 1.5,
    margin: '4px 0',
  },
};
