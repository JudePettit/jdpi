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
//  - From 1900, per-person values follow primary-energy statistics (Energy Institute / Our World in Data)
//    plus food and traditional biomass, converted at 1 GJ/year ≈ 655 kcal/day.
export const POLITIES = [
  // ---- Bronze Age
  { id: 'egypt-mk', name: 'Egypt (Middle & New Kingdoms)', lat: 25.7, lon: 32.6, region: 'Near East', wiki: 'New_Kingdom_of_Egypt', k: [[-2000, 2, 12], [-1500, 2.5, 13], [-1200, 3, 13.5], [-1070, 3, 13]] },
  { id: 'babylonia', name: 'Babylonia and Mesopotamian states', lat: 32.5, lon: 44.4, region: 'Near East', wiki: 'Babylonia', k: [[-2000, 1.5, 12], [-1500, 1.2, 12], [-1000, 1, 12], [-912, 1, 12]] },
  { id: 'indus', name: 'Indus civilisation (late)', lat: 27.3, lon: 68.1, region: 'South Asia', wiki: 'Indus_Valley_Civilisation', k: [[-2000, 4, 9], [-1800, 3, 8]] },
  { id: 'shang', name: 'Erlitou and Shang China', lat: 36.1, lon: 114.3, region: 'East Asia', wiki: 'Shang_dynasty', k: [[-2000, 1.5, 8], [-1600, 3, 9], [-1100, 5, 10], [-1046, 5, 10]] },
  { id: 'hittite', name: 'Hittite Empire', lat: 40.0, lon: 34.6, region: 'Near East', wiki: 'Hittites', k: [[-1650, 1, 11], [-1300, 1.5, 12], [-1180, 1.2, 12]] },
  // ---- Iron Age and classical
  { id: 'zhou', name: 'Zhou and the Warring States (China)', lat: 34.6, lon: 112.4, region: 'East Asia', wiki: 'Zhou_dynasty', k: [[-1046, 6, 10], [-771, 8, 11], [-500, 20, 14], [-300, 30, 17], [-221, 35, 19]] },
  { id: 'egypt-late', name: 'Egypt (Third Intermediate & Late Periods)', lat: 29.85, lon: 31.25, region: 'Near East', wiki: 'Late_Period_of_ancient_Egypt', k: [[-1069, 3, 12.5], [-525, 4, 14]] },
  { id: 'assyria', name: 'Neo-Assyrian Empire', lat: 36.4, lon: 43.15, region: 'Near East', wiki: 'Neo-Assyrian_Empire', k: [[-911, 4, 13], [-700, 10, 15], [-609, 8, 15]] },
  { id: 'neo-babylon', name: 'Neo-Babylonian Empire', lat: 32.5, lon: 44.4, region: 'Near East', wiki: 'Neo-Babylonian_Empire', k: [[-626, 5, 15], [-539, 6, 15]] },
  { id: 'india-early', name: 'North Indian kingdoms (combined)', lat: 25.6, lon: 85.1, region: 'South Asia', wiki: 'Mahajanapadas', k: [[-1500, 8, 8], [-1000, 15, 9], [-500, 30, 10], [-323, 40, 11]] },
  { id: 'achaemenid', name: 'Achaemenid Persian Empire', lat: 29.9, lon: 52.9, region: 'Near East', wiki: 'Achaemenid_Empire', k: [[-550, 15, 16], [-500, 25, 17], [-330, 25, 17]] },
  { id: 'greece', name: 'Greek city-states', lat: 37.98, lon: 23.73, region: 'Europe', wiki: 'Polis', k: [[-750, 1.5, 14], [-500, 3, 17], [-300, 3.5, 18], [-146, 3, 18]] },
  { id: 'seleucid', name: 'Seleucid Empire', lat: 33.1, lon: 44.5, region: 'Near East', wiki: 'Seleucid_Empire', k: [[-312, 25, 17], [-200, 15, 17], [-100, 5, 16], [-63, 3, 16]] },
  { id: 'ptolemaic', name: 'Ptolemaic Egypt', lat: 31.2, lon: 29.9, region: 'Near East', wiki: 'Ptolemaic_Kingdom', k: [[-305, 4, 18], [-100, 5, 18], [-30, 5, 18]] },
  { id: 'maurya', name: 'Maurya Empire', lat: 25.6, lon: 85.1, region: 'South Asia', wiki: 'Maurya_Empire', k: [[-322, 40, 12], [-250, 45, 12], [-185, 45, 12]] },
  { id: 'india-mid', name: 'Indian kingdoms (combined)', lat: 25.3, lon: 82.9, region: 'South Asia', wiki: 'Middle_kingdoms_of_India', k: [[-184, 45, 12], [1, 50, 12], [319, 55, 12]] },
  { id: 'gupta', name: 'Gupta Empire', lat: 25.6, lon: 85.1, region: 'South Asia', wiki: 'Gupta_Empire', k: [[320, 55, 13], [550, 55, 13]] },
  { id: 'india-late', name: 'Indian kingdoms (combined)', lat: 22.7, lon: 75.9, region: 'South Asia', wiki: 'Middle_kingdoms_of_India', k: [[551, 55, 13], [1000, 75, 13], [1205, 80, 13]] },
  { id: 'parthia', name: 'Parthian Empire', lat: 33.09, lon: 44.58, region: 'Near East', wiki: 'Parthian_Empire', k: [[-247, 4, 17], [-200, 7, 18], [1, 10, 20], [223, 10, 21]] },
  { id: 'rome-rep', name: 'Roman Republic', lat: 41.9, lon: 12.5, region: 'Europe', wiki: 'Roman_Republic', k: [[-509, 1, 15], [-300, 4, 18], [-200, 10, 22], [-100, 25, 27], [-28, 50, 30]] },
  { id: 'rome', name: 'Roman Empire', lat: 41.9, lon: 12.5, region: 'Europe', wiki: 'Roman_Empire', k: [[-27, 50, 30], [1, 55, 31], [150, 65, 31], [250, 55, 29], [394, 50, 27]] },
  { id: 'rome-west', name: 'Western Roman Empire', lat: 44.4, lon: 12.2, region: 'Europe', wiki: 'Western_Roman_Empire', k: [[395, 22, 26], [476, 15, 24]] },
  { id: 'byzantium', name: 'Eastern Roman (Byzantine) Empire', lat: 41.0, lon: 28.98, region: 'Europe', wiki: 'Byzantine_Empire', k: [[395, 25, 26], [550, 30, 25], [700, 12, 22], [800, 12, 22], [1025, 18, 24], [1200, 10, 22], [1350, 3, 20], [1453, 1, 20]] },
  { id: 'qin', name: 'Qin dynasty', lat: 34.3, lon: 108.9, region: 'East Asia', wiki: 'Qin_dynasty', k: [[-221, 35, 20], [-207, 30, 20]] },
  { id: 'han', name: 'Han dynasty', lat: 34.3, lon: 108.9, region: 'East Asia', wiki: 'Han_dynasty', k: [[-206, 30, 22], [2, 58, 27], [140, 50, 27], [220, 30, 24]] },
  { id: 'china-divided', name: 'Divided China (Three Kingdoms to Southern & Northern dynasties)', lat: 32.06, lon: 118.8, region: 'East Asia', wiki: 'Six_Dynasties', k: [[221, 30, 23], [400, 35, 22], [588, 40, 23]] },
  { id: 'sasanian', name: 'Sasanian Empire', lat: 33.09, lon: 44.58, region: 'Near East', wiki: 'Sasanian_Empire', k: [[224, 10, 22], [500, 15, 23], [620, 18, 23], [651, 5, 22]] },
  // ---- Medieval
  { id: 'sui', name: 'Sui dynasty', lat: 34.3, lon: 108.9, region: 'East Asia', wiki: 'Sui_dynasty', k: [[589, 46, 24], [618, 40, 24]] },
  { id: 'tang', name: 'Tang dynasty', lat: 34.3, lon: 108.9, region: 'East Asia', wiki: 'Tang_dynasty', k: [[618, 40, 24], [750, 75, 27], [907, 50, 25]] },
  { id: 'five-dyn', name: 'Five Dynasties and Ten Kingdoms', lat: 34.8, lon: 114.3, region: 'East Asia', wiki: 'Five_Dynasties_and_Ten_Kingdoms_period', k: [[908, 50, 25], [959, 55, 26]] },
  { id: 'song', name: 'Song dynasty', lat: 34.8, lon: 114.3, region: 'East Asia', wiki: 'Song_dynasty', k: [[960, 55, 27], [1100, 110, 29], [1127, 100, 29], [1150, 65, 29], [1200, 70, 29], [1279, 60, 28]] },
  { id: 'jin', name: 'Jin dynasty (Jurchen)', lat: 39.9, lon: 116.4, region: 'East Asia', wiki: 'Jin_dynasty_(1115–1234)', k: [[1127, 35, 25], [1200, 45, 26], [1234, 30, 25]] },
  { id: 'rashidun-umayyad', name: 'Rashidun and Umayyad Caliphates', lat: 33.5, lon: 36.3, region: 'Near East', wiki: 'Umayyad_Caliphate', k: [[632, 5, 22], [661, 25, 24], [700, 30, 24], [750, 33, 24]] },
  { id: 'abbasid', name: 'Abbasid Caliphate', lat: 33.3, lon: 44.4, region: 'Near East', wiki: 'Abbasid_Caliphate', k: [[751, 33, 25], [850, 30, 25], [950, 15, 24], [1100, 8, 23], [1258, 4, 22]] },
  { id: 'cordoba', name: 'Emirate and Caliphate of Córdoba', lat: 37.88, lon: -4.78, region: 'Europe', wiki: 'Caliphate_of_Córdoba', k: [[756, 4, 22], [1000, 7, 25], [1031, 6, 24]] },
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
  { id: 'india-other', name: 'Other Indian states (Vijayanagara, Bahmani and others)', lat: 15.33, lon: 76.46, region: 'South Asia', wiki: 'Vijayanagara_Empire', k: [[1206, 40, 13], [1330, 35, 13], [1400, 60, 13], [1526, 75, 13], [1600, 30, 13], [1700, 15, 13]] },
  { id: 'khmer', name: 'Khmer Empire', lat: 13.41, lon: 103.87, region: 'Southeast Asia', wiki: 'Khmer_Empire', k: [[802, 2, 13], [1100, 3, 14], [1200, 4, 14], [1431, 2, 13]] },
  { id: 'maya', name: 'Classic Maya city-states (combined)', lat: 17.22, lon: -89.62, region: 'Americas', wiki: 'Classic_Maya_collapse', k: [[250, 2, 8], [600, 3, 8], [900, 1, 8]] },
  { id: 'mali', name: 'Mali Empire', lat: 11.37, lon: -8.38, region: 'Africa', wiki: 'Mali_Empire', k: [[1235, 5, 10], [1350, 10, 10], [1450, 8, 10], [1600, 3, 10]] },
  { id: 'timurid', name: 'Timurid Empire', lat: 39.65, lon: 66.96, region: 'Central Asia', wiki: 'Timurid_Empire', k: [[1370, 10, 19], [1405, 15, 20], [1507, 6, 19]] },
  // ---- Early modern
  { id: 'ming', name: 'Ming dynasty', lat: 39.9, lon: 116.4, region: 'East Asia', wiki: 'Ming_dynasty', k: [[1368, 65, 27], [1400, 80, 28], [1500, 110, 28], [1600, 160, 29], [1644, 140, 28]] },
  { id: 'qing', name: 'Qing dynasty', lat: 39.9, lon: 116.4, region: 'East Asia', wiki: 'Qing_dynasty', k: [[1644, 140, 28], [1700, 160, 29], [1800, 320, 30], [1850, 410, 29], [1900, 400, 26], [1911, 410, 25]] },
  { id: 'ottoman', name: 'Ottoman Empire', lat: 41.0, lon: 28.98, region: 'Near East', wiki: 'Ottoman_Empire', k: [[1299, 0.5, 20], [1453, 8, 22], [1550, 25, 24], [1600, 30, 24], [1700, 28, 24], [1800, 25, 24], [1850, 35, 25], [1900, 25, 28], [1922, 15, 28]] },
  { id: 'safavid', name: 'Safavid Iran', lat: 32.65, lon: 51.67, region: 'Near East', wiki: 'Safavid_Iran', k: [[1501, 6, 21], [1600, 9, 22], [1700, 10, 22], [1736, 8, 22]] },
  { id: 'mughal', name: 'Mughal Empire', lat: 28.6, lon: 77.2, region: 'South Asia', wiki: 'Mughal_Empire', k: [[1526, 60, 13], [1600, 115, 14], [1700, 150, 14], [1750, 100, 14], [1800, 20, 13], [1857, 5, 13]] },
  { id: 'maratha', name: 'Maratha Confederacy and Indian states', lat: 18.52, lon: 73.86, region: 'South Asia', wiki: 'Maratha_Confederacy', k: [[1720, 30, 13], [1760, 80, 13], [1800, 120, 13], [1818, 100, 13], [1850, 50, 13], [1857, 40, 13]] },
  { id: 'spain', name: 'Spanish Empire', lat: 40.4, lon: -3.7, region: 'Europe', wiki: 'Spanish_Empire', k: [[1492, 7, 22], [1600, 20, 22], [1700, 18, 22], [1800, 30, 21], [1850, 20, 22], [1898, 20, 25]] },
  { id: 'dutch', name: 'Dutch Republic', lat: 52.37, lon: 4.9, region: 'Europe', wiki: 'Dutch_Republic', k: [[1581, 1.5, 32], [1650, 1.9, 40], [1795, 2, 38]] },
  { id: 'aztec', name: 'Aztec Empire', lat: 19.43, lon: -99.13, region: 'Americas', wiki: 'Aztec_Empire', k: [[1428, 3, 9], [1500, 6, 9], [1521, 6, 9]] },
  { id: 'inca', name: 'Inca Empire', lat: -13.53, lon: -71.97, region: 'Americas', wiki: 'Inca_Empire', k: [[1438, 4, 9], [1500, 10, 9], [1533, 9, 9]] },
  { id: 'songhai', name: 'Songhai Empire', lat: 16.27, lon: 0.05, region: 'Africa', wiki: 'Songhai_Empire', k: [[1464, 3, 10], [1500, 5, 10], [1591, 4, 10]] },
  { id: 'muscovy', name: 'Grand Duchy of Moscow / Tsardom of Russia', lat: 55.75, lon: 37.62, region: 'Europe', wiki: 'Tsardom_of_Russia', k: [[1283, 1, 15], [1500, 6, 18], [1600, 10, 19], [1720, 15, 20]] },
  { id: 'japan-pre', name: 'Japan', lat: 35.0, lon: 135.77, region: 'East Asia', wiki: 'History_of_Japan', k: [[600, 4, 13], [700, 5, 14], [1000, 6, 15], [1300, 7, 16], [1600, 15, 20], [1700, 30, 22], [1800, 30, 24], [1867, 33, 25]] },
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
  { id: 'eec', name: 'European Economic Community / European Union', lat: 50.85, lon: 4.35, region: 'Europe', wiki: 'European_Union', k: [[1958, 170, 85], [1990, 340, 140], [2000, 377, 108], [2025, 450, 86]] },
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
