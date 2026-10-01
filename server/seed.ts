import type { Agent, Lang, Note, Task } from '../shared/types';
import { uid } from '../shared/util';

type NewTask = Partial<Task> & Pick<Task, 'title' | 'scope' | 'ownerId'>;

export function makeTask(partial: NewTask): Task {
  const now = Date.now();
  return {
    id: uid(),
    ownerName: '',
    description: '',
    priority: 'med',
    size: 'M',
    pipeline: [],
    stage: 0,
    stageProgress: 0,
    active: false,
    column: 'todo',
    requireReview: true,
    outputs: [],
    log: [{ at: now, key: 'log_created' }],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** Starter team so a new office feels alive on first sign-in. */
export function createSeed(lang: Lang, ownerId: number): { agents: Agent[]; tasks: Task[]; notes: Note[] } {
  const now = Date.now();
  const th = lang === 'th';
  const agent = (a: Omit<Agent, 'id' | 'createdAt' | 'ownerId'>): Agent => ({ id: uid(), ownerId, createdAt: now, ...a });

  const nova = agent({
    name: 'Nova', role: 'planner', modelId: 'claude-opus-5', desk: 0,
    instructions: th ? 'แตกงานใหญ่เป็นขั้นตอนที่ชัดเจน ระบุสิ่งที่ต้องส่งมอบในแต่ละขั้น' : 'Break big goals into clear steps with concrete deliverables.',
    look: { skin: 1, hair: 5, hairColor: 9, eyes: 1, top: 3, topColor: 6, bottomColor: 2, acc: 1, accColor: 0 },
  });
  const byte = agent({
    name: 'Byte', role: 'coder', modelId: 'claude-sonnet-5', desk: 1,
    instructions: th ? 'เขียนโค้ดที่อ่านง่าย มีการจัดการ error และตัวอย่างการใช้งาน' : 'Write readable code with error handling and a usage example.',
    look: { skin: 3, hair: 1, hairColor: 0, eyes: 0, top: 1, topColor: 3, bottomColor: 0, acc: 3, accColor: 0 },
  });
  const pixel = agent({
    name: 'Pixel', role: 'designer', modelId: 'gemini-3.8-flash', desk: 2,
    instructions: th ? 'ออกแบบให้สวยและใช้งานง่าย อธิบายเหตุผลของการเลือกสีและเลย์เอาต์' : 'Design for clarity and delight; explain color and layout choices.',
    look: { skin: 0, hair: 3, hairColor: 6, eyes: 2, top: 4, topColor: 4, bottomColor: 4, acc: 6, accColor: 2 },
  });
  const quill = agent({
    name: 'Quill', role: 'writer', modelId: 'gpt-6-sol', desk: 4,
    instructions: th ? 'เขียนภาษาเป็นกันเอง กระชับ มีหัวข้อชัดเจน' : 'Friendly, concise writing with clear headings.',
    look: { skin: 2, hair: 2, hairColor: 4, eyes: 0, top: 6, topColor: 7, bottomColor: 1, acc: 0, accColor: 8 },
  });
  const sage = agent({
    name: 'Sage', role: 'reviewer', modelId: 'gpt-6-astra', desk: 5,
    instructions: th ? 'ตรวจความถูกต้อง ความครบถ้วน และให้ข้อเสนอแนะที่ทำได้จริง' : 'Check correctness and completeness; give actionable feedback.',
    look: { skin: 4, hair: 7, hairColor: 1, eyes: 3, top: 7, topColor: 5, bottomColor: 1, acc: 0, accColor: 5 },
  });
  const agents = [nova, byte, pixel, quill, sage];

  const base = { scope: 'personal' as const, ownerId };
  const landing = makeTask({
    ...base,
    title: th ? 'ออกแบบหน้า Landing page ร้านกาแฟ' : 'Design the coffee shop landing page',
    description: th ? 'หน้าแรกของเว็บไซต์ ต้องมีเมนูแนะนำ รีวิวลูกค้า และปุ่มสั่งซื้อที่เห็นชัด' : 'Home page with featured menu, customer reviews and a prominent order button.',
    pipeline: [nova.id, pixel.id, sage.id], size: 'M', priority: 'high', column: 'todo',
  });
  const discount = makeTask({
    ...base,
    title: th ? 'เขียนฟังก์ชันคำนวณส่วนลด' : 'Write the discount calculator',
    description: th ? 'รับราคาและโค้ดส่วนลด คืนราคาสุทธิ และจัดการโค้ดหมดอายุ' : 'Take a price and a coupon code, return the net price, handle expired codes.',
    pipeline: [byte.id, sage.id], size: 'S', priority: 'med', column: 'todo',
  });
  const article = makeTask({
    ...base,
    title: th ? 'บทความรีวิวเมล็ดกาแฟ 3 ชนิด' : 'Review article: 3 coffee beans',
    description: th ? 'เปรียบเทียบรสชาติ ราคา และเหมาะกับใคร' : 'Compare flavor, price and who each bean suits.',
    pipeline: [quill.id, sage.id], size: 'M', priority: 'low', column: 'todo',
  });
  const campaign = makeTask({
    ...base,
    title: th ? 'วางแผนแคมเปญโซเชียลเดือนหน้า' : "Plan next month's social campaign",
    description: th ? 'ธีม ตารางโพสต์ และไอเดียคอนเทนต์' : 'Theme, posting schedule and content ideas.',
    pipeline: [nova.id, quill.id], size: 'L', priority: 'med', column: 'backlog',
  });

  const note = (n: Pick<Note, 'text' | 'to' | 'color'> & { taskId?: string }): Note => ({
    id: uid(), scope: 'personal', createdBy: ownerId, createdByName: '', createdAt: now, readBy: [], ...n,
  });
  const notes: Note[] = [
    note({ to: pixel.id, taskId: landing.id, color: 0, text: th ? 'ใช้โทนสีน้ำตาลอบอุ่นให้เข้ากับร้านกาแฟนะ ☕' : 'Use warm brown tones to match the coffee shop ☕' }),
    note({ to: 'all', color: 3, text: th ? 'ทุกคน: เขียนผลงานให้กระชับ อ่านง่าย 🙏' : 'Everyone: keep results short and easy to read 🙏' }),
  ];

  return { agents, tasks: [landing, discount, article, campaign], notes };
}
