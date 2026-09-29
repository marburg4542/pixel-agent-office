import type { Request } from 'express';
import type { Lang } from '../shared/types';

/** The web app sends its UI language in X-Lang so server messages match it. */
export const reqLang = (req: Request): Lang => (req.get('x-lang') === 'en' ? 'en' : 'th');

/** Pick the message for the request's language. */
export const msg = (req: Request, th: string, en: string): string => (reqLang(req) === 'en' ? en : th);
