// Key Component Test Points & Pinout Guide for PCBA / Electronics
export const PINOUTS_DATABASE = [
  {
    part_no: 'TJA1055T/3',
    part_code: '1111097',
    name_fa: 'ترنسیور شبکه CAN تحمل‌پذیر خطا (Fault-Tolerant CAN)',
    package: 'SO-14',
    key_pins: [
      { pin: 1, name: 'RXD', desc: 'خروجی دیتای دریافتی به میکروکنترلر (معمولاً ۵ ولت در حالت Idle)' },
      { pin: 4, name: 'TXD', desc: 'ورودی دیتای ارسالی از میکروکنترلر (High در حالت Recessive)' },
      { pin: 3, name: 'VCC', desc: 'تغذیه دیجیتال ۵ ولت رگوله شده (تست ولتاژ با مولتی‌متر: ۴.۷۵ تا ۵.۲۵ ولت)' },
      { pin: 10, name: 'BAT', desc: 'تغذیه مستقیم باتری ۱۲ ولت خودرو' },
      { pin: 6, name: 'CAN_H', desc: 'خط دیتای CAN بالا (در حالت Idle حدود ۰ ولت، در ارسال حدود ۴ ولت)' },
      { pin: 7, name: 'CAN_L', desc: 'خط دیتای CAN پایین (در حالت Idle حدود ۵ ولت، در ارسال حدود ۱ ولت)' },
      { pin: 5, name: 'ERR_N', desc: 'خروجی پرچم خطا (Active Low؛ اگر صفر ولت باشد یعنی باس خطا دارد)' },
      { pin: 2, name: 'GND', desc: 'زمین مدار (اتصال با بدنه ۰ اهم)' },
    ],
    test_procedure_fa: '۱. تست ولتاژ ۵ ولت پایه ۳ (VCC) و ۱۲ ولت پایه ۱۰ (BAT). ۲. اندازه‌گیری مقاومت CAN_H و CAN_L نسبت به زمین (نباید اتصال کوتاه باشد). ۳. بررسی ولتاژ پایه ۵ (ERR_N)؛ اگر ۰ ولت است نشانه اتصال کوتاه خطوط باس یا خرابی دیود ESD است.',
  },
  {
    part_no: 'TLE9263BQXV33',
    part_code: '1111095',
    name_fa: 'آی‌سی مدیریت تغذیه و رابط شبکه (SBC PMIC)',
    package: 'VQFN-48',
    key_pins: [
      { pin: 'VS', name: 'VS', desc: 'ورودی اصلی ولتاژ باتری خودرو (۹ تا ۱۶ ولت)' },
      { pin: 'VCC1', name: 'VCC1', desc: 'خروجی تغذیه اصلی میکروکنترلر (۳.۳ ولت پایدار)' },
      { pin: 'VCC2', name: 'VCC2', desc: 'خروجی تغذیه سنسورها یا ترنسیورهای خارجی (۵ ولت)' },
      { pin: 'RSTN', name: 'RSTN', desc: 'خروجی ریست سخت‌افزاری به میکروکنترلر (در حالت عادی ۳.۳ ولت)' },
      { pin: 'WAKE', name: 'WAKE', desc: 'پایه بیدارباش مدار از حالت Sleep با سیگنال تحریک' },
      { pin: 'CANH/L', name: 'CAN', desc: 'خطوط تفاضلی شبکه CAN سرعت بالا' },
    ],
    test_procedure_fa: '۱. تست ولتاژ پایه VS (۱۲ ولت). ۲. تست ولتاژ خروجی ۳.۳ ولت روی خازن C151 (VCC1). اگر ولتاژ صفر است یا داغ می‌کند، مسیر تغذیه میکرو اتصالی دارد. ۳. بررسی سیگنال ریست RSTN با اسیلوسکوپ.',
  },
  {
    part_no: 'BTS7030-2EPA',
    part_code: '1110506',
    name_fa: 'سوئیچ هوشمند قدرت بالا (High-Side Smart Switch)',
    package: 'TSDSO-14',
    key_pins: [
      { pin: 'VS', name: 'VS', desc: 'ولتاژ ورودی قدرت (۱۲ ولت باتری)' },
      { pin: 'OUT0,1', name: 'OUT', desc: 'خروجی توان به بار (عملگرها، لامپ‌ها، بوبین‌ها)' },
      { pin: 'IN0,1', name: 'IN', desc: 'ورودی فرمان دیجیتال ۳.۳V یا ۵V از میکرو' },
      { pin: 'IS', name: 'IS', desc: 'خروجی حسگر جریان مصرفی (Current Sense)' },
      { pin: 'DEN', name: 'DEN', desc: 'فعال‌ساز مدار عیب‌یابی تشخیصی' },
    ],
    test_procedure_fa: '۱. ولتاژ ورودی VS را چک کنید. ۲. هنگام ارسال پالس فعال‌ساز به پایه IN، خروجی OUT باید ۱۲ ولت شود. اگر جریان بیش از حد کشیده شود، حفاظت حرارتی خروجی را قطع می‌کند.',
  },
  {
    part_no: 'PESD2CAN',
    part_code: '1110630',
    name_fa: 'دیود محافظت دوتایی ESD برای خطوط شبکه CAN',
    package: 'SOT-23-3',
    key_pins: [
      { pin: 1, name: 'Anode 1', desc: 'متصل به خط CAN_H' },
      { pin: 2, name: 'Anode 2', desc: 'متصل به خط CAN_L' },
      { pin: 3, name: 'Cathode/GND', desc: 'متصل به زمین (GND) برد' },
    ],
    test_procedure_fa: 'تست دیودی با مولتی‌متر در وضعیت خاموش: بین پایه ۱ به ۳ و پایه ۲ به ۳ باید حالت دیودی سالم (حدود ۰.۶ تا ۰.۷ ولت) خوانده شود. در صورت اتصال کوتاه (۰ ولت)، دیود سوخته و باس را زمین کرده است و باید تعویض شود.',
  },
  {
    part_no: 'R7F7015834AFP',
    part_code: '1110519',
    name_fa: 'میکروکنترلر ۳۲ بیتی خودرویی RH850/F1K',
    package: 'LFQFP-144',
    key_pins: [
      { pin: 'VDD', name: 'VDD', desc: 'تغذیه ۳.۳ ولت هسته و پورت‌ها' },
      { pin: 'RESET', name: 'RESET', desc: 'پایه ریست (باید ۳.۳ ولت High باشد)' },
      { pin: 'XTAL', name: 'XTAL/EXTAL', desc: 'متصل به کریستال ۲۰ مگاهرتز X100' },
      { pin: 'FLMD0', name: 'FLMD0', desc: 'حالت پروگرامینگ حافظه فلش' },
    ],
    test_procedure_fa: '۱. تست ولتاژ ۳.۳ ولت روی پایه‌های VDD. ۲. بررسی فرکانس ۲۰ مگاهرتز روی کریستال X100 با اسیلوسکوپ. ۳. تست ولتاژ پایه RESET (اگر پایین باشد میکرو در ریست دائم است).',
  },
];

export function getPinoutData(partCodeOrNo) {
  if (!partCodeOrNo) return null;
  const q = partCodeOrNo.toLowerCase().trim();
  return PINOUTS_DATABASE.find(
    (p) => p.part_code.toLowerCase() === q || p.part_no.toLowerCase().includes(q) || q.includes(p.part_no.toLowerCase())
  );
}
