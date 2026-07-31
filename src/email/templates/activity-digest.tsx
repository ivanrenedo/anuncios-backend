import * as React from 'react';
import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

interface Props {
  userName: string;
  favoritesReceived: number;
  contactsReceived: number;
  newFollowers: number;
  reviewsReceived: number;
  weekLabel: string;
  unsubscribeUrl?: string;
}

export function ActivityDigestEmail({
  userName,
  favoritesReceived,
  contactsReceived,
  newFollowers,
  reviewsReceived,
  weekLabel,
  unsubscribeUrl,
}: Props) {
  return (
    <EmailLayout
      preview={`Tu semana en Bomelh — ${favoritesReceived} favoritos, ${contactsReceived} contactos`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={styles.heading}>Tu semana en Bomelh</Heading>
      <Text style={styles.body}>
        Hola {userName}, este es el resumen de tu actividad de la semana del{' '}
        <strong>{weekLabel}</strong>:
      </Text>

      <Section style={styles.stats}>
        <Stat value={favoritesReceived} label="Favoritos recibidos" />
        <Stat value={contactsReceived} label="Contactos por WhatsApp" />
        <Stat value={newFollowers} label="Nuevos seguidores" />
        <Stat value={reviewsReceived} label="Reseñas recibidas" />
      </Section>

      <Text style={styles.body}>
        Sigue publicando anuncios frescos para mantener tu perfil activo. Los
        vendedores que actualizan sus anuncios semanalmente reciben hasta 3
        veces más contactos.
      </Text>
    </EmailLayout>
  );
}

export const activityDigestSubject = 'Tu semana en Bomelh';

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Section style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
    margin: '0 0 16px',
  },
  stats: {
    margin: '0 0 20px',
  },
  stat: {
    display: 'inline-block',
    width: '48%',
    boxSizing: 'border-box',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: '16px',
    textAlign: 'center' as const,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 800,
    color: '#004940',
    margin: 0,
    lineHeight: 1,
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
    margin: '6px 0 0',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
};
