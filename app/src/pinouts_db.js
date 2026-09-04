// Comprehensive Automotive Electronics Pinout & Test Point Database
// Standards: ISO 11898, ISO 16750, ISO 14229, AEC-Q100/101, IPC-A-610 Class 3

export const PINOUTS_DATABASE = [
  {
    part_no: 'TJA1055T/3',
    part_code: '1111097',
    name_fa: 'ترنسیور شبکه CAN تحمل‌پذیر خطا (Fault-Tolerant Low Speed CAN)',
    package: 'SO-14',
    standards: 'ISO 11898-3 / AEC-Q100',
    key_pins: [
      { pin: 1, name: 'RXD', desc: 'خروجی دیتای دیجیتال به میکروکنترلر (سطح ولتاژ ۵ ولت در حالت Idle)' },
      { pin: 4, name: 'TXD', desc: 'ورودی دیتای ارسالی از میکروکنترلر (سطح منطقی High در حالت Recessive)' },
      { pin: 3, name: 'VCC', desc: 'تغذیه رگوله شده دیجیتال ۵ ولت (محدوده مجاز استاندارد: ۴.۷۵ تا ۵.۲۵ ولت)' },
      { pin: 10, name: 'BAT', desc: 'تغذیه مستقیم باتری خودرو (۹ تا ۱۸ ولت)' },
      { pin: 6, name: 'CAN_H', desc: 'خط دیتای CAN بالا (در حالت Idle حدود ۰ ولت، در ارسال دیتای Dominant حدود ۳.۶ تا ۴.۰ ولت)' },
      { pin: 7, name: 'CAN_L', desc: 'خط دیتای CAN پایین (در حالت Idle حدود ۵ ولت، در ارسال دیتای Dominant حدود ۱.۰ تا ۱.۴ ولت)' },
      { pin: 5, name: 'ERR_N', desc: 'خروجی پرچم خطا (Active Low؛ در صورت بروز اتصال کوتاه باس به زمین یا ۱۲V، روی ۰V می‌افتد)' },
      { pin: 8, name: 'STB', desc: 'پایه فعال‌ساز حالت آماده‌باش (Standby Mode)' },
      { pin: 2, name: 'GND', desc: 'اتصال به زمین مدار (مقاومت تا شاسی ۰ اهم)' },
    ],
    test_procedure_fa: '۱. تست ولتاژ ۵ ولت پایه ۳ (VCC) و ۱۲ ولت پایه ۱۰ (BAT). ۲. اندازه‌گیری مقاومت CAN_H و CAN_L نسبت به زمین (نباید اتصال کوتاه ۰ اهم باشد). ۳. بررسی ولتاژ پایه ۵ (ERR_N)؛ اگر ۰ ولت باشد نشانه قطعی در باس یا سوختن دیود PESD2CAN است.',
  },
  {
    part_no: 'TJA1040T / TJA1042',
    part_code: '1111098',
    name_fa: 'ترنسیور شبکه CAN پرسرعت (High-Speed CAN Transceiver up to 1Mbps)',
    package: 'SOIC-8',
    standards: 'ISO 11898-2 / AEC-Q100',
    key_pins: [
      { pin: 1, name: 'TXD', desc: 'ورودی داده از میکروکنترلر' },
      { pin: 2, name: 'GND', desc: 'زمین مشترک مدار' },
      { pin: 3, name: 'VCC', desc: 'تغذیه ۵.۰ ولت رگوله شده' },
      { pin: 4, name: 'RXD', desc: 'خروجی داده به میکروکنترلر' },
      { pin: 5, name: 'SPLIT / VIO', desc: 'ولتاژ مرجع تثبیت تفاضلی ۲.۵ ولت یا تغذیه I/O' },
      { pin: 6, name: 'CAN_L', desc: 'خط تفاضلی پایین (Recessive = 2.5V, Dominant = 1.5V)' },
      { pin: 7, name: 'CAN_H', desc: 'خط تفاضلی بالا (Recessive = 2.5V, Dominant = 3.5V)' },
      { pin: 8, name: 'STB / S', desc: 'پایه کنترل حالت خاموش/فعال (Silent/Standby)' },
    ],
    test_procedure_fa: '۱. در وضعیت سکون (Recessive) ولتاژ هر دو پایه ۶ و ۷ باید حدود ۲.۵ ولت با تفاضل نزدیک به ۰ ولت باشد. ۲. در ارسال داده (Dominant)، ولتاژ CAN_H تا ۳.۵ ولت بالا رفته و CAN_L تا ۱.۵ ولت افت می‌کند (V_diff = 2.0V). ۳. مقاومت بین پایه‌های ۶ و ۷ با باتری قطع باید ۶۰ اهم (دو مقاومت ۱۲۰ اهم موازی) باشد.',
  },
  {
    part_no: 'TLE9263BQXV33',
    part_code: '1111095',
    name_fa: 'آی‌سی مدیریت تغذیه و کنترلر شبکه (SBC PMIC System Basis Chip)',
    package: 'VQFN-48',
    standards: 'ISO 26262 ASIL-B / AEC-Q100',
    key_pins: [
      { pin: 'VS', name: 'VS', desc: 'ورودی اصلی ولتاژ باتری (۹ تا ۱۶ ولت با فیلتر لوددامپ)' },
      { pin: 'VCC1', name: 'VCC1', desc: 'خروجی رگولاتور ولتاژ اصلی ۳.۳ ولت میکروکنترلر (تست روی خازن خروجی C151)' },
      { pin: 'VCC2', name: 'VCC2', desc: 'خروجی تغذیه ۵ ولت مستقل برای سنسورها و ترنسیورهای خارجی' },
      { pin: 'RSTN', name: 'RSTN', desc: 'خروجی ریست سخت‌افزاری پردازنده (باید ۳.۳V ثابت باشد)' },
      { pin: 'WAKE', name: 'WAKE', desc: 'ورودی بیدارباش سخت‌افزاری با سطح ولتاژ High/Low' },
      { pin: 'WD', name: 'WD_TRIG', desc: 'ورودی پالس‌های تایمر ناظر Watchdog از میکرو' },
    ],
    test_procedure_fa: '۱. ولتاژ ورودی VS را چک کنید. ۲. ولتاژ ریل ۳.۳ ولت VCC1 را روی خازن C151 اندازه بگیرید (اگر کمتر از ۳.۱ ولت باشد یا داغ کند، اتصال کوتاه در هسته میکرو وجود دارد). ۳. پالس‌های پایه ریست RSTN را با اسیلوسکوپ بررسی کنید.',
  },
  {
    part_no: 'TLE4275G',
    part_code: '1110502',
    name_fa: 'رگولاتور ولتاژ خودرویی ۵ ولت با مدار تاخیر ریست (5V LDO Regulator with Reset)',
    package: 'TO-263 / TO-252',
    standards: 'ISO 16750-2 / AEC-Q100 Grade 1',
    key_pins: [
      { pin: 1, name: 'I (Input)', desc: 'ورودی ولتاژ باتری ۱۲ ولت (تحمل تا ۴۵ ولت اضافه ولتاژ)' },
      { pin: 2, name: 'RO (Reset Out)', desc: 'خروجی ریست با مقاومت پول‌آپ (در عملکرد عادی ۵.۰ ولت)' },
      { pin: 3, name: 'GND', desc: 'اتصال زمین و هیت‌سینک حرارتی' },
      { pin: 4, name: 'D (Delay)', desc: 'متصل به خازن سرامیکی تاخیر ریست' },
      { pin: 5, name: 'Q (Output)', desc: 'خروجی تثبیت‌شده ۵.۰ ولت دقیق (حداکثر جریان ۴۵۰ میلی‌آمپر)' },
    ],
    test_procedure_fa: '۱. ولتاژ خروجی پایه ۵ (Q) باید بین ۴.۹۰ تا ۵.۱۰ ولت باشد. ۲. اگر ولتاژ خروجی زیر ۴.۶۵ ولت افت کند، پایه ۲ (Reset) بلافاصله صفر ولت می‌شود و میکروکنترلر ریست می‌گردد. ۳. ریپل ولتاژ خروجی با اسیلوسکوپ نباید بیش از ۳۰ میلی‌ولت باشد.',
  },
  {
    part_no: 'BTS7030-2EPA',
    part_code: '1110506',
    name_fa: 'سوئیچ هوشمند قدرت دو کاناله بالا (PROFET+2 Smart High-Side Switch)',
    package: 'TSDSO-14',
    standards: 'ISO 7637-2 / AEC-Q100',
    key_pins: [
      { pin: 'VS', name: 'VS', desc: 'ورودی قدرت متصل به ریل ۱۲ ولت باتری' },
      { pin: 'OUT0,1', name: 'OUT', desc: 'خروجی‌های توان به عملگرها، رله‌ها و بارها' },
      { pin: 'IN0,1', name: 'IN', desc: 'ورودی‌های فرمان دیجیتال ۳.۳V یا ۵V از پورت‌های PWM میکرو' },
      { pin: 'IS', name: 'IS', desc: 'خروجی متناسب حسگر جریان مصرفی (Current Sense Diagnostic)' },
      { pin: 'DEN', name: 'DEN', desc: 'فعال‌ساز مدار عیب‌یابی و خواندن جریان' },
    ],
    test_procedure_fa: '۱. اعمال پالس ۵ ولت به پایه IN باید خروجی OUT را به ۱۲ ولت متصل کند. ۲. در صورت اتصال کوتاه بار، سنسور حرارتی داخلی خروجی را قطع کرده و پایه IS جریان خطای ماکزیمم گزارش می‌دهد. ۳. ولتاژ کلمپ سلفی (Flyback) هنگام خاموش شدن بوبین‌ها بررسی شود.',
  },
  {
    part_no: 'PESD2CAN',
    part_code: '1110630',
    name_fa: 'آرایه دیودی دوطرفه محافظت در برابر الکتریسیته ساکن (TVS ESD Protection)',
    package: 'SOT-23-3',
    standards: 'IEC 61000-4-2 (±23kV Contact/Air) / AEC-Q101',
    key_pins: [
      { pin: 1, name: 'Anode 1', desc: 'متصل به خط CAN_H' },
      { pin: 2, name: 'Anode 2', desc: 'متصل به خط CAN_L' },
      { pin: 3, name: 'Cathode/GND', desc: 'متصل به پد زمین (GND) مدار' },
    ],
    test_procedure_fa: 'تست دیودی در وضعیت خاموش: بین پایه ۱ به ۳ و پایه ۲ به ۳ باید در وضعیت سالم تست دیود حدود ۰.۶ تا ۰.۷ ولت نشان دهد. در صورت نمایش ۰ ولت یا بیزر ممتد، دیود در اثر شوک ولتاژ سوخته و خط شبکه را زمین کرده است و باید بلافاصله از مدار خارج گردد.',
  },
  {
    part_no: 'R7F7015834AFP / SAK-XC2060N',
    part_code: '1110519',
    name_fa: 'میکروکنترلر ۳۲ بیتی خودرویی با کارایی بالا (Automotive 32-bit MCU)',
    package: 'LFQFP-144 / LQFP-100',
    standards: 'ISO 26262 ASIL-D / AEC-Q100 Grade 1',
    key_pins: [
      { pin: 'VDD', name: 'VDD / VDDIO', desc: 'تغذیه ۳.۳ ولت پورت‌های ورودی/خروجی و هسته دیجیتال' },
      { pin: 'VDDA', name: 'VDDA / VREF', desc: 'تغذیه مرجع آنالوگ ۵.۰ ولت مبدل آنالوگ به دیجیتال (ADC)' },
      { pin: 'RESET', name: 'RESET / RSTIN_N', desc: 'پایه ریست فعال با سطح صفر (در کارکرد نرمال ۳.۳V ثابت)' },
      { pin: 'XTAL', name: 'XTAL1 / XTAL2', desc: 'پایه‌های نوسان‌ساز کریستال ساعت (۲۰MHz یا ۴۰MHz)' },
      { pin: 'SWD/JTAG', name: 'DEBUG_PORT', desc: 'پورت عیب‌یابی و پروگرامینگ سخت‌افزاری' },
    ],
    test_procedure_fa: '۱. تست ولتاژهای VDD (۳.۳V) و VDDA (۵.۰V). ۲. مشاهده موج سینوسی کریستال روی پایه‌های XTAL با اسیلوسکوپ ۱۰۰MHz. ۳. بررسی پایداری پایه ریست (نباید نوسان یا ریست مکرر داشته باشد). ۴. بازرسی چشمی میکروسکوپی پایه‌ها از نظر پل قلع یا قلع‌مردگی طبق IPC Class 3.',
  },
  {
    part_no: 'LM2903 / LM2904',
    part_code: '1110508',
    name_fa: 'مقایسه‌کننده و تقویت‌کننده تفاضلی دو کاناله خودرویی (Dual Comparator / Op-Amp)',
    package: 'SOIC-8',
    standards: 'AEC-Q100 Grade 1 (-40°C to +125°C)',
    key_pins: [
      { pin: 8, name: 'VCC', desc: 'تغذیه ورودی (۵V یا ۱۲V)' },
      { pin: 4, name: 'GND', desc: 'زمین مدار' },
      { pin: '2, 6', name: 'IN- (Inverting)', desc: 'ورودی معکوس‌کننده سیگنال یا ولتاژ مرجع' },
      { pin: '3, 5', name: 'IN+ (Non-Inverting)', desc: 'ورودی غیرمعکوس‌کننده متصل به سنسور' },
      { pin: '1, 7', name: 'OUT', desc: 'خروجی کلکتور باز (Open-Collector) نیازمند مقاومت پول‌آپ' },
    ],
    test_procedure_fa: '۱. بررسی مقایسه ولتاژهای پایه‌های ۲ و ۳: هرگاه ولتاژ IN+ بیشتر از IN- باشد، خروجی OUT باید High (۵V با مقاومت پول‌آپ) شود. ۲. بررسی سلامت مقاومت پول‌آپ ۴.۷ کیلو اهم متصل به خروجی.',
  },
  {
    part_no: 'BUK9Y19-75B',
    part_code: '1110625',
    name_fa: 'ترانزیستور ماسفت قدرت خودرویی (Automotive TrenchMOS N-Channel Power MOSFET)',
    package: 'LFPAK56 / Power-SO8',
    standards: 'AEC-Q101 (75V, 46A, RDS(on) = 19mΩ)',
    key_pins: [
      { pin: 4, name: 'Gate (G)', desc: 'پایه گیت تحریک (ولتاژ فرمان ۴.۵V تا ۱۰V)' },
      { pin: '1,2,3', name: 'Source (S)', desc: 'پایه سورس متصل به زمین یا مسیر شنت جریان' },
      { pin: '5,6,7,8', name: 'Drain (D)', desc: 'پایه درین متصل به بار سلفی/موتور/انژکتور' },
    ],
    test_procedure_fa: '۱. تست دیود هرزگرد داخلی بین درین و سورس (در وضعیت خاموش حدود ۰.۵V). ۲. اعمال ولتاژ ۵ ولت به گیت باید مقاومت درین-سورس را به زیر ۰.۰۵ اهم کاهش دهد. ۳. در صورت اتصال کوتاه گیت به سورس یا درین، ماسفت سوخته است.',
  },
];

export function getPinoutData(partCodeOrNo) {
  if (!partCodeOrNo) return null;
  const q = partCodeOrNo.toLowerCase().trim();
  return PINOUTS_DATABASE.find(
    (p) => p.part_code.toLowerCase() === q || p.part_no.toLowerCase().includes(q) || q.includes(p.part_no.toLowerCase())
  );
}
