# Placeholders and Commit Checklist

## Placeholders to fill

{{COMPANY_NAME}} = legal/internal company name

{{SYSTEM_LIST}} = engine, electrical, transmission, chassis/steering, brakes, fuel, HVAC, body, SRS/airbag, infotainment, other

{{PLATFORM_LIST}} = Samand, Dena, Tara, Runna, Soren, Peugeot-based platforms, other active IKCO platforms

{{KNOWN_ISSUE_SOURCE}} = internal TSB list, warranty claims, 8D reports, supplier quality reports, service network logs

{{ESCALATION_RULES}}:
- brakes -> brake/chassis senior technician + quality engineering
- steering -> chassis/steering senior technician + engineering
- SRS -> authorized SRS specialist
- fuel leak/smoke/fire smell -> immediate safety escalation
- engine/transmission recurring issue -> powertrain engineering / supplier quality

## Commit checklist

- [ ] Replace {{COMPANY_NAME}}
- [ ] Confirm active platform/system taxonomy
- [ ] Define safety escalation contacts
- [ ] Add RAG source for known issues / TSB / 8D / warranty
- [ ] Implement external state storage
- [ ] Implement JSON validation and retry
- [ ] Enforce hard 8-question cap in code
- [ ] Implement language detection
- [ ] Test with 10-15 historical real cases
- [ ] Compare AI conclusion against confirmed technician/engineering conclusion
- [ ] Log all cases for later Pareto and model improvement
