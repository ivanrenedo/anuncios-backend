import * as React from 'react';
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface Props {
  /** Snippet shown as the email's preview text in inbox list rows. */
  preview: string;
  children: React.ReactNode;
  /** Signed unsubscribe URL — rendered only for marketing templates. */
  unsubscribeUrl?: string;
}

/**
 * Shared shell used by every template: HTML skeleton, brand header, footer
 * with the unsubscribe link (when applicable). Templates only supply the
 * body — no need to repeat the layout in each file.
 */
export function EmailLayout({ preview, children, unsubscribeUrl }: Props) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.brand}>Bomelh</Text>
          </Section>

          <Section style={styles.content}>{children}</Section>

          <Hr style={styles.hr} />

          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Bomelh — Anuncios clasificados en Guinea Ecuatorial
            </Text>
            {unsubscribeUrl && (
              <Text style={styles.footerText}>
                Si no quieres recibir más comunicaciones comerciales,{' '}
                <Link href={unsubscribeUrl} style={styles.link}>
                  cancela la suscripción
                </Link>
                .
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    backgroundColor: '#f5f5f5',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    margin: 0,
    padding: 0,
  },
  container: {
    maxWidth: 560,
    margin: '0 auto',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    padding: '20px 32px',
    backgroundColor: '#004940',
  },
  brand: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 800,
    margin: 0,
    letterSpacing: -0.3,
  },
  content: {
    padding: '32px',
  },
  hr: {
    border: 'none',
    borderTop: '1px solid #e5e7eb',
    margin: '0 32px',
  },
  footer: {
    padding: '16px 32px 24px',
  },
  footerText: {
    color: '#6b7280',
    fontSize: 12,
    margin: '4px 0',
  },
  link: {
    color: '#004940',
    textDecoration: 'underline',
  },
};
