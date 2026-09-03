// DTC (Diagnostic Trouble Code) Knowledge Base for Iranian Automotive Platforms & Electronics
export const DTC_DATABASE = [
  { code: 'U0100', desc_fa: 'قطع ارتباط شبکه CAN با کنترلر موتور (ECM/ECU)', system: 'electrical', common_cause_fa: 'نقص ترنسیور CAN، قطع خط تغذیه، سوختن دیود ESD یا افت ولتاژ باتری' },
  { code: 'U0140', desc_fa: 'قطع ارتباط با نود مرکزی کنترل بدنه (BCM / BSI / SBM)', system: 'electrical', common_cause_fa: 'ایراد در کانکتور یا ترنسیور نود، خرابی آی‌سی رگولاتور SBC یا قطعی هدر اتصال' },
  { code: 'U1105', desc_fa: 'خطای ارتباط با ترنسیور شبکه CAN سرعت پایین / تحمل‌پذیر خطا', system: 'electrical', common_cause_fa: 'اتصال کوتاه CAN_H یا CAN_L به زمین، خرابی ترنسیور TJA1055 یا سوختن PESD2CAN' },
  { code: 'U0001', desc_fa: 'خطای باس پرسرعت CAN (High Speed CAN Communication Bus)', system: 'electrical', common_cause_fa: 'مقاومت انتهای خط (ترمینیشن ۱۲۰ اهم) آسیب دیده یا مدار باز است' },
  { code: 'P0562', desc_fa: 'ولتاژ تغذیه سیستم پایین‌تر از حد مجاز (System Voltage Low)', system: 'electrical', common_cause_fa: 'خرابی مسیر شارژ دینام، افت ولتاژ رگولاتور PMIC یا اتصال مقاومت‌های فیلتر ورودی' },
  { code: 'P0563', desc_fa: 'ولتاژ تغذیه سیستم بالاتر از حد مجاز (System Voltage High)', system: 'electrical', common_cause_fa: 'نقص رگولاتور دینام، خرابی دیود محافظ زنر یا سوختن وریستور ورودی' },
  { code: 'P0300', desc_fa: 'احتراق ناقص تصادفی / چند سیلندر (Random/Multiple Cylinder Misfire)', system: 'engine', common_cause_fa: 'نقص کویل، خرابی درایور جرقه، شمع‌های فرسوده، یا افت فشار سوخت' },
  { code: 'P0106', desc_fa: 'عملکرد نامطلوب سیگنال سنسور فشار منیفولد (MAP Sensor)', system: 'engine', common_cause_fa: 'نشتی هوای منیفولد، کثیفی سنسور یا قطع شدن مسیر ۵ ولت مرجع' },
  { code: 'P0171', desc_fa: 'سیستم بیش از حد رقیق است - بانک ۱ (System Too Lean)', system: 'fuel', common_cause_fa: 'نشتی مکش، افت دبی پمپ بنزین، گرفتگی انژکتورها یا خرابی سنسور اکسیژن' },
  { code: 'P0115', desc_fa: 'ایراد در مدار سنسور دمای مایع خنک‌کننده (ECT Sensor)', system: 'engine', common_cause_fa: 'قطعی سیم‌کشی سنسور آب، خرابی NTC سنسور یا مقاومت پول‌آپ ورودی ECU' },
  { code: 'C0035', desc_fa: 'ایراد در مدار سنسور سرعت چرخ جلو چپ (Wheel Speed Sensor)', system: 'brakes', common_cause_fa: 'قطعی هارنس سنسور، کثیفی رینگ مغناطیسی بلبرینگ چرخ یا نقص یونیت ABS' },
  { code: 'B1000', desc_fa: 'خطای داخلی میکروکنترلر / سخت‌افزار یونیت (ECU Internal Fault)', system: 'electrical', common_cause_fa: 'خرابی حافظه EEPROM، نوسان ولتاژ کلاک کریستال یا سوختن MCU' },
];

export function lookupDtc(code) {
  if (!code) return null;
  const clean = code.trim().toUpperCase();
  return DTC_DATABASE.find((d) => d.code === clean || clean.includes(d.code));
}
