// How a manager plans a task without AI: pick a role template from the words in the brief, then
// fill each role with one of the owner's agents. Groups of roles work in parallel.
import type { Agent, Lang, RoleId, Task } from '../../shared/types';

const TEMPLATES: [RegExp, RoleId[][]][] = [
  [/news|sentiment|social|stock|crypto|bitcoin|ข่าว|กระแส|ความเห็น|โซเชียล|หุ้น|คริปโต/i, [['analyst'], ['writer'], ['reviewer']]],
  [/landing|website|web ?page|homepage|เว็บไซต์|หน้าเว็บ|แลนดิ้ง/i, [['planner'], ['designer', 'writer'], ['reviewer']]],
  [/code|function|bug|api|script|app|โค้ด|ฟังก์ชัน|โปรแกรม|แอป|บั๊ก/i, [['planner'], ['coder'], ['tester'], ['reviewer']]],
  [/design|logo|ui|ux|poster|ออกแบบ|โลโก้|โปสเตอร์/i, [['designer'], ['reviewer']]],
  [/research|compare|market|survey|ค้นคว้า|เปรียบเทียบ|หาข้อมูล|วิจัย|สำรวจ/i, [['researcher'], ['writer'], ['reviewer']]],
  [/article|blog|post|caption|email|copy|บทความ|โพสต์|แคปชั่น|อีเมล|เขียน/i, [['writer'], ['reviewer']]],
  [/plan|roadmap|strategy|แผน|กลยุทธ์/i, [['planner'], ['reviewer']]],
];
const DEFAULT: RoleId[][] = [['planner'], ['writer'], ['reviewer']];

export function planFor(t: Task, team: Agent[], _lang: Lang): { steps: string[][]; template: RoleId[][] } {
  const text = `${t.title} ${t.description}`;
  const template = TEMPLATES.find(([re]) => re.test(text))?.[1] ?? DEFAULT;
  const used = new Set<string>();
  const pick = (role: RoleId) => {
    const a = team.find((x) => x.role === role && !used.has(x.id));
    if (a) used.add(a.id);
    return a?.id;
  };
  const steps = template.map((group) => group.map(pick).filter((id): id is string => !!id)).filter((g) => g.length);
  // Nobody fits the template: give it to the first teammate so it doesn't sit there.
  if (!steps.length && team[0]) steps.push([team[0].id]);
  return { steps, template };
}
