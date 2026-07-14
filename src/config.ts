export const siteConfig = {
  name: 'Windy Hill (바람의 언덕)',
  baseUrl: 'https://windyhillkorea.com',
  locales: ['zh', 'en', 'ja', 'ko'] as const,
};

export const ogLocale: Record<string, string> = {
  zh: 'zh_CN',
  en: 'en_US',
  ja: 'ja_JP',
  ko: 'ko_KR',
};
