import * as React from 'react';
import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

interface Props {
  userName: string;
}

export function WelcomeEmail({ userName }: Props) {
  return (
    <EmailLayout preview="Bienvenido a Bomelh — empieza a vender y comprar">
      <Heading style={styles.heading}>¡Bienvenido a Bomelh, {userName}!</Heading>
      <Text style={styles.body}>
        Gracias por unirte a la plataforma de anuncios clasificados más
        activa de Guinea Ecuatorial. Ya puedes empezar a comprar y vender.
      </Text>

      <Section style={styles.steps}>
        <Step number="1" title="Completa tu perfil">
          Añade tu foto, ubicación y una biografía corta. Los perfiles
          completos generan más confianza.
        </Step>
        <Step number="2" title="Publica tu primer anuncio">
          Es gratis. Añade hasta 4 fotos, un buen título y un precio claro
          en francos CFA.
        </Step>
        <Step number="3" title="Verifica tu cuenta">
          Los vendedores verificados venden más rápido — la insignia da
          seguridad a los compradores.
        </Step>
      </Section>

      <Text style={styles.body}>
        Si necesitas ayuda, visita el Centro de ayuda desde tu perfil.
      </Text>
    </EmailLayout>
  );
}

export const welcomeSubject = '¡Bienvenido a Bomelh!';

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Section style={styles.step}>
      <Text style={styles.stepNumber}>{number}</Text>
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.stepBody}>{children}</Text>
    </Section>
  );
}

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
  steps: {
    margin: '0 0 20px',
  },
  step: {
    borderLeft: '3px solid #004940',
    paddingLeft: 14,
    marginBottom: 16,
  },
  stepNumber: {
    fontSize: 11,
    color: '#004940',
    fontWeight: 700,
    letterSpacing: 1,
    margin: 0,
  },
  stepTitle: {
    fontSize: 15,
    color: '#111827',
    fontWeight: 700,
    margin: '2px 0',
  },
  stepBody: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 1.5,
    margin: 0,
  },
};
