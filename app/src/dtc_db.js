// DTC (Diagnostic Trouble Code) Knowledge Base based on ISO 14229 (UDS) & SAE J2012
export const DTC_DATABASE = [
  {
    code: 'U0100',
    desc_fa: 'قطع ارتباط شبکه CAN با واحد کنترل الکترونیکی موتور (ECM/ECU)',
    system: 'electrical',
    standard: 'ISO 11898 / ISO 14229',
    freeze_frame_check: 'بررسی ولتاژ تغذیه باتری، وضعیت احتراق (Ignition Status)، و شمارنده خطای فریم CAN',
    common_cause_fa: 'نقص ترنسیور CAN (TJA1055/TJA1040)، قطع خط تغذیه رگولاتور LDO، سوختن دیود ESD مدل PESD2CAN یا افت ولتاژ باتری زیر ۹ ولت',
  },
  {
    code: 'U0140',
    desc_fa: 'قطع ارتباط شبکه با نود کنترل مرکزی بدنه (BCM / BSI / SBM)',
    system: 'electrical',
    standard: 'ISO 11898-3 / ISO 14229',
    freeze_frame_check: 'وضعیت شبکه کم‌سرعت تحمل‌پذیر خطا، ولتاژ ریل ۵ ولت نود BCM، وضعیت خطای ERR_N',
    common_cause_fa: 'ایراد در کانکتور اصلی هارنس، خرابی آی‌سی رگولاتور SBC (TLE9263)، قطعی مقاومت‌های فیلتر ورودی یا سوختن ترنسیور',
  },
  {
    code: 'U1105',
    desc_fa: 'خطای فیزیکی در باس شبکه CAN تحمل‌پذیر خطا (CAN Bus Hardware Fault)',
    system: 'electrical',
    standard: 'ISO 11898-3',
    freeze_frame_check: 'سطح ولتاژ DC پایه‌های CAN_H و CAN_L نسبت به زمین در لحظه وقوع عیب',
    common_cause_fa: 'اتصال کوتاه سیم‌های CAN_H یا CAN_L به شاسی/بدنه، خرابی ترنسیور TJA1055 یا اتصال کوتاه در آرایه محافظ PESD2CAN',
  },
  {
    code: 'U0001',
    desc_fa: 'خطای عملکردی باس پرسرعت شبکه (High Speed CAN Communication Bus Fault)',
    system: 'electrical',
    standard: 'ISO 11898-2',
    freeze_frame_check: 'شمارنده‌های خطای ارسال و دریافت (TEC/REC) و فعال شدن وضعیت Bus-Off در کنترلر',
    common_cause_fa: 'مقاومت ترمینیشن ۱۲۰ اهم انتهای خط آسیب دیده، لحیم سرد در چوک فیلتر مد مشترک (CMC)، یا نویز شدید القایی آلترناتور',
  },
  {
    code: 'P0562',
    desc_fa: 'ولتاژ تغذیه سیستم پایین‌تر از حد مجاز استاندارد (System Voltage Low < 10.5V)',
    system: 'electrical',
    standard: 'ISO 16750-2',
    freeze_frame_check: 'ولتاژ دینام در دور آرام و دور ۳۰۰۰rpm، وضعیت جریان‌کشی سوییچ‌های هوشمند قدرت',
    common_cause_fa: 'خرابی دیودهای پل آلترناتور، افت ولتاژ در رگولاتور ولتاژ PMIC، خرابی خازن‌های سرامیکی صافی ورودی یا فرسودگی باتری',
  },
  {
    code: 'P0563',
    desc_fa: 'ولتاژ تغذیه سیستم بالاتر از حد مجاز استاندارد (System Voltage High > 16.0V)',
    system: 'electrical',
    standard: 'ISO 16750-2 / ISO 7637-2',
    freeze_frame_check: 'پیک ولتاژ لوددامپ و وضعیت سنسور ولتاژ آنالوگ ADC در پردازنده',
    common_cause_fa: 'نقص رگولاتور شارژ دینام، قطع شدن بار حین شارژ (Load Dump Pulse 5a)، سوختن وریستور یا دیود محافظت ولتاژ گذرا (TVS)',
  },
  {
    code: 'P0300',
    desc_fa: 'احتراق ناقص چند سیلندر تصادفی (Random/Multiple Cylinder Misfire Detected)',
    system: 'engine',
    standard: 'ISO 14229 / OBD-II',
    freeze_frame_check: 'دور موتور، درصد بار موتور (Engine Load)، دمای آب خنک‌کننده (ECT)، و فشار مپ منیفولد',
    common_cause_fa: 'نقص ترانزیستور درایور جرقه در ECU، فرسودگی شمع‌ها/کویل‌ها، افت فشار ریل سوخت یا نوسان ولتاژ سنسور موقعیت میل‌لنگ (CKP)',
  },
  {
    code: 'P0106',
    desc_fa: 'انحراف سیگنال سنسور فشار مطلق منیفولد از محدوده مجاز (MAP Sensor Range/Performance)',
    system: 'engine',
    standard: 'ISO 14229',
    freeze_frame_check: 'ولتاژ ریل تغذیه مرجع ۵.۰V سنسورها (VREF) و مقدار فشار در سوئیچ باز و موتور روشن',
    common_cause_fa: 'نشتی وکیوم هوای ورودی، قطعی سیم ۵ ولت مرجع از ECU، خرابی تقویت‌کننده آپ‌امپ ورودی آنالوگ یا کثیفی سنسور',
  },
  {
    code: 'P0171',
    desc_fa: 'ترکیب سوخت و هوا بیش از حد رقیق است - بانک ۱ (System Too Lean Bank 1)',
    system: 'fuel',
    standard: 'ISO 14229',
    freeze_frame_check: 'ضرایب تصحیح سوخت کوتاه‌مدت و بلندمدت (STFT & LTFT > +25%)، سیگنال سنسور اکسیژن',
    common_cause_fa: 'افت دبی پمپ بنزین، گرفتگی سوزن‌های انژکتور، مقاومت بالای درایور High-Side پاشش سوخت، یا خرابی هیتر سنسور O2',
  },
  {
    code: 'C0035',
    desc_fa: 'ایراد در مدار سنسور سرعت چرخ جلو چپ (Left Front Wheel Speed Sensor Circuit)',
    system: 'brakes',
    standard: 'ISO 26262 ASIL-D / ISO 14229',
    freeze_frame_check: 'سرعت خودرو در لحظه رخداد عیب، وضعیت سیگنال سنسور اثر هال / القایی چرخ',
    common_cause_fa: 'قطعی هارنس سنسور چرخ، کثیفی یا شکستگی رینگ مغناطیسی بلبرینگ چرخ، نقص مقایسه‌کننده ورودی یونیت ABS (LM2903)',
  },
  {
    code: 'B1000',
    desc_fa: 'خطای سخت‌افزاری داخلی کنترلر الکترونیکی (Electronic Control Unit Internal Hardware Fault)',
    system: 'electrical',
    standard: 'ISO 26262 / AEC-Q100',
    freeze_frame_check: 'کد خطای سخت‌افزاری حافظه، ولتاژ ریل‌های داخلی ۳.۳V و ۱.۵V هسته، خطای تایمر Watchdog',
    common_cause_fa: 'خرابی بلوک حافظه EEPROM، نوسان ساعت کریستال اسیلاتور، نقص لحیم‌کاری پایه‌های میکروکنترلر ۳۲ بیتی (IPC Class 3)',
  },
];

export function lookupDtc(code) {
  if (!code) return null;
  const clean = code.trim().toUpperCase();
  return DTC_DATABASE.find((d) => d.code === clean || clean.includes(d.code));
}
