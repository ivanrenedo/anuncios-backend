import * as React from 'react';
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

interface Props {
  userName: string;
}

export function VerificationApprovedEmail({ userName }: Props) {
  return (
    <EmailLayout preview="Tu cuenta ha sido verificada">
      <Heading style={styles.heading}>¡Estás verificado! ✓</Heading>
      <Text style={styles.body}>
        Enhorabuena {userName}, hemos verificado tu cuenta. A partir de ahora
        tu perfil muestra la insignia de verificado — los compradores
        confían más en las cuentas verificadas.
      </Text>
      <Text style={styles.body}>
        Sigue publicando anuncios de calidad y responde a los mensajes rápido
        para mantener tu buena reputación.
      </Text>
    </EmailLayout>
  );
}

export const verificationApprovedSubject = 'Cuenta verificada - Bomelh';

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
