// National Analysis indicators. The first 22 are Country PESTLE's (same codes, directions and thresholds), so the
// pressure scores match it; the rest widen the profile. `better: null` marks context metrics (size, structure),
// shown and compared but not scored as improving or worsening.
// Sources: World Bank World Development Indicators (source 2) and Worldwide Governance Indicators (source 3).
const WDI = 2, WGI = 3;
export const DIMENSIONS = ['political', 'economic', 'social', 'technological', 'legal', 'environmental'];
export const INDICATORS = [
  // ---- Country PESTLE's core set
  ['GOV_WGI_PV.EST', 'political', 'Political stability & absence of violence', 'index −2.5…2.5', 'up', 0.1, WGI],
  ['GOV_WGI_VA.EST', 'political', 'Voice & accountability', 'index −2.5…2.5', 'up', 0.1, WGI],
  ['GOV_WGI_GE.EST', 'political', 'Government effectiveness', 'index −2.5…2.5', 'up', 0.1, WGI],
  ['NY.GDP.MKTP.KD.ZG', 'economic', 'GDP growth', '% a year', 'up', 1, WDI],
  ['FP.CPI.TOTL.ZG', 'economic', 'Inflation (consumer prices)', '% a year', 'down', 1, WDI],
  ['SL.UEM.TOTL.ZS', 'economic', 'Unemployment', '% of labour force', 'down', 0.5, WDI],
  ['NY.GDP.PCAP.KD', 'economic', 'GDP per person (constant 2015 US$)', 'US$', 'up', 0, WDI],
  ['SP.DYN.LE00.IN', 'social', 'Life expectancy at birth', 'years', 'up', 0.3, WDI],
  ['SP.DYN.IMRT.IN', 'social', 'Infant mortality', 'per 1,000 live births', 'down', 0.5, WDI],
  ['SE.SEC.ENRR', 'social', 'Secondary school enrolment (gross)', '%', 'up', 1, WDI],
  ['SI.POV.GINI', 'social', 'Income inequality (Gini)', 'index', 'down', 0.5, WDI],
  ['IT.NET.USER.ZS', 'technological', 'Internet users', '% of population', 'up', 1, WDI],
  ['IT.CEL.SETS.P2', 'technological', 'Mobile subscriptions', 'per 100 people', 'up', 2, WDI],
  ['GB.XPD.RSDV.GD.ZS', 'technological', 'R&D spending', '% of GDP', 'up', 0.05, WDI],
  ['EG.ELC.ACCS.ZS', 'technological', 'Access to electricity', '% of population', 'up', 0.5, WDI],
  ['GOV_WGI_RL.EST', 'legal', 'Rule of law', 'index −2.5…2.5', 'up', 0.1, WGI],
  ['GOV_WGI_CC.EST', 'legal', 'Control of corruption', 'index −2.5…2.5', 'up', 0.1, WGI],
  ['GOV_WGI_RQ.EST', 'legal', 'Regulatory quality', 'index −2.5…2.5', 'up', 0.1, WGI],
  ['EN.GHG.CO2.PC.CE.AR5', 'environmental', 'CO₂ emissions per person', 't CO₂e', 'down', 0.1, WDI],
  ['EG.FEC.RNEW.ZS', 'environmental', 'Renewable share of energy use', '%', 'up', 0.5, WDI],
  ['AG.LND.FRST.ZS', 'environmental', 'Forest area', '% of land', 'up', 0.2, WDI],
  ['EN.ATM.PM25.MC.M3', 'environmental', 'PM2.5 air pollution exposure', 'µg/m³', 'down', 1, WDI],
  // ---- Added in National Analysis
  ['MS.MIL.XPND.GD.ZS', 'political', 'Military spending', '% of GDP', null, 0, WDI],
  ['SM.POP.REFG.OR', 'political', 'Refugees originating from the country', 'people', 'down', 0, WDI],
  ['VC.IHR.PSRC.P5', 'legal', 'Intentional homicides', 'per 100,000 people', 'down', 0.3, WDI],
  ['GC.DOD.TOTL.GD.ZS', 'economic', 'Central government debt', '% of GDP', 'down', 2, WDI],
  ['BN.CAB.XOKA.GD.ZS', 'economic', 'Current account balance', '% of GDP', 'up', 1, WDI],
  ['NE.TRD.GNFS.ZS', 'economic', 'Trade', '% of GDP', null, 0, WDI],
  ['BX.KLT.DINV.WD.GD.ZS', 'economic', 'Foreign direct investment inflows', '% of GDP', 'up', 0.5, WDI],
  ['NY.GDP.MKTP.CD', 'economic', 'GDP (current US$)', 'US$', null, 0, WDI],
  ['SI.POV.DDAY', 'social', 'Extreme poverty ($2.15/day)', '% of population', 'down', 0.5, WDI],
  ['SP.POP.TOTL', 'social', 'Population', 'people', null, 0, WDI],
  ['SP.POP.GROW', 'social', 'Population growth', '% a year', null, 0, WDI],
  ['SP.DYN.TFRT.IN', 'social', 'Fertility rate', 'births per woman', null, 0, WDI],
  ['SP.URB.TOTL.IN.ZS', 'social', 'Urban population', '% of population', null, 0, WDI],
  ['SE.TER.ENRR', 'social', 'Tertiary (university) enrolment', '% gross', 'up', 1, WDI],
  ['SH.XPD.CHEX.GD.ZS', 'social', 'Health spending', '% of GDP', null, 0, WDI],
  ['TX.VAL.TECH.MF.ZS', 'technological', 'High-tech exports', '% of manufactured exports', 'up', 1, WDI],
  ['IP.PAT.RESD', 'technological', 'Patent applications by residents', 'applications', 'up', 0, WDI],
  ['EG.USE.PCAP.KG.OE', 'environmental', 'Energy use per person', 'kg oil equivalent', null, 0, WDI],
  ['ER.H2O.FWST.ZS', 'environmental', 'Water stress', '% of available freshwater', 'down', 2, WDI],
].map(([code, dimension, label, unit, better, threshold, source]) => ({ code, dimension, label, unit, better, threshold, source, core: false }));
INDICATORS.slice(0, 22).forEach(i => { i.core = true; });
