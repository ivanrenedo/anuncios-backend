import * as React from 'react';
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

interface Props {
  userName: string;
  daysSinceLastSeen: number;
  newProductsCount: number;
  unsubscribeUrl?: string;
}

export function ComebackEmail({
  userName,
  daysSinceLastSeen,
  newProductsCount,
  unsubscribeUrl,
}: Props) {
  return (
    <EmailLayout
      preview="Te echamos de menos en Bomelh"
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={styles.heading}>Te echamos de menos, {userName}</Heading>
      <Text style={styles.body}>
        Hace <strong>{daysSinceLastSeen} días</strong> que no te vemos por
        Bomelh. La plataforma ha seguido creciendo — se han publicado más de{' '}
        <strong>{newProductsCount.toLocaleString('es')}</strong> anuncios
        nuevos desde tu última visita.
      </Text>
      <Text style={styles.body}>
        Vuelve para encontrar oportunidades en tu ciudad, revisar mensajes de
        compradores interesados en tus anuncios y actualizar tu perfil.
      </Text>
      <Text style={styles.body}>
        Abre la app cuando quieras — te estamos esperando.
      </Text>
    </EmailLayout>
  );
}

export const comebackSubject = 'Te echamos de menos - Bomelh';

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
