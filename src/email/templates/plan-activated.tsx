import * as React from 'react';
import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

interface Props {
  userName: string;
  planLabel: string;
  amountXaf: number;
  expiresAt: Date | null;
  invoiceRef: string;
}

/** Simple XAF formatter matching the mobile app's `fmtNumber`. */
const fmtXaf = (n: number) => `${Math.round(n).toLocaleString('es')} XAF`;
const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export function PlanActivatedEmail({
  userName,
  planLabel,
  amountXaf,
  expiresAt,
  invoiceRef,
}: Props) {
  return (
    <EmailLayout preview={`Plan ${planLabel} activado — factura ${invoiceRef}`}>
      <Heading style={styles.heading}>¡Plan {planLabel} activado!</Heading>
      <Text style={styles.body}>
        Hola {userName}, hemos activado tu plan <strong>{planLabel}</strong>. A
        continuación tienes el detalle de tu pago:
      </Text>

      <Section style={styles.invoice}>
        <Row label="Concepto" value={`Plan ${planLabel}`} />
        <Row label="Importe" value={fmtXaf(amountXaf)} />
        {expiresAt && <Row label="Vigente hasta" value={fmtDate(expiresAt)} />}
        <Row label="Referencia" value={invoiceRef} />
      </Section>

      <Text style={styles.body}>
        Ya puedes disfrutar de las ventajas del plan {planLabel} desde la app.
        Guarda este email como comprobante.
      </Text>
    </EmailLayout>
  );
}

export const planActivatedSubject = (planLabel: string) =>
  `Plan ${planLabel} activado — Bomelh`;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Section style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
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
  invoice: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: '16px 20px',
    margin: '0 0 20px',
  },
  row: {
    borderBottom: '1px solid #e5e7eb',
    padding: '8px 0',
  },
  rowLabel: {
    fontSize: 12,
    color: '#6b7280',
    margin: 0,
  },
  rowValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: 600,
    margin: '2px 0 0',
  },
};
