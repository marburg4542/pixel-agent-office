// Email templates — structure ported from WMS (tables + inline styles, because Gmail/Outlook strip
// <style> and don't support flex/grid), restyled in the Pixel Agent Office look and made bilingual.
// Everything that comes from users (names, emails, links) goes through escapeHtml.
import type { Lang } from '../../shared/types';

export const APP_NAME = 'Pixel Agent Office';

const COLOR = {
  ink: '#2a1e2e',
  panel: '#2f2a44',
  paper: '#fdf6e3',
  paper2: '#f4e9d0',
  accent: '#ffe066',
  blue: '#4f7cf0',
  muted: '#6b5f73',
  page: '#1b1726',
};
const TONE = {
  info: { bg: '#eaf0ff', bar: '#4f7cf0', text: '#243b7a' },
  success: { bg: '#e7f8ee', bar: '#3fae6a', text: '#1d5e38' },
  warning: { bg: '#fff5d6', bar: '#f0a030', text: '#7a4a08' },
  danger: { bg: '#fdeaea', bar: '#d8453e', text: '#7a1f1b' },
};
const FONT = "'Chakra Petch','Sarabun','Leelawadee UI',Tahoma,Arial,sans-serif";

export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export const formatDateTime = (lang: Lang, date = new Date()) =>
  lang === 'th'
    ? `${date.toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Bangkok' })} น.`
    : date.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

type Block =
  | { type: 'p' | 'small'; text: string }
  | { type: 'notice'; tone: keyof typeof TONE; text: string }
  | { type: 'details'; rows: [string, string][] }
  | { type: 'button'; label: string; url: string }
  | { type: 'link'; url: string };

const htmlBlock = (b: Block): string => {
  switch (b.type) {
    case 'p':
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.75;color:${COLOR.ink};">${escapeHtml(b.text)}</p>`;
    case 'small':
      return `<p style="margin:0 0 12px;font-family:${FONT};font-size:13px;line-height:1.7;color:${COLOR.muted};">${escapeHtml(b.text)}</p>`;
    case 'notice': {
      const tone = TONE[b.tone];
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;">
  <tr><td style="background:${tone.bg};border:3px solid ${COLOR.ink};border-left:8px solid ${tone.bar};padding:14px 18px;font-family:${FONT};font-size:14px;line-height:1.7;color:${tone.text};">${escapeHtml(b.text)}</td></tr>
</table>`;
    }
    case 'details': {
      const rows = b.rows
        .map(([label, value], i) => {
          const line = i < b.rows.length - 1 ? `border-bottom:2px dashed ${COLOR.paper2};` : '';
          return `<tr>
    <td width="36%" style="padding:10px 14px;${line}font-family:${FONT};font-size:14px;color:${COLOR.muted};vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:10px 14px;${line}font-family:${FONT};font-size:14px;color:${COLOR.ink};font-weight:700;word-break:break-word;">${escapeHtml(value)}</td>
  </tr>`;
        })
        .join('\n  ');
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;border:3px solid ${COLOR.ink};background:#fffdf6;">
  ${rows}
</table>`;
    }
    case 'button':
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr><td align="center" bgcolor="${COLOR.blue}" style="background:${COLOR.blue};border:3px solid ${COLOR.ink};box-shadow:4px 4px 0 ${COLOR.ink};">
    <a href="${escapeHtml(b.url)}" target="_blank" style="display:inline-block;padding:12px 34px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(b.label)}</a>
  </td></tr>
</table>`;
    case 'link':
      return `<p style="margin:0 0 24px;font-family:${FONT};font-size:13px;line-height:1.6;word-break:break-all;"><a href="${escapeHtml(b.url)}" target="_blank" style="color:${COLOR.blue};">${escapeHtml(b.url)}</a></p>`;
  }
};

const textBlock = (b: Block): string => {
  switch (b.type) {
    case 'details':
      return b.rows.map(([label, value]) => `${label}: ${value}`).join('\n');
    case 'button':
      return `${b.label}: ${b.url}`;
    case 'link':
      return b.url;
    case 'notice':
      return `** ${b.text} **`;
    default:
      return b.text;
  }
};

interface Content {
  lang: Lang;
  preheader: string;
  heading: string;
  name: string;
  blocks: Block[];
  footnotes?: string[];
}

const words = (lang: Lang) =>
  lang === 'th'
    ? { dear: 'สวัสดีคุณ', signOff: ['ขอบคุณที่ใช้งาน', `ทีมงาน ${APP_NAME}`], auto: 'อีเมลฉบับนี้ส่งจากระบบอัตโนมัติ กรุณาอย่าตอบกลับ', tagline: 'ออฟฟิศของทีม AI' }
    : { dear: 'Hi', signOff: ['Thanks,', `The ${APP_NAME} team`], auto: 'This is an automated email, please do not reply.', tagline: 'Your AI team’s office' };

// A tiny pixel character drawn with table cells — renders in every mail client, no images needed.
const pixelLogo = () => {
  const P = ['..hhhh..', '.hssssh.', '.sesses.', '.ssssss.', '..tttt..', '.tttttt.'];
  const pal: Record<string, string> = { h: '#4a3024', s: '#f6c9a3', e: COLOR.ink, t: COLOR.blue };
  const rows = P.map(
    (r) => `<tr>${[...r].map((c) => `<td width="4" height="4" style="width:4px;height:4px;font-size:0;line-height:0;${c === '.' ? '' : `background:${pal[c]};`}"></td>`).join('')}</tr>`,
  ).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
};

const renderHtml = (c: Content) => {
  const w = words(c.lang);
  return `<!DOCTYPE html>
<html lang="${c.lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(c.heading)}</title></head>
<body style="margin:0;padding:0;background:${COLOR.page};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;">${escapeHtml(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.page};">
<tr><td align="center" style="padding:32px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${COLOR.paper};border:4px solid ${COLOR.ink};">
    <tr><td style="background:${COLOR.panel};padding:14px 22px;border-bottom:4px solid ${COLOR.ink};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" style="padding-right:12px;">${pixelLogo()}</td>
        <td valign="middle" style="font-family:${FONT};font-size:18px;font-weight:700;color:${COLOR.accent};letter-spacing:1px;">${APP_NAME}<br><span style="font-size:12px;color:#c9bfd9;font-weight:400;letter-spacing:0;">${escapeHtml(w.tagline)}</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:28px 32px 8px;">
      <h1 style="margin:0 0 18px;font-family:${FONT};font-size:22px;line-height:1.45;font-weight:700;color:${COLOR.ink};">${escapeHtml(c.heading)}</h1>
      <p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.75;color:${COLOR.ink};">${escapeHtml(w.dear)} ${escapeHtml(c.name)}</p>
      ${c.blocks.map(htmlBlock).join('\n      ')}
    </td></tr>
    <tr><td style="padding:0 32px 26px;">
      <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.75;color:${COLOR.ink};">${escapeHtml(w.signOff[0])}<br><strong>${escapeHtml(w.signOff[1])}</strong></p>
      ${
        c.footnotes?.length
          ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr><td style="border-top:2px dashed ${COLOR.paper2};padding-top:14px;">${c.footnotes
              .map((f) => `<p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:1.7;color:${COLOR.muted};">${escapeHtml(f)}</p>`)
              .join('')}</td></tr></table>`
          : ''
      }
    </td></tr>
    <tr><td align="center" style="background:${COLOR.paper2};border-top:4px solid ${COLOR.ink};padding:14px 24px;font-family:${FONT};font-size:12px;line-height:1.7;color:${COLOR.muted};">${escapeHtml(w.auto)}</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
};

const renderText = (c: Content) => {
  const w = words(c.lang);
  return [c.heading, '', `${w.dear} ${c.name}`, '', ...c.blocks.map(textBlock).flatMap((x) => [x, '']), ...w.signOff, ...(c.footnotes?.length ? ['', ...c.footnotes] : []), '', '—', APP_NAME, w.auto].join('\n');
};

export interface EmailMessage {
  kind: string;
  subject: string;
  html: string;
  text: string;
}

const build = (kind: string, subject: string, content: Content): EmailMessage => ({
  kind,
  subject: `[${APP_NAME}] ${subject}`,
  html: renderHtml(content),
  text: renderText(content),
});

// ---------------------------------------------------------------------------

export const registrationReceivedEmail = ({ lang, username, email, at = new Date() }: { lang: Lang; username: string; email: string; at?: Date }) =>
  lang === 'th'
    ? build('registration', 'ได้รับคำขอสมัครใช้งานแล้ว', {
        lang,
        preheader: 'คำขอสมัครของคุณกำลังรอผู้ดูแลอนุมัติ',
        heading: 'ได้รับคำขอสมัครใช้งานของคุณแล้ว',
        name: username,
        blocks: [
          { type: 'p', text: `ขอบคุณที่สมัครใช้งาน ${APP_NAME} ระบบได้รับคำขอของคุณแล้ว และกำลังรอผู้ดูแลตรวจสอบ` },
          { type: 'details', rows: [['ชื่อผู้ใช้', username], ['อีเมล', email], ['สถานะ', 'รอการอนุมัติ'], ['วันที่สมัคร', formatDateTime(lang, at)]] },
          { type: 'notice', tone: 'info', text: 'คุณจะยังเข้าสู่ระบบไม่ได้จนกว่าบัญชีจะได้รับอนุมัติ เมื่อมีผลแล้วระบบจะแจ้งทางอีเมลอีกครั้ง' },
        ],
        footnotes: ['หากคุณไม่ได้สมัครใช้งาน กรุณาเพิกเฉยต่ออีเมลฉบับนี้'],
      })
    : build('registration', 'We received your sign-up', {
        lang,
        preheader: 'Your sign-up is waiting for an admin to approve it',
        heading: 'We received your sign-up',
        name: username,
        blocks: [
          { type: 'p', text: `Thanks for signing up to ${APP_NAME}. An admin will review your request shortly.` },
          { type: 'details', rows: [['Username', username], ['Email', email], ['Status', 'Waiting for approval'], ['Signed up', formatDateTime(lang, at)]] },
          { type: 'notice', tone: 'info', text: "You can't sign in until your account is approved. We'll email you as soon as it is." },
        ],
        footnotes: ["If you didn't sign up, you can ignore this email."],
      });

export const passwordResetEmail = ({ lang, username, resetLink, expiresInMinutes }: { lang: Lang; username: string; resetLink: string; expiresInMinutes: number }) =>
  lang === 'th'
    ? build('password_reset', 'คำขอตั้งรหัสผ่านใหม่', {
        lang,
        preheader: `ลิงก์ตั้งรหัสผ่านใหม่ ใช้ได้ภายใน ${expiresInMinutes} นาที`,
        heading: 'คำขอตั้งรหัสผ่านใหม่',
        name: username,
        blocks: [
          { type: 'p', text: 'ระบบได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่' },
          { type: 'button', label: 'ตั้งรหัสผ่านใหม่', url: resetLink },
          { type: 'notice', tone: 'warning', text: `ลิงก์นี้ใช้ได้ครั้งเดียว และหมดอายุภายใน ${expiresInMinutes} นาที` },
          { type: 'small', text: 'หากกดปุ่มไม่ได้ ให้คัดลอกลิงก์ด้านล่างไปเปิดในเบราว์เซอร์' },
          { type: 'link', url: resetLink },
        ],
        footnotes: ['หากคุณไม่ได้ส่งคำขอนี้ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ', 'กรุณาอย่าส่งต่ออีเมลฉบับนี้ให้ผู้อื่น'],
      })
    : build('password_reset', 'Reset your password', {
        lang,
        preheader: `Password reset link — valid for ${expiresInMinutes} minutes`,
        heading: 'Reset your password',
        name: username,
        blocks: [
          { type: 'p', text: 'We received a request to reset the password for your account. Press the button below to choose a new one.' },
          { type: 'button', label: 'Choose a new password', url: resetLink },
          { type: 'notice', tone: 'warning', text: `This link works once and expires in ${expiresInMinutes} minutes.` },
          { type: 'small', text: "If the button doesn't work, copy this link into your browser:" },
          { type: 'link', url: resetLink },
        ],
        footnotes: ["If you didn't ask for this, you can ignore it — your current password still works.", 'Please don’t forward this email.'],
      });

/**
 * Account status change — the wording depends on previous → new status, because the same admin
 * button means different things (approve vs. restore, reject vs. suspend). null = nothing to send.
 */
export const accountStatusEmail = ({
  lang,
  previousStatus,
  status,
  username,
  loginUrl,
  at = new Date(),
}: {
  lang: Lang;
  previousStatus: string;
  status: string;
  username: string;
  loginUrl: string;
  at?: Date;
}): EmailMessage | null => {
  const when = formatDateTime(lang, at);
  const th = lang === 'th';
  if (status === 'Active' && previousStatus === 'Pending') {
    return build('approved', th ? 'บัญชีของคุณได้รับการอนุมัติแล้ว' : 'Your account is approved', {
      lang,
      preheader: th ? 'เข้าสู่ระบบได้ทันที' : 'You can sign in now',
      heading: th ? 'บัญชีของคุณได้รับการอนุมัติแล้ว 🎉' : 'Your account is approved 🎉',
      name: username,
      blocks: [
        { type: 'p', text: th ? `คำขอสมัครใช้งาน ${APP_NAME} ของคุณได้รับการอนุมัติแล้ว ทีมเอเจนต์ตัวอย่างรออยู่ในออฟฟิศของคุณ` : `Your ${APP_NAME} account is approved. A starter team of agents is waiting in your office.` },
        { type: 'details', rows: th ? [['ชื่อผู้ใช้', username], ['วันที่อนุมัติ', when]] : [['Username', username], ['Approved', when]] },
        { type: 'button', label: th ? 'เข้าสู่ระบบ' : 'Sign in', url: loginUrl },
      ],
    });
  }
  if (status === 'Active' && previousStatus === 'Denied') {
    return build('restored', th ? 'บัญชีของคุณได้รับการคืนสิทธิ์แล้ว' : 'Your account is restored', {
      lang,
      preheader: th ? 'กลับมาเข้าสู่ระบบได้ตามปกติแล้ว' : 'You can sign in again',
      heading: th ? 'บัญชีของคุณได้รับการคืนสิทธิ์แล้ว' : 'Your account is restored',
      name: username,
      blocks: [
        { type: 'notice', tone: 'success', text: th ? 'คุณเข้าสู่ระบบได้ตามปกติตั้งแต่บัดนี้' : 'You can sign in as usual from now on.' },
        { type: 'details', rows: th ? [['ชื่อผู้ใช้', username], ['วันที่คืนสิทธิ์', when]] : [['Username', username], ['Restored', when]] },
        { type: 'button', label: th ? 'เข้าสู่ระบบ' : 'Sign in', url: loginUrl },
      ],
    });
  }
  if (status === 'Denied' && previousStatus === 'Pending') {
    return build('rejected', th ? 'ผลการพิจารณาคำขอสมัครใช้งาน' : 'About your sign-up', {
      lang,
      preheader: th ? 'แจ้งผลการพิจารณาคำขอสมัครของคุณ' : 'An update on your sign-up request',
      heading: th ? 'ผลการพิจารณาคำขอสมัครใช้งาน' : 'About your sign-up',
      name: username,
      blocks: [
        { type: 'p', text: th ? `คำขอสมัครใช้งาน ${APP_NAME} ของคุณไม่ได้รับการอนุมัติ` : `Your ${APP_NAME} sign-up request was not approved.` },
        { type: 'notice', tone: 'info', text: th ? 'หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อผู้ดูแลระบบ' : 'If you think this is a mistake, please contact the admin.' },
      ],
    });
  }
  if (status === 'Denied' && previousStatus === 'Active') {
    return build('suspended', th ? 'บัญชีของคุณถูกระงับการใช้งาน' : 'Your account is suspended', {
      lang,
      preheader: th ? 'บัญชีของคุณถูกระงับชั่วคราว' : 'Your account has been suspended',
      heading: th ? 'บัญชีของคุณถูกระงับการใช้งาน' : 'Your account is suspended',
      name: username,
      blocks: [
        { type: 'notice', tone: 'danger', text: th ? 'คุณจะเข้าสู่ระบบไม่ได้จนกว่าผู้ดูแลจะคืนสิทธิ์' : "You won't be able to sign in until an admin restores your account." },
        { type: 'details', rows: th ? [['ชื่อผู้ใช้', username], ['วันที่ระงับ', when]] : [['Username', username], ['Suspended', when]] },
      ],
    });
  }
  return null;
};
