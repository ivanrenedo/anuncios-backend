export function isValidPhone(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-()]/g, '');
}
