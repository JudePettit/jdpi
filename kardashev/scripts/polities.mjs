// Polities and their estimated population and energy capture per person, as keyframes:
//   [year, population in millions, energy capture in thousands of kcal per person per day]
// Values are interpolated linearly between keyframes and only exist between the polity's first and last year.
//
// Sources and method (all values are approximate; treat shares as ±30–50% before 1800):
//  - Energy capture per person follows the shape of Ian Morris's Western- and Eastern-core series
//    (Why the West Rules — For Now, 2010; The Measure of Civilization, 2013): food, fuel, fodder and raw
//    materials, rising from ~10,000 kcal/day in early agrarian states to ~31,000 under the Roman and Han empires,
//    ~29,000 under the Song, ~38,000 in north-west Europe by 1800 and over 200,000 in industrial economies.
//    Cores sit near Morris's figures; less developed regions of large empires are blended lower.
//  - Populations follow McEvedy & Jones (Atlas of World Population History, 1978), Maddison and standard
//    estimates for individual empires; combined entries ("North Indian kingdoms") group several states.
//  - From 1900, per-person values follow primary-energy statistics (the Energy Institute's Statistical Review, as
//    Our World in Data presents it) plus food and traditional biomass, converted at 1 GJ/year ≈ 655 kcal/day.
//
// Terms (MP-11, 20 November 2026): every value here is Vitruvian Manager's own estimate (© JDP-Iq), shaped after
// books that carry no open licence (Morris; McEvedy & Jones); Maddison's populations are CC BY 4.0. The Energy
// Institute's terms could not be read (https://www.energyinst.org/statistical-review answered HTTP 403 on 18 and 20
// November 2026), and Our World in Data passes such data on under its makers' terms. Kept until VM's owner decides
// (integration/sources.json: vm-kardashev, energy-institute).
//
// Names and capitals by year (ChatGPT's review, corrected 25 November 2026: kardashev-2 and kardashev-3). `name` is the
// entry's own name, kept for its record, the catalogue and the links to it. An entry whose name or capital changed
// within its years also has
//   names:    [[from year, name], ...]          the name in force from that year
//   capitals: [[from year, lat, lon, capital]]  the capital held from that year (lat and lon from Wikidata, P625)
// and build.mjs writes the name and the position in force into each step (the latest entry from at or before the step;
// before the first, the first). `lat` and `lon` stay the entry's own point as before, for what reads the record (the
// catalogue, coverage.mjs). Each date is from the Wikipedia article named beside it, read on 25 November 2026; a
// capital already used as an entry's own point keeps that point, and every other position is Wikidata's (P625).
export const POLITIES = [
  // ---- Bronze Age
  // Middle Kingdom of Egypt c. 2055–1650 BC; then the Second Intermediate Period until the New Kingdom of Egypt, which
  // its own article dates c. 1570–1069 BC (the Second Intermediate Period's article ends that period in 1550 BC; the
  // New Kingdom's date is the one used here). Capitals: Thebes, then Itjtawy, founded by Amenemhat I (r. c. 1991–1962
  // BC) in his 20th year and taken here from the end of his reign (Itjtawy; Middle Kingdom of Egypt: Thebes, Itjtawy);
  // Itjtawy c. 1803–1677 BC, then Thebes c. 1677–1600 BC (Second Intermediate Period of Egypt); Thebes c. 1570–1352 BC,
  // Amarna c. 1352–1336 BC, Thebes c. 1336–1279 BC, Pi-Ramesses c. 1279–1213 BC, Memphis c. 1213–1069 BC (New Kingdom).
  { id: 'egypt-mk', name: 'Egypt (Middle & New Kingdoms)', lat: 25.7, lon: 32.6, region: 'Near East', wiki: 'New_Kingdom_of_Egypt', k: [[-2000, 2, 12], [-1500, 2.5, 13], [-1200, 3, 13.5], [-1070, 3, 13]],
    names: [[-2000, 'Egypt (Middle Kingdom)'], [-1650, 'Egypt (Second Intermediate Period)'], [-1570, 'Egypt (New Kingdom)']],
    capitals: [[-2000, 25.7, 32.6, 'Thebes'], [-1962, 29.5703, 31.2311, 'Itjtawy'], [-1677, 25.7, 32.6, 'Thebes'], [-1352, 27.6617, 30.9056, 'Amarna'],
      [-1336, 25.7, 32.6, 'Thebes'], [-1279, 30.7994, 31.8342, 'Pi-Ramesses'], [-1213, 29.8447, 31.2509, 'Memphis']] },
  { id: 'babylonia', name: 'Babylonia and Mesopotamian states', lat: 32.5, lon: 44.4, region: 'Near East', wiki: 'Babylonia', k: [[-2000, 1.5, 12], [-1500, 1.2, 12], [-1000, 1, 12], [-912, 1, 12]] },
  { id: 'indus', name: 'Indus civilisation (late)', lat: 27.3, lon: 68.1, region: 'South Asia', wiki: 'Indus_Valley_Civilisation', k: [[-2000, 4, 9], [-1800, 3, 8]] },
  // Erlitou culture "approximately 1900 to 1500 BC" (radiocarbon since 2007: 1750–1500 BC); Shang dynasty c. 1600–1046 BC.
  // Until 25 November 2026 the entry began in 2000 BC, before either; its figures at 1900 BC are those its keyframes
  // of 2000 and 1600 BC gave there, so every later step is as it was. Capitals: the Erlitou site (Erlitou culture);
  // Zhengzhou Shang City, "probably a capital of the Shang", its four phases 1630 to 1400 BC (Zhengzhou Shang City); Yin
  // at Anyang, the last capital, its first phase (Yinxu I) 1300–1250 BC (Yinxu; Shang dynasty: Xiang and Yin, both near
  // Anyang). The record's own point is Anyang.
  { id: 'shang', name: 'Erlitou and Shang China', lat: 36.1, lon: 114.3, region: 'East Asia', wiki: 'Shang_dynasty', k: [[-1900, 1.875, 8.25], [-1600, 3, 9], [-1100, 5, 10], [-1046, 5, 10]],
    names: [[-1900, 'Erlitou culture (China)'], [-1600, 'Erlitou and Shang China'], [-1500, 'Shang China']],
    capitals: [[-1900, 34.6925, 112.69, 'Erlitou'], [-1600, 34.7453, 113.6831, 'Zhengzhou Shang City'], [-1300, 36.1, 114.3, 'Yin (Anyang)']] },
  { id: 'hittite', name: 'Hittite Empire', lat: 40.0, lon: 34.6, region: 'Near East', wiki: 'Hittites', k: [[-1650, 1, 11], [-1300, 1.5, 12], [-1180, 1.2, 12]] },
  // ---- Iron Age and classical
  // Zhou dynasty c. 1046–256 BC; Warring States period c. 475–221 BC. Capitals (Zhou dynasty): Fenghao 1046–771 BC, then
  // Wangcheng (771–510 and 314–256 BC) and Chengzhou (510–314 BC), both at Luoyang, the record's own point.
  { id: 'zhou', name: 'Zhou and the Warring States (China)', lat: 34.6, lon: 112.4, region: 'East Asia', wiki: 'Zhou_dynasty', k: [[-1046, 6, 10], [-771, 8, 11], [-500, 20, 14], [-300, 30, 17], [-221, 35, 19]],
    names: [[-1046, 'Zhou dynasty (China)'], [-475, 'Zhou and the Warring States (China)']],
    capitals: [[-1046, 34.21, 108.72, 'Fenghao'], [-771, 34.6, 112.4, 'Wangcheng and Chengzhou (Luoyang)']] },
  // Third Intermediate Period of Egypt c. 1077–664 BC; Late Period of Egypt 664–332 BC. Capitals: Tanis (c. 1077–943 BC,
  // the 21st Dynasty), Bubastis (c. 943–716 BC, the 22nd), then Napata (c. 744–656 BC, the 25th), taken here from the end
  // of the 22nd (Third Intermediate Period; its rival 23rd and 24th Dynasties' Heracleopolis and Sais are left out); Sais
  // (Late Period: Sais, Mendes, Sebennytos).
  { id: 'egypt-late', name: 'Egypt (Third Intermediate & Late Periods)', lat: 29.85, lon: 31.25, region: 'Near East', wiki: 'Late_Period_of_ancient_Egypt', k: [[-1069, 3, 12.5], [-525, 4, 14]],
    names: [[-1069, 'Egypt (Third Intermediate Period)'], [-664, 'Egypt (Late Period)']],
    capitals: [[-1069, 30.9769, 31.88, 'Tanis'], [-943, 30.5728, 31.51, 'Bubastis'], [-716, 18.5333, 31.8167, 'Napata'], [-664, 30.9647, 30.7683, 'Sais']] },
  // Neo-Assyrian Empire: Assur 911–879 BC, Nimrud 879–706, Dur-Sharrukin 706–705, Nineveh 705–612, Harran 612–609.
  { id: 'assyria', name: 'Neo-Assyrian Empire', lat: 36.4, lon: 43.15, region: 'Near East', wiki: 'Neo-Assyrian_Empire', k: [[-911, 4, 13], [-700, 10, 15], [-609, 8, 15]],
    capitals: [[-911, 35.4567, 43.2625, 'Assur'], [-879, 36.0981, 43.3289, 'Nimrud'], [-706, 36.5095, 43.2293, 'Dur-Sharrukin'], [-705, 36.4, 43.15, 'Nineveh'], [-612, 36.8708, 39.025, 'Harran']] },
  { id: 'neo-babylon', name: 'Neo-Babylonian Empire', lat: 32.5, lon: 44.4, region: 'Near East', wiki: 'Neo-Babylonian_Empire', k: [[-626, 5, 15], [-539, 6, 15]] },
  { id: 'india-early', name: 'North Indian kingdoms (combined)', lat: 25.6, lon: 85.1, region: 'South Asia', wiki: 'Mahajanapadas', k: [[-1500, 8, 8], [-1000, 15, 9], [-500, 30, 10], [-323, 40, 11]] },
  { id: 'achaemenid', name: 'Achaemenid Persian Empire', lat: 29.9, lon: 52.9, region: 'Near East', wiki: 'Achaemenid_Empire', k: [[-550, 15, 16], [-500, 25, 17], [-330, 25, 17]] },
  { id: 'greece', name: 'Greek city-states', lat: 37.98, lon: 23.73, region: 'Europe', wiki: 'Polis', k: [[-750, 1.5, 14], [-500, 3, 17], [-300, 3.5, 18], [-146, 3, 18]] },
  // Seleucid Empire: Babylon 312–305 BC, Seleucia 305–240 BC, Antioch 240–63 BC.
  { id: 'seleucid', name: 'Seleucid Empire', lat: 33.1, lon: 44.5, region: 'Near East', wiki: 'Seleucid_Empire', k: [[-312, 25, 17], [-200, 15, 17], [-100, 5, 16], [-63, 3, 16]],
    capitals: [[-312, 32.5425, 44.4211, 'Babylon'], [-305, 33.1, 44.5, 'Seleucia'], [-240, 36.2047, 36.1817, 'Antioch']] },
  { id: 'ptolemaic', name: 'Ptolemaic Egypt', lat: 31.2, lon: 29.9, region: 'Near East', wiki: 'Ptolemaic_Kingdom', k: [[-305, 4, 18], [-100, 5, 18], [-30, 5, 18]] },
  { id: 'maurya', name: 'Maurya Empire', lat: 25.6, lon: 85.1, region: 'South Asia', wiki: 'Maurya_Empire', k: [[-322, 40, 12], [-250, 45, 12], [-185, 45, 12]] },
  { id: 'india-mid', name: 'Indian kingdoms (combined)', lat: 25.3, lon: 82.9, region: 'South Asia', wiki: 'Middle_kingdoms_of_India', k: [[-184, 45, 12], [1, 50, 12], [319, 55, 12]] },
  { id: 'gupta', name: 'Gupta Empire', lat: 25.6, lon: 85.1, region: 'South Asia', wiki: 'Gupta_Empire', k: [[320, 55, 13], [550, 55, 13]] },
  { id: 'india-late', name: 'Indian kingdoms (combined)', lat: 22.7, lon: 75.9, region: 'South Asia', wiki: 'Middle_kingdoms_of_India', k: [[551, 55, 13], [1000, 75, 13], [1205, 80, 13]] },
  // Hecatompylos (Qumis), taken by the Parni about 237 BC, "the capital of the Parthian Empire by 200 BCE"; Ctesiphon,
  // founded in the late 120s BC, the capital from about 58 BC (Ctesiphon; Parthian Empire: perhaps not official until
  // Gotarzes I, c. 90–80 BC, which gives the same circle at every step).
  { id: 'parthia', name: 'Parthian Empire', lat: 33.09, lon: 44.58, region: 'Near East', wiki: 'Parthian_Empire', k: [[-247, 4, 17], [-200, 7, 18], [1, 10, 20], [223, 10, 21]],
    capitals: [[-237, 35.9531, 54.1037, 'Hecatompylos'], [-58, 33.09, 44.58, 'Ctesiphon']] },
  { id: 'rome-rep', name: 'Roman Republic', lat: 41.9, lon: 12.5, region: 'Europe', wiki: 'Roman_Republic', k: [[-509, 1, 15], [-300, 4, 18], [-200, 10, 22], [-100, 25, 27], [-28, 50, 30]] },
  { id: 'rome', name: 'Roman Empire', lat: 41.9, lon: 12.5, region: 'Europe', wiki: 'Roman_Empire', k: [[-27, 50, 30], [1, 55, 31], [150, 65, 31], [250, 55, 29], [394, 50, 27]] },
  // Western Roman Empire: Mediolanum 395–401, Ravenna 401–403, 408–450, 457–461 and 475–476, Rome 403–408, 450–457 and
  // 461–475.
  { id: 'rome-west', name: 'Western Roman Empire', lat: 44.4, lon: 12.2, region: 'Europe', wiki: 'Western_Roman_Empire', k: [[395, 22, 26], [476, 15, 24]],
    capitals: [[395, 45.4669, 9.19, 'Mediolanum'], [401, 44.4, 12.2, 'Ravenna'], [403, 41.9, 12.5, 'Rome'], [408, 44.4, 12.2, 'Ravenna'], [450, 41.9, 12.5, 'Rome'],
      [457, 44.4, 12.2, 'Ravenna'], [461, 41.9, 12.5, 'Rome'], [475, 44.4, 12.2, 'Ravenna']] },
  { id: 'byzantium', name: 'Eastern Roman (Byzantine) Empire', lat: 41.0, lon: 28.98, region: 'Europe', wiki: 'Byzantine_Empire', k: [[395, 25, 26], [550, 30, 25], [700, 12, 22], [800, 12, 22], [1025, 18, 24], [1200, 10, 22], [1350, 3, 20], [1453, 1, 20]] },
  { id: 'qin', name: 'Qin dynasty', lat: 34.3, lon: 108.9, region: 'East Asia', wiki: 'Qin_dynasty', k: [[-221, 35, 20], [-207, 30, 20]] },
  // Han dynasty: Chang'an 206 BC–AD 9, Luoyang 23–190, Xuchang 196–220.
  { id: 'han', name: 'Han dynasty', lat: 34.3, lon: 108.9, region: 'East Asia', wiki: 'Han_dynasty', k: [[-206, 30, 22], [2, 58, 27], [140, 50, 27], [220, 30, 24]],
    capitals: [[-206, 34.3083, 108.8583, "Chang'an"], [23, 34.6197, 112.4539, 'Luoyang'], [196, 34.0244, 113.8201, 'Xuchang']] },
  { id: 'china-divided', name: 'Divided China (Three Kingdoms to Southern & Northern dynasties)', lat: 32.06, lon: 118.8, region: 'East Asia', wiki: 'Six_Dynasties', k: [[221, 30, 23], [400, 35, 22], [588, 40, 23]] },
  { id: 'sasanian', name: 'Sasanian Empire', lat: 33.09, lon: 44.58, region: 'Near East', wiki: 'Sasanian_Empire', k: [[224, 10, 22], [500, 15, 23], [620, 18, 23], [651, 5, 22]] },
  // ---- Medieval
  { id: 'sui', name: 'Sui dynasty', lat: 34.3, lon: 108.9, region: 'East Asia', wiki: 'Sui_dynasty', k: [[589, 46, 24], [618, 40, 24]] },
  { id: 'tang', name: 'Tang dynasty', lat: 34.3, lon: 108.9, region: 'East Asia', wiki: 'Tang_dynasty', k: [[618, 40, 24], [750, 75, 27], [907, 50, 25]] },
  { id: 'five-dyn', name: 'Five Dynasties and Ten Kingdoms', lat: 34.8, lon: 114.3, region: 'East Asia', wiki: 'Five_Dynasties_and_Ten_Kingdoms_period', k: [[908, 50, 25], [959, 55, 26]] },
  // Song dynasty: Bianjing (Kaifeng) 960–1127, Lin'an 1138–1276.
  { id: 'song', name: 'Song dynasty', lat: 34.8, lon: 114.3, region: 'East Asia', wiki: 'Song_dynasty', k: [[960, 55, 27], [1100, 110, 29], [1127, 100, 29], [1150, 65, 29], [1200, 70, 29], [1279, 60, 28]],
    capitals: [[960, 34.8, 114.3, 'Bianjing'], [1138, 30.2667, 120.1667, "Lin'an"]] },
  { id: 'jin', name: 'Jin dynasty (Jurchen)', lat: 39.9, lon: 116.4, region: 'East Asia', wiki: 'Jin_dynasty_(1115–1234)', k: [[1127, 35, 25], [1200, 45, 26], [1234, 30, 25]] },
  // Rashidun Caliphate 632–661: Medina 632–656, Kufa 656–661; Umayyad Caliphate 661–750: Damascus 661–744, Harran 744–750.
  { id: 'rashidun-umayyad', name: 'Rashidun and Umayyad Caliphates', lat: 33.5, lon: 36.3, region: 'Near East', wiki: 'Umayyad_Caliphate', k: [[632, 5, 22], [661, 25, 24], [700, 30, 24], [750, 33, 24]],
    names: [[632, 'Rashidun Caliphate'], [661, 'Umayyad Caliphate']],
    capitals: [[632, 24.47, 39.61, 'Medina'], [656, 32.03, 44.4, 'Kufa'], [661, 33.5, 36.3, 'Damascus'], [744, 36.8708, 39.025, 'Harran']] },
  { id: 'abbasid', name: 'Abbasid Caliphate', lat: 33.3, lon: 44.4, region: 'Near East', wiki: 'Abbasid_Caliphate', k: [[751, 33, 25], [850, 30, 25], [950, 15, 24], [1100, 8, 23], [1258, 4, 22]] },
  // Umayyad state of Córdoba: the Emirate of Córdoba 756–929, the Caliphate of Córdoba 929–1031.
  { id: 'cordoba', name: 'Emirate and Caliphate of Córdoba', lat: 37.88, lon: -4.78, region: 'Europe', wiki: 'Caliphate_of_Córdoba', k: [[756, 4, 22], [1000, 7, 25], [1031, 6, 24]],
    names: [[756, 'Emirate of Córdoba'], [929, 'Caliphate of Córdoba']] },
  { id: 'fatimid', name: 'Fatimid Caliphate', lat: 30.04, lon: 31.24, region: 'Near East', wiki: 'Fatimid_Caliphate', k: [[909, 4, 23], [1000, 8, 24], [1171, 6, 23]] },
  { id: 'seljuk', name: 'Seljuk Empire', lat: 32.65, lon: 51.67, region: 'Near East', wiki: 'Seljuk_Empire', k: [[1037, 8, 22], [1090, 15, 23], [1194, 6, 22]] },
  { id: 'carolingian', name: 'Carolingian Empire', lat: 50.78, lon: 6.08, region: 'Europe', wiki: 'Carolingian_Empire', k: [[768, 12, 17], [800, 15, 18], [888, 13, 18]] },
  { id: 'hre', name: 'Holy Roman Empire', lat: 50.1, lon: 8.68, region: 'Europe', wiki: 'Holy_Roman_Empire', k: [[962, 9, 18], [1300, 15, 20], [1500, 16, 22], [1600, 18, 24], [1700, 18, 28], [1806, 22, 32]] },
  { id: 'france', name: 'Kingdom of France', lat: 48.86, lon: 2.35, region: 'Europe', wiki: 'Kingdom_of_France', k: [[987, 6, 18], [1300, 17, 22], [1450, 10, 22], [1600, 19, 26], [1700, 21, 30], [1791, 28, 34]] },
  { id: 'france-mod', name: 'France', lat: 48.86, lon: 2.35, region: 'Europe', wiki: 'France', k: [[1792, 28, 34], [1850, 36, 42], [1900, 41, 50], [1950, 42, 75], [1957, 44, 80]] },
  { id: 'england', name: 'Kingdom of England', lat: 51.5, lon: -0.13, region: 'Europe', wiki: 'Kingdom_of_England', k: [[1066, 1.8, 18], [1300, 5, 22], [1400, 2.5, 22], [1600, 4.5, 28], [1706, 5.5, 33]] },
  { id: 'kievan-rus', name: "Kievan Rus'", lat: 50.45, lon: 30.52, region: 'Europe', wiki: "Kievan_Rus'", k: [[880, 3, 15], [1000, 5, 16], [1200, 7, 16], [1240, 6, 16]] },
  { id: 'mongol', name: 'Mongol Empire', lat: 47.2, lon: 102.8, region: 'Central Asia', wiki: 'Mongol_Empire', k: [[1206, 5, 15], [1240, 60, 22], [1260, 110, 24], [1270, 100, 24]] },
  { id: 'yuan', name: 'Yuan dynasty', lat: 39.9, lon: 116.4, region: 'East Asia', wiki: 'Yuan_dynasty', k: [[1271, 80, 27], [1300, 75, 27], [1368, 60, 26]] },
  { id: 'ilkhanate', name: 'Ilkhanate', lat: 38.08, lon: 46.29, region: 'Near East', wiki: 'Ilkhanate', k: [[1271, 12, 20], [1300, 15, 20], [1335, 12, 20]] },
  { id: 'golden-horde', name: 'Golden Horde', lat: 48.7, lon: 44.5, region: 'Central Asia', wiki: 'Golden_Horde', k: [[1271, 6, 16], [1350, 6, 16], [1450, 4, 15]] },
  { id: 'delhi', name: 'Delhi Sultanate', lat: 28.6, lon: 77.2, region: 'South Asia', wiki: 'Delhi_Sultanate', k: [[1206, 40, 13], [1330, 60, 13], [1400, 40, 13], [1526, 30, 13]] },
  // Vijayanagara Empire 1336–1646; Bahmani Kingdom 1347–1527.
  { id: 'india-other', name: 'Other Indian states (Vijayanagara, Bahmani and others)', lat: 15.33, lon: 76.46, region: 'South Asia', wiki: 'Vijayanagara_Empire', k: [[1206, 40, 13], [1330, 35, 13], [1400, 60, 13], [1526, 75, 13], [1600, 30, 13], [1700, 15, 13]],
    names: [[1206, 'Other Indian states'], [1336, 'Other Indian states (Vijayanagara and others)'], [1347, 'Other Indian states (Vijayanagara, Bahmani and others)'], [1527, 'Other Indian states (Vijayanagara and others)'], [1646, 'Other Indian states']] },
  { id: 'khmer', name: 'Khmer Empire', lat: 13.41, lon: 103.87, region: 'Southeast Asia', wiki: 'Khmer_Empire', k: [[802, 2, 13], [1100, 3, 14], [1200, 4, 14], [1431, 2, 13]] },
  { id: 'maya', name: 'Classic Maya city-states (combined)', lat: 17.22, lon: -89.62, region: 'Americas', wiki: 'Classic_Maya_collapse', k: [[250, 2, 8], [600, 3, 8], [900, 1, 8]] },
  { id: 'mali', name: 'Mali Empire', lat: 11.37, lon: -8.38, region: 'Africa', wiki: 'Mali_Empire', k: [[1235, 5, 10], [1350, 10, 10], [1450, 8, 10], [1600, 3, 10]] },
  // Timurid Empire: Samarkand 1370–1405 and 1447–1459, Herat 1405–1447 and 1459–1507.
  { id: 'timurid', name: 'Timurid Empire', lat: 39.65, lon: 66.96, region: 'Central Asia', wiki: 'Timurid_Empire', k: [[1370, 10, 19], [1405, 15, 20], [1507, 6, 19]],
    capitals: [[1370, 39.65, 66.96, 'Samarkand'], [1405, 34.3419, 62.2031, 'Herat'], [1447, 39.65, 66.96, 'Samarkand'], [1459, 34.3419, 62.2031, 'Herat']] },
  // ---- Early modern
  // Ming dynasty: established in Nanjing (1368); Beijing (1403–1644).
  { id: 'ming', name: 'Ming dynasty', lat: 39.9, lon: 116.4, region: 'East Asia', wiki: 'Ming_dynasty', k: [[1368, 65, 27], [1400, 80, 28], [1500, 110, 28], [1600, 160, 29], [1644, 140, 28]],
    capitals: [[1368, 32.0608, 118.7789, 'Nanjing'], [1403, 39.9, 116.4, 'Beijing']] },
  { id: 'qing', name: 'Qing dynasty', lat: 39.9, lon: 116.4, region: 'East Asia', wiki: 'Qing_dynasty', k: [[1644, 140, 28], [1700, 160, 29], [1800, 320, 30], [1850, 410, 29], [1900, 400, 26], [1911, 410, 25]] },
  // Ottoman Empire: Söğüt c. 1299–1331, Nicaea (İznik) 1331–1335, Bursa 1335–1360s, Adrianople (Edirne) 1360s–1453
  // (its conquest is dated 1361 to 1369; 1369, the latest, is taken here), Constantinople 1453–1922.
  { id: 'ottoman', name: 'Ottoman Empire', lat: 41.0, lon: 28.98, region: 'Near East', wiki: 'Ottoman_Empire', k: [[1299, 0.5, 20], [1453, 8, 22], [1550, 25, 24], [1600, 30, 24], [1700, 28, 24], [1800, 25, 24], [1850, 35, 25], [1900, 25, 28], [1922, 15, 28]],
    capitals: [[1299, 40.0186, 30.1814, 'Söğüt'], [1331, 40.4289, 29.7194, 'Nicaea'], [1335, 40.1972, 29.0622, 'Bursa'], [1369, 41.6769, 26.5556, 'Adrianople'], [1453, 41.0, 28.98, 'Constantinople']] },
  { id: 'safavid', name: 'Safavid Iran', lat: 32.65, lon: 51.67, region: 'Near East', wiki: 'Safavid_Iran', k: [[1501, 6, 21], [1600, 9, 22], [1700, 10, 22], [1736, 8, 22]] },
  // Mughal Empire: Agra 1526–1530, 1560–1571 and 1598–1648; Delhi 1530–1540 and 1639–1857 (taken here from 1648, when
  // Agra's last span ends); Fatehpur Sikri 1571–1585; Lahore 1586–1598. It gives none for 1540–1560.
  { id: 'mughal', name: 'Mughal Empire', lat: 28.6, lon: 77.2, region: 'South Asia', wiki: 'Mughal_Empire', k: [[1526, 60, 13], [1600, 115, 14], [1700, 150, 14], [1750, 100, 14], [1800, 20, 13], [1857, 5, 13]],
    capitals: [[1526, 27.18, 78.02, 'Agra'], [1530, 28.6, 77.2, 'Delhi'], [1560, 27.18, 78.02, 'Agra'], [1571, 27.0911, 77.6611, 'Fatehpur Sikri'], [1586, 31.5497, 74.3436, 'Lahore'],
      [1598, 27.18, 78.02, 'Agra'], [1648, 28.6, 77.2, 'Delhi']] },
  // Maratha Empire (or Confederacy) 1674–1818; after it, the entry is the Indian states its name already includes (its
  // point stays Poona, the Peshwa's seat 1728–1818).
  { id: 'maratha', name: 'Maratha Confederacy and Indian states', lat: 18.52, lon: 73.86, region: 'South Asia', wiki: 'Maratha_Confederacy', k: [[1720, 30, 13], [1760, 80, 13], [1800, 120, 13], [1818, 100, 13], [1850, 50, 13], [1857, 40, 13]],
    names: [[1720, 'Maratha Confederacy and Indian states'], [1818, 'Indian states']] },
  { id: 'spain', name: 'Spanish Empire', lat: 40.4, lon: -3.7, region: 'Europe', wiki: 'Spanish_Empire', k: [[1492, 7, 22], [1600, 20, 22], [1700, 18, 22], [1800, 30, 21], [1850, 20, 22], [1898, 20, 25]] },
  { id: 'dutch', name: 'Dutch Republic', lat: 52.37, lon: 4.9, region: 'Europe', wiki: 'Dutch_Republic', k: [[1581, 1.5, 32], [1650, 1.9, 40], [1795, 2, 38]] },
  { id: 'aztec', name: 'Aztec Empire', lat: 19.43, lon: -99.13, region: 'Americas', wiki: 'Aztec_Empire', k: [[1428, 3, 9], [1500, 6, 9], [1521, 6, 9]] },
  { id: 'inca', name: 'Inca Empire', lat: -13.53, lon: -71.97, region: 'Americas', wiki: 'Inca_Empire', k: [[1438, 4, 9], [1500, 10, 9], [1533, 9, 9]] },
  { id: 'songhai', name: 'Songhai Empire', lat: 16.27, lon: 0.05, region: 'Africa', wiki: 'Songhai_Empire', k: [[1464, 3, 10], [1500, 5, 10], [1591, 4, 10]] },
  // Grand Principality of Moscow (also translated Grand Duchy), "before 1389 the Principality of Moscow"; Tsardom of
  // Russia from Ivan IV's coronation, 16 January 1547.
  { id: 'muscovy', name: 'Grand Duchy of Moscow / Tsardom of Russia', lat: 55.75, lon: 37.62, region: 'Europe', wiki: 'Tsardom_of_Russia', k: [[1283, 1, 15], [1500, 6, 18], [1600, 10, 19], [1720, 15, 20]],
    names: [[1283, 'Principality of Moscow'], [1389, 'Grand Duchy of Moscow'], [1547, 'Tsardom of Russia']] },
  // Japan's imperial capital: Asuka, then Fujiwara-kyō from 694 (Asuka period); Heijō-kyō (Nara) from 710, Nagaoka-kyō
  // from 784 (Nara period; the move of 740–745 falls between steps); Heian-kyō (Kyoto) from 794 to 1869 (Heian-kyō).
  { id: 'japan-pre', name: 'Japan', lat: 35.0, lon: 135.77, region: 'East Asia', wiki: 'History_of_Japan', k: [[600, 4, 13], [700, 5, 14], [1000, 6, 15], [1300, 7, 16], [1600, 15, 20], [1700, 30, 22], [1800, 30, 24], [1867, 33, 25]],
    capitals: [[600, 34.4713, 135.8207, 'Asuka'], [694, 34.5022, 135.8072, 'Fujiwara-kyō'], [710, 34.6911, 135.7947, 'Heijō-kyō'], [784, 34.9432, 135.7032, 'Nagaoka-kyō'],
      [794, 35.0, 135.77, 'Heian-kyō']] },
  // ---- Industrial and modern
  { id: 'britain', name: 'British Empire', lat: 51.5, lon: -0.13, region: 'Europe', wiki: 'British_Empire', k: [[1707, 9, 33], [1750, 15, 32], [1800, 60, 20], [1850, 250, 18], [1900, 400, 19], [1920, 450, 21], [1946, 520, 22], [1950, 120, 53], [1997, 60, 105]] },
  { id: 'russia-emp', name: 'Russian Empire', lat: 59.94, lon: 30.31, region: 'Europe', wiki: 'Russian_Empire', k: [[1721, 15, 20], [1800, 37, 22], [1850, 68, 22], [1900, 130, 25], [1917, 170, 27]] },
  { id: 'ussr', name: 'Soviet Union', lat: 55.75, lon: 37.62, region: 'Europe', wiki: 'Soviet_Union', k: [[1922, 135, 25], [1950, 180, 50], [1985, 278, 130], [1991, 290, 120]] },
  { id: 'russia', name: 'Russia', lat: 55.75, lon: 37.62, region: 'Europe', wiki: 'Russia', k: [[1992, 148, 115], [2000, 146, 117], [2025, 143, 142]] },
  { id: 'usa', name: 'United States', lat: 38.9, lon: -77.04, region: 'Americas', wiki: 'United_States', k: [[1776, 2.5, 45], [1800, 5.3, 60], [1850, 23, 70], [1900, 76, 100], [1950, 152, 150], [2000, 282, 240], [2025, 340, 193]] },
  { id: 'germany-emp', name: 'German Empire', lat: 52.52, lon: 13.4, region: 'Europe', wiki: 'German_Empire', k: [[1871, 41, 40], [1900, 56, 60], [1918, 65, 65]] },
  { id: 'germany-weimar', name: 'Germany (Weimar Republic and Nazi Germany)', lat: 52.52, lon: 13.4, region: 'Europe', wiki: 'Nazi_Germany', k: [[1919, 60, 65], [1939, 80, 75], [1945, 65, 60]] },
  { id: 'west-germany', name: 'West Germany', lat: 50.73, lon: 7.1, region: 'Europe', wiki: 'West_Germany', k: [[1949, 50, 70], [1957, 54, 85]] },
  { id: 'italy', name: 'Italy', lat: 41.9, lon: 12.5, region: 'Europe', wiki: 'Kingdom_of_Italy', k: [[1861, 26, 22], [1900, 33, 25], [1950, 47, 35], [1957, 49, 40]] },
  // European Economic Community 1958 to 1 November 1993, when the Maastricht Treaty made it part of the European Union.
  { id: 'eec', name: 'European Economic Community / European Union', lat: 50.85, lon: 4.35, region: 'Europe', wiki: 'European_Union', k: [[1958, 170, 85], [1990, 340, 140], [2000, 377, 108], [2025, 450, 86]],
    names: [[1958, 'European Economic Community'], [1993, 'European Union']] },
  { id: 'uk', name: 'United Kingdom', lat: 51.5, lon: -0.13, region: 'Europe', wiki: 'United_Kingdom', k: [[2020, 67, 70], [2025, 69, 69]] },
  { id: 'japan-emp', name: 'Empire of Japan', lat: 35.68, lon: 139.69, region: 'East Asia', wiki: 'Empire_of_Japan', k: [[1868, 34, 25], [1900, 44, 30], [1940, 105, 40], [1946, 78, 35]] },
  { id: 'japan', name: 'Japan', lat: 35.68, lon: 139.69, region: 'East Asia', wiki: 'Japan', k: [[1947, 80, 38], [1950, 84, 40], [2000, 127, 113], [2025, 123, 91]] },
  { id: 'roc', name: 'Republic of China', lat: 32.06, lon: 118.8, region: 'East Asia', wiki: 'Republic_of_China_(1912–1949)', k: [[1912, 430, 25], [1949, 540, 22]] },
  { id: 'prc', name: "People's Republic of China", lat: 39.9, lon: 116.4, region: 'East Asia', wiki: 'China', k: [[1949, 540, 20], [1950, 550, 20], [1980, 980, 25], [2000, 1270, 30], [2025, 1410, 86]] },
  { id: 'india', name: 'India', lat: 28.6, lon: 77.2, region: 'South Asia', wiki: 'India', k: [[1947, 345, 12], [1950, 360, 12], [2000, 1060, 14], [2025, 1450, 24]] },
];

// World population (millions) and the energy capture per person of everyone outside the listed polities
// (thousands of kcal/day): foragers, pastoralists, villages and smaller states early on; the rest of the
// world economy later.
export const WORLD = [
  [-2000, 27, 6], [-1500, 35, 6.5], [-1000, 50, 7], [-500, 100, 7.5], [-200, 150, 8], [1, 230, 8], [200, 255, 8.5],
  [400, 205, 8.5], [600, 210, 8.5], [800, 240, 9], [1000, 285, 9], [1200, 360, 9.5], [1300, 360, 9.5], [1400, 350, 9.5],
  [1500, 450, 10], [1600, 545, 10], [1700, 610, 10.5], [1800, 990, 11], [1850, 1260, 12], [1900, 1650, 14],
  [1950, 2525, 18], [2000, 6145, 33], [2025, 8200, 33],
];

export const STEPS = [...Array.from({ length: 39 }, (_, i) => -2000 + i * 100), 1850, 1900, 1950, 2000, 2025].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
