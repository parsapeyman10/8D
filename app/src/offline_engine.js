// Offline Automotive & Electronics AI Diagnostic Expert Engine
// کارکرد ۱۰۰٪ آفلاین — بدون نیاز به اینترنت، بدون نیاز به VPN، بدون نیاز به API Key یا درایور وب

import { lookupDtc } from './dtc_db.js';
import { getPinoutData, PINOUTS_DATABASE } from './pinouts_db.js';
import { findLearnedMemory } from './db.js';

export function runOfflineStep(state) {
  const qNum = state.question_count;
  const maxQ = state.max_questions || 8;
  const symptom = state.symptom || '';
  const system = state.system || 'electrical';
  const findings = state.findings || [];
  const learned = state.learned_memory || [];

  // If question limit reached, conclude
  if (qNum >= maxQ) {
    return { conclude: true };
  }

  // Extract relevant hints from symptom & findings
  const hasCan = /can|شبکه|ارتباط|u0100|u1105|u0001|tja1055/i.test(symptom);
  const hasVoltage = /ولتاژ|تغذیه|باتری|رگولاتور|افت|p0562|p0563|خاموش|روشن نشدن/i.test(symptom);
  const hasEngine = /موتور|ریپ|انژکتور|شمع|جرقه|p0300|p0106|p0171/i.test(symptom);
  const hasBrakes = /ترمز|abs|c0035|پدال|لنت|هیدرولیک/i.test(symptom);
  const hasSensor = /سنسور|اکسیژن|مپ|دما|map|o2|sensor/i.test(symptom);

  // Dynamic question selection based on round & domain
  let qObj = null;

  if (qNum === 0) {
    // Round 1: Mode of occurrence / timeline
    qObj = {
      question: 'این عیب از چه زمانی و تحت چه شرایط کاری در مدار یا خودرو پدیدار شد؟',
      options: [
        'بلافاصله بعد از روشن شدن اولیه / استارت سرد (Cold Start)',
        'به‌صورت ناگهانی پس از کارکرد مداوم و افزایش دمای کاری (Thermal Stress)',
        'به‌تدریج و همراه با نوسان در عملکرد طی چند ساعت/روز اخیر',
        'از ابتدای فرآیند مونتاژ در خط تولید یا پس از تعمیر/پروگرام مجدد',
        'هیچ‌کدام / مطابقت ندارد — لطفاً توضیح بدهید',
      ],
      hypotheses: [
        { hypothesis: 'نوسان ولتاژ تغذیه یا آسیب به بلوک رگولاتور ورودی (PMIC / LDO)', confidence: 60 },
        { hypothesis: 'نقص لحیم‌کاری پایه‌های آی‌سی، قلع‌مردگی یا ترک خازن‌های سرامیکی (MLCC Crack)', confidence: 45 },
        { hypothesis: 'اشکال در خط ارتباطی دیتا / ترنسیور شبکه (CAN / LIN Bus Fault)', confidence: 40 },
      ],
      ruled_out: [],
    };
  } else if (qNum === 1) {
    // Round 2: Power rail & voltage measurement
    if (hasCan) {
      qObj = {
        question: 'ولتاژ تغذیه خط VCC (پایه ۳ ترنسیور CAN) و ولتاژ حالت سکون پایه‌های CAN_H و CAN_L چقدر است؟',
        options: [
          'تغذیه ۵ ولت دقیق است و CAN_H و CAN_L هر دو حدود ۲.۵ ولت نرمال هستند',
          'ولتاژ یکی از خطوط CAN به زمین (GND) یا تغذیه (۱۲ ولت) اتصال کوتاه است',
          'تغذیه ۵ ولت رگولاتور دارای افت ولتاژ یا ریپل شدید است (کمتر از ۴.۵ ولت)',
          'پایه خروجی خطای ترنسیور (ERR_N یا RXD) روی سطح صفر منطقی قفل شده است',
          'هیچ‌کدام / مطابقت ندارد — لطفاً توضیح بدهید',
        ],
      };
    } else if (hasVoltage || system === 'electrical') {
      qObj = {
        question: 'در بررسی ولتاژهای مرجع روی بردهای کنترلی، ولتاژ ریل‌های ۵ ولت و ۳.۳ ولت پردازنده در چه وضعیتی هستند؟',
        options: [
          'هر دو ولتاژ ۵.۰V و ۳.۳V کاملاً پایدار و بدون نویز هستند',
          'ولتاژ ریل ۳.۳ ولت میکروکنترلر دچار افت شده یا دارای نوسان شدید است',
          'ولتاژ ۵ ولت سنسورها زیر ۴.۶ ولت است (افت بر اثر اضافه بار یا خرابی رگولاتور)',
          'در خط ورودی ۱۲ ولت، دیود محافظ معکوس یا مقاومت فیوزی سوخته/مدار باز است',
          'هیچ‌کدام / مطابقت ندارد — لطفاً توضیح بدهید',
        ],
      };
    } else {
      qObj = {
        question: 'آیا در بررسی با دیاگ یا مولتی‌متر، تغذیه و سیگنال مرجع سنسورها/یونیت سالم است؟',
        options: [
          'بله، تغذیه ۵ ولت مرجع سالم و پایدار است',
          'خیر، افت ولتاژ در خط تغذیه سنسور/عملگر وجود دارد',
          'سیگنال ارسالی روی سیم‌کشی قطع است یا پارازیت شدید دارد',
          'خطای ارتباطی داخلی در یونیت ثبت شده است',
          'هیچ‌کدام / مطابقت ندارد — لطفاً توضیح بدهید',
        ],
      };
    }
  } else if (qNum === 2) {
    // Round 3: Waveform / Resistance / Test Points
    if (hasCan) {
      qObj = {
        question: 'مقاومت اهمی انتهای خط باس CAN (پایه‌های CAN_H نسبت به CAN_L) در حالت بی‌برقی چقدر اندازه‌گیری می‌شود؟',
        options: [
          'حدود ۶۰ اهم (دو مقاومت ۱۲۰ اهم موازی استاندارد انتهای خط)',
          'حدود ۱۲۰ اهم (یکی از مقاومت‌های ترمینیشن انتهای باس قطع است)',
          'بی‌نهایت یا بسیار زیاد (هر دو مقاومت ترمینیشن یا مسیر باس قطع هستند)',
          'کمتر از ۲۰ اهم یا نزدیک صفر (اتصال کوتاه بین خطوط CAN_H و CAN_L)',
          'هیچ‌کدام / مطابقت ندارد — لطفاً توضیح بدهید',
        ],
      };
    } else {
      qObj = {
        question: 'در مشاهده سیگنال با اسیلوسکوپ یا تست مقاومت به زمین (GND)، چه پدیده‌ای ثبت شد؟',
        options: [
          'شکل موج سیگنال کاملاً تمیز و با لبه‌های بالارونده شارپ است',
          'ریپل ولتاژی شدید و نویز فرکانس بالا روی خط تغذیه دیده می‌شود (ضعف خازن‌های فیلتر)',
          'سیگنال خروجی درایور دفرمه شده و توان جریان‌دهی به بار را ندارد',
          'امپدانس خط به بدنه صفر اهم شده است (اتصال کوتاه در یکی از المان‌های محافظ)',
          'هیچ‌کدام / مطابقت ندارد — لطفاً توضیح بدهید',
        ],
      };
    }
  } else if (qNum === 3) {
    // Round 4: Physical inspection / Thermal / SMT
    qObj = {
      question: 'در بررسی فیزیکی، میکروسکوپی و دوربین حرارتی (Thermal Camera) روی برد، کدام مورد مشاهده می‌شود؟',
      options: [
        'دمای غیرعادی و داغ شدن شدید آی‌سی رگولاتور یا ترنسیور / درایور قدرت',
        'ترک‌خوردگی خمشی در خازن‌های سرامیکی چندلایه (MLCC Flex Crack)',
        'پل قلع (Solder Bridge) یا قلع‌مردگی و لحیم سرد روی پایه‌های قطعات SMD',
        'هیچ علامت ظاهری یا نقطه داغ غیرعادی وجود ندارد و ظاهر برد کاملاً تمیز است',
        'هیچ‌کدام / مطابقت ندارد — لطفاً توضیح بدهید',
      ],
    };
  } else if (qNum === 4) {
    // Round 5: Isolation & Functional test
    qObj = {
      question: 'با ایزوله‌سازی یا جدا کردن مدار بار/سنسور مشکوک، وضعیت چگونه تغییر می‌کند؟',
      options: [
        'با جداسازی قطعه/سنسور، ولتاژ ریل تغذیه بلافاصله نرمال شد (اتصال کوتاه داخلی قطعه)',
        'مشکل حتی بدون بار خارجی روی برد پابرجاست (نقص درونی برد یا میکروکنترلر)',
        'با گرم یا سرد کردن موضعی قطعه با هیتر/اسپری فریز، عیب قطع و وصل می‌شود',
        'با شارژ مجدد لحیم پایه‌ها (Rework)، عملکرد برد موقتاً بهبود یافت',
        'هیچ‌کدام / مطابقت ندارد — لطفاً توضیح بدهید',
      ],
    };
  } else {
    // Round 6+: Verification & deep analysis
    qObj = {
      question: `بررسی تکمیلی (مرحله ${qNum + 1}): وضعیت فرمان خروجی میکروکنترلر (پین‌های کنترلی/PWM) را چگونه ارزیابی می‌کنید؟`,
      options: [
        'پالس کنترلی از میکرو صادر می‌شود ولی درایور خروجی را فعال نمی‌کند',
        'میکروکنترلر در لوپ ریست مداوم (Reset Loop) یا فریز نرم‌افزاری گیر کرده است',
        'سیگنال ورودی سنسور به مبدل ADC می‌رسد ولی داده صحیحی پردازش نمی‌شود',
        'همه خروجی‌های کنترلی فعال هستند ولی قطعه عملگر توان مکانیکی لازم را ندارد',
        'هیچ‌کدام / مطابقت ندارد — لطفاً توضیح بدهید',
      ],
    };
  }

  // Update hypotheses based on findings
  const leadingHypos = evaluateHypotheses(state, findings);
  const ruledOut = evaluateRuledOut(findings);

  return {
    question: qObj.question,
    options: qObj.options,
    system: system,
    leading_hypotheses: leadingHypos,
    ruled_out: ruledOut,
  };
}

function evaluateHypotheses(state, findings) {
  const symptom = state.symptom || '';
  const hypos = [];

  const allText = (symptom + ' ' + findings.map((f) => f.answer).join(' ')).toLowerCase();

  if (/ترک|خازن|mlcc|خمشی|فیلتر|ریپل/i.test(allText)) {
    hypos.push({
      hypothesis: 'شکست و ترک ساختاری در خازن‌های سرامیکی چندلایه (MLCC Flex Crack) ناشی از تنش مکانیکی و شوک حرارتی مونتاژ',
      confidence: 88,
    });
  }
  if (/can|tja|ترنسیور|err|۶۰ اهم|۱۲۰ اهم|u0100|u1105/i.test(allText)) {
    hypos.push({
      hypothesis: 'آسیب به درایور/ترنسیور شبکه CAN (مدل TJA1055/TJA1040) یا سوختن آرایه دیودی محافظ ESD در اثر تخلیه اضافه ولتاژ',
      confidence: 85,
    });
  }
  if (/رگولاتور|افت ولتاژ|۵ ولت|۳.۳|تغذیه|pmic|ldo|داغ شدن/i.test(allText)) {
    hypos.push({
      hypothesis: 'نقص رگولاتور ولتاژ یا داغ شدن بیش از حد آی‌سی تغذیه در اثر بار اضافه و عدم دفع حرارت مناسب (Thermal Overload)',
      confidence: 82,
    });
  }
  if (/قلع|لحیم|پل قلع|solder|rework|اتصال/i.test(allText)) {
    hypos.push({
      hypothesis: 'نقص لحیم‌کاری پایه‌های قطعات SMD، قلع‌مردگی یا اتصال کوتاه میکروسکوپی در فرآیند مونتاژ کوره Reflow',
      confidence: 78,
    });
  }
  if (/ریست|reset|میکرو|xc2060|eeprom|حافظه/i.test(allText)) {
    hypos.push({
      hypothesis: 'عدم پایداری خط ریست پردازنده یا نوسان مدار کلاک کریستال ناشی از نویز ولتاژ تغذیه میکروکنترلر',
      confidence: 72,
    });
  }

  if (hypos.length === 0) {
    hypos.push({
      hypothesis: 'نقص در مسیر اتصالات الکتریکی، سوختن المان‌های حفاظتی ورودی یا نیمه‌هادی‌های سوئیچینگ مدار',
      confidence: 65,
    });
    hypos.push({
      hypothesis: 'افت مقاومت عایقی بر اثر آلودگی سطح برد PCB یا فرسودگی خازن‌های کوپلاژ',
      confidence: 45,
    });
  }

  return hypos.slice(0, 3);
}

function evaluateRuledOut(findings) {
  const ruledOut = [];
  const text = findings.map((f) => f.answer).join(' ');
  if (/تغذیه ۵ ولت دقیق است|هر دو ولتاژ.*نرمال/i.test(text)) {
    ruledOut.push('قطعی کامل تغذیه رگولاتور اصلی ورودی ورشکستگی خط تغذیه');
  }
  if (/حدود ۶۰ اهم/i.test(text)) {
    ruledOut.push('قطعی یا خرابی مقاومت‌های ترمینیشن انتهای خط CAN (Termination 120Ω)');
  }
  if (/شکل موج.*تمیز/i.test(text)) {
    ruledOut.push('وجود نویز یا ریپل شدید فرکانس بالا روی خط دیتای بررسی‌شده');
  }
  return ruledOut;
}

export function runOfflineReport(state) {
  const symptom = state.symptom || '';
  const findings = state.findings || [];
  const leadingHypos = evaluateHypotheses(state, findings);
  const primaryHypo = leadingHypos[0]?.hypothesis || 'نقص در مدارات الکترونیکی یا قطعات کنترل کننده';

  const answersSummary = findings.map((f, i) => `بررسی ${i + 1}: ${f.question} ⬅️ پاسخ: ${f.answer}`).join('\n');

  return {
    root_causes: leadingHypos.map((h, idx) => ({
      cause: h.hypothesis,
      confidence: h.confidence,
      band: h.confidence >= 75 ? 'High' : h.confidence >= 50 ? 'Medium' : 'Low',
      evidence: `تایید شده بر اساس آزمون‌های چندمرحله‌ای: ${findings[idx]?.answer || 'بررسی شواهد فنی و سوابق دیتابیس یادگیری'}`,
    })),
    five_whys: [
      `چرا ۱: علامت خرابی "${symptom}" مشاهده و ثبت گردید.`,
      `چرا ۲: سیگنال الکتریکی و عملکرد مدار در محدوده مجاز تعریف‌شده قرار ندارد (${findings[0]?.answer || 'وجود نقص در مقادیر ولتاژ/مقاومت'}).`,
      `چرا ۳: در تست‌های تخصصی و نقاط آزمون، پارامترهای کاری قطعه دچار انحراف شده‌اند (${findings[1]?.answer || 'نقص در خط تغذیه یا دیتای قطعه'}).`,
      `چرا ۴: ${primaryHypo}`,
      `چرا ۵: نیاز به بهینه‌سازی فرآیند کنترل کیفیت خط تولید SMT، تقویت حفاظت‌های الکتریکی در برابر ESD و اصلاح پروفایل حرارتی لحیم‌کاری.`,
    ],
    eight_d_report: {
      d1_team: 'تیم تخصصی عیب‌یابی الکترونیک، کنترل کیفیت و تضمین کیفیت خودرو (QA/QC)',
      d2_problem: `شرح دقیق ایراد: ${symptom} — ثبت شده در بررسی سیستم ${state.system || 'الکترونیک/خودرو'}`,
      d3_containment: 'قرنطینه قطعات و بردهای مشکوک همان بچ تولیدی، بررسی ۱۰۰٪ اتصالات تغذیه و بازرسی چشمی میکروسکوپی',
      d4_root_cause: primaryHypo,
      d5_corrective_actions: 'تعویض المان معیوب با قطعه اصلی دارای استاندارد خودرویی (AEC-Q)، ترمیم و احیای پدهای قلع‌خورده با خمیر قلع استاندارد، و اعمال پوشش عایق سطحی (Conformal Coating)',
      d6_verification: 'انجام تست عملکرد کامل با دستگاه دیاگ و اسیلوسکوپ در شرایط بار کامل و آزمون چرخه حرارتی (Thermal Cycling Test)',
      d7_prevention: 'اصلاح پارامترهای دمایی کوره لحیم‌کاری Reflow، استفاده از ابزارهای ضد الکتریسیته ساکن (ESD-Safe) و بروزرسانی دستورالعمل آزمون خط تولید',
      d8_closure: 'ثبت مستندات فنی و سوابق در پایگاه داده یادگیری، تایید مدیر تضمین کیفیت و بستن رسمی پرونده 8D',
    },
    unresolved_conflicts: [],
    recommended_actions: [
      'بررسی و تست دقیق نقاط ولتاژی ریل ۵ ولت و ۳.۳ ولت طبق راهنمای پین‌اوت',
      'بازرسی میکروسکوپی پایه‌های آی‌سی‌ها جهت اطمینان از عدم وجود ترک یا پل قلع',
      'تست مقاومت انتهای خط باس و اطمینان از سلامت دیودهای محافظتی ESD',
      'ثبت نتیجه تست نهایی در پایگاه دانش یادگیری جهت ارتقای هوش عیب‌یابی برای دفعات آینده',
    ],
    escalate_if: [
      'وجود بوی سوختگی، داغ شدن غیرعادی در حد آسیب به فیبر مدار چاپی (PCB Delamination)',
      'تکرار همین عیب در بیش از ۳ دستگاه از یک بچ تولیدی که نشانه ایراد سیستماتیک در خط تولید است',
    ],
    offline_engine: true,
  };
}
