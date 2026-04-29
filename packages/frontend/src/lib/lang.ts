export function getDetectedLanguage(): string {
  const lang = navigator.language || 'en';
  return lang.startsWith('fr') ? 'fr' : 'en';
}
