import * as React from 'react';
import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

interface Props {
  adminName: string;
  pendingReports: number;
  pendingVerifications: number;
  newUsersThisWeek: number;
  paidPlansThisWeek: number;
  revenueXaf: number;
  weekLabel: string;
}

const fmtXaf = (n: number) => `${Math.round(n).toLocaleString('es')} XAF`;

export function AdminWeeklySummaryEmail({
  adminName,
  pendingReports,
  pendingVerifications,
  newUsersThisWeek,
  paidPlansThisWeek,
  revenueXaf,
  weekLabel,
}: Props) {
  return (
    <EmailLayout preview={`Resumen semanal — ${weekLabel}`}>
      <Heading style={styles.heading}>Resumen semanal — {weekLabel}</Heading>
      <Text style={styles.body}>Hola {adminName}, este es el estado de la plataforma esta semana:</Text>

      <Section style={styles.grid}>
        <Row label="Reportes pendientes" value={String(pendingReports)} highlight={pendingReports > 0} />
        <Row label="Verificaciones pendientes" value={String(pendingVerifications)} highlight={pendingVerifications > 0} />
        <Row label="Nuevos usuarios (semana)" value={String(newUsersThisWeek)} />
        <Row label="Planes de pago activados" value={String(paidPlansThisWeek)} />
        <Row label="Ingresos de la semana" value={fmtXaf(revenueXaf)} />
      </Section>

      {(pendingReports > 0 || pendingVerifications > 0) && (
        <Text style={styles.body}>
          Hay elementos pendientes que requieren tu atención. Revísalos desde
          el panel de administración.
        </Text>
      )}
    </EmailLayout>
  );
}

export const adminWeeklySummarySubject = 'Resumen semanal - Bomelh';

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Section style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={{
          ...styles.rowValue,
          color: highlight ? '#b91c1c' : '#111827',
        }}
      >
        {value}
      </Text>
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
  grid: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: '8px 20px',
    margin: '0 0 20px',
  },
  row: {
    display: 'block',
    borderBottom: '1px solid #e5e7eb',
    padding: '10px 0',
  },
  rowLabel: {
    fontSize: 12,
    color: '#6b7280',
    margin: 0,
  },
  rowValue: {
    fontSize: 16,
    fontWeight: 700,
    margin: '4px 0 0',
  },
};
