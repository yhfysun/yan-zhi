// 内置国家信息数据（用于首页地球地图点击国家查询）
// code: ISO 3166-1 alpha-2（用于国旗 emoji）
// code3: ISO 3166-1 alpha-3（用于匹配 GeoJSON feature.id）
export interface CountryInfo {
  code: string;
  code3: string;
  name: string;
  enName: string;
  capital: string;
  population: string;
  area: string;
  language: string;
  currency: string;
  continent: string;
  description: string;
}

export const COUNTRY_LIST: CountryInfo[] = [
  // ===== 亚洲 =====
  { code: 'CN', code3: 'CHN', name: '中国', enName: 'China', capital: '北京', population: '14.1亿', area: '960万km²', language: '汉语', currency: '人民币', continent: '亚洲', description: '世界人口第二大国，全球第二大经济体，拥有五千年文明历史。' },
  { code: 'JP', code3: 'JPN', name: '日本', enName: 'Japan', capital: '东京', population: '1.25亿', area: '37.8万km²', language: '日语', currency: '日元', continent: '亚洲', description: '岛国，世界第三大经济体，以科技和传统文化闻名。' },
  { code: 'KR', code3: 'KOR', name: '韩国', enName: 'South Korea', capital: '首尔', population: '5200万', area: '10万km²', language: '韩语', currency: '韩元', continent: '亚洲', description: '东亚发达国家，以半导体、电子产品和流行文化闻名。' },
  { code: 'IN', code3: 'IND', name: '印度', enName: 'India', capital: '新德里', population: '14.2亿', area: '328万km²', language: '印地语', currency: '卢比', continent: '亚洲', description: '世界人口第一大国，南亚次大陆主体国家，IT产业发达。' },
  { code: 'ID', code3: 'IDN', name: '印度尼西亚', enName: 'Indonesia', capital: '雅加达', population: '2.76亿', area: '191万km²', language: '印尼语', currency: '印尼盾', continent: '亚洲', description: '世界最大群岛国家，由17000多个岛屿组成。' },
  { code: 'TH', code3: 'THA', name: '泰国', enName: 'Thailand', capital: '曼谷', population: '7000万', area: '51.3万km²', language: '泰语', currency: '泰铢', continent: '亚洲', description: '东南亚国家，以佛教文化、热带海滩和美食闻名。' },
  { code: 'VN', code3: 'VNM', name: '越南', enName: 'Vietnam', capital: '河内', population: '9700万', area: '33万km²', language: '越南语', currency: '越南盾', continent: '亚洲', description: '东南亚国家，近年经济发展迅速，以咖啡和稻米闻名。' },
  { code: 'MY', code3: 'MYS', name: '马来西亚', enName: 'Malaysia', capital: '吉隆坡', population: '3300万', area: '33万km²', language: '马来语', currency: '林吉特', continent: '亚洲', description: '东南亚国家，多元文化，热带雨林资源丰富。' },
  { code: 'SG', code3: 'SGP', name: '新加坡', enName: 'Singapore', capital: '新加坡', population: '590万', area: '728km²', language: '英语/马来语/华语', currency: '新加坡元', continent: '亚洲', description: '城市国家，全球金融中心，以整洁和高效闻名。' },
  { code: 'PH', code3: 'PHL', name: '菲律宾', enName: 'Philippines', capital: '马尼拉', population: '1.15亿', area: '30万km²', language: '菲律宾语/英语', currency: '比索', continent: '亚洲', description: '群岛国家，由7600多个岛屿组成，以海滩和热带风光闻名。' },
  { code: 'PK', code3: 'PAK', name: '巴基斯坦', enName: 'Pakistan', capital: '伊斯兰堡', population: '2.3亿', area: '88万km²', language: '乌尔都语', currency: '卢比', continent: '亚洲', description: '南亚国家，世界第五人口大国，伊斯兰教为主。' },
  { code: 'BD', code3: 'BGD', name: '孟加拉国', enName: 'Bangladesh', capital: '达卡', population: '1.7亿', area: '14.8万km²', language: '孟加拉语', currency: '塔卡', continent: '亚洲', description: '南亚国家，人口密度极高，恒河三角洲所在地。' },
  { code: 'MM', code3: 'MMR', name: '缅甸', enName: 'Myanmar', capital: '内比都', population: '5400万', area: '67.7万km²', language: '缅甸语', currency: '缅元', continent: '亚洲', description: '东南亚国家，佛教文化浓厚，自然资源丰富。' },
  { code: 'KH', code3: 'KHM', name: '柬埔寨', enName: 'Cambodia', capital: '金边', population: '1700万', area: '18.1万km²', language: '高棉语', currency: '瑞尔', continent: '亚洲', description: '东南亚国家，吴哥窟古迹闻名世界。' },
  { code: 'LA', code3: 'LAO', name: '老挝', enName: 'Laos', capital: '万象', population: '750万', area: '23.7万km²', language: '老挝语', currency: '基普', continent: '亚洲', description: '东南亚唯一内陆国，佛教文化浓厚。' },
  { code: 'NP', code3: 'NPL', name: '尼泊尔', enName: 'Nepal', capital: '加德满都', population: '3000万', area: '14.7万km²', language: '尼泊尔语', currency: '卢比', continent: '亚洲', description: '喜马拉雅山国，珠穆朗玛峰所在地。' },
  { code: 'LK', code3: 'LKA', name: '斯里兰卡', enName: 'Sri Lanka', capital: '科伦坡', population: '2200万', area: '6.6万km²', language: '僧伽罗语', currency: '卢比', continent: '亚洲', description: '印度洋岛国，以茶叶、宝石和热带风光闻名。' },
  { code: 'MN', code3: 'MNG', name: '蒙古', enName: 'Mongolia', capital: '乌兰巴托', population: '340万', area: '156万km²', language: '蒙古语', currency: '图格里克', continent: '亚洲', description: '世界最大内陆国，地广人稀，草原游牧文化。' },
  { code: 'KZ', code3: 'KAZ', name: '哈萨克斯坦', enName: 'Kazakhstan', capital: '阿斯塔纳', population: '1900万', area: '272万km²', language: '哈萨克语', currency: '坚戈', continent: '亚洲', description: '中亚最大国家，石油和天然气资源丰富。' },
  { code: 'IR', code3: 'IRN', name: '伊朗', enName: 'Iran', capital: '德黑兰', population: '8800万', area: '165万km²', language: '波斯语', currency: '里亚尔', continent: '亚洲', description: '西亚国家，波斯文明发源地，石油资源丰富。' },
  { code: 'IQ', code3: 'IRQ', name: '伊拉克', enName: 'Iraq', capital: '巴格达', population: '4100万', area: '43.8万km²', language: '阿拉伯语', currency: '第纳尔', continent: '亚洲', description: '美索不达米亚文明发源地，两河流域。' },
  { code: 'IL', code3: 'ISR', name: '以色列', enName: 'Israel', capital: '耶路撒冷', population: '950万', area: '2.2万km²', language: '希伯来语', currency: '新谢克尔', continent: '亚洲', description: '中东国家，科技创新强国，犹太教基督教伊斯兰教圣地。' },
  { code: 'SA', code3: 'SAU', name: '沙特阿拉伯', enName: 'Saudi Arabia', capital: '利雅得', population: '3500万', area: '215万km²', language: '阿拉伯语', currency: '里亚尔', continent: '亚洲', description: '阿拉伯半岛最大国家，伊斯兰教发源地，世界最大石油出口国之一。' },
  { code: 'AE', code3: 'ARE', name: '阿联酋', enName: 'UAE', capital: '阿布扎比', population: '990万', area: '8.4万km²', language: '阿拉伯语', currency: '迪拉姆', continent: '亚洲', description: '中东联邦国家，迪拜为世界知名都市。' },
  { code: 'TR', code3: 'TUR', name: '土耳其', enName: 'Turkey', capital: '安卡拉', population: '8500万', area: '78万km²', language: '土耳其语', currency: '里拉', continent: '亚洲/欧洲', description: '横跨欧亚的国家，奥斯曼帝国继承者。' },
  { code: 'AF', code3: 'AFG', name: '阿富汗', enName: 'Afghanistan', capital: '喀布尔', population: '4000万', area: '65.2万km²', language: '普什图语/达里语', currency: '阿富汗尼', continent: '亚洲', description: '中亚内陆国，多山地，历史上丝绸之路要冲。' },
  // ===== 欧洲 =====
  { code: 'GB', code3: 'GBR', name: '英国', enName: 'United Kingdom', capital: '伦敦', population: '6700万', area: '24.3万km²', language: '英语', currency: '英镑', continent: '欧洲', description: '由英格兰、苏格兰、威尔士和北爱尔兰组成的联合王国。' },
  { code: 'FR', code3: 'FRA', name: '法国', enName: 'France', capital: '巴黎', population: '6800万', area: '64.1万km²', language: '法语', currency: '欧元', continent: '欧洲', description: '西欧国家，以艺术、时尚、美食和浪漫闻名。' },
  { code: 'DE', code3: 'DEU', name: '德国', enName: 'Germany', capital: '柏林', population: '8400万', area: '35.7万km²', language: '德语', currency: '欧元', continent: '欧洲', description: '欧洲最大经济体，以制造业和工程技术闻名。' },
  { code: 'IT', code3: 'ITA', name: '意大利', enName: 'Italy', capital: '罗马', population: '5900万', area: '30.1万km²', language: '意大利语', currency: '欧元', continent: '欧洲', description: '南欧国家，罗马帝国发源地，以艺术、美食和时尚闻名。' },
  { code: 'ES', code3: 'ESP', name: '西班牙', enName: 'Spain', capital: '马德里', population: '4700万', area: '50.6万km²', language: '西班牙语', currency: '欧元', continent: '欧洲', description: '伊比利亚半岛国家，以斗牛、弗拉门戈和阳光海滩闻名。' },
  { code: 'PT', code3: 'PRT', name: '葡萄牙', enName: 'Portugal', capital: '里斯本', population: '1030万', area: '9.2万km²', language: '葡萄牙语', currency: '欧元', continent: '欧洲', description: '伊比利亚半岛国家，大航海时代先驱。' },
  { code: 'NL', code3: 'NLD', name: '荷兰', enName: 'Netherlands', capital: '阿姆斯特丹', population: '1750万', area: '4.2万km²', language: '荷兰语', currency: '欧元', continent: '欧洲', description: '低地国家，以风车、郁金香和运河闻名。' },
  { code: 'BE', code3: 'BEL', name: '比利时', enName: 'Belgium', capital: '布鲁塞尔', population: '1160万', area: '3.1万km²', language: '荷兰语/法语/德语', currency: '欧元', continent: '欧洲', description: '西欧国家，欧盟总部所在地，以巧克力闻名。' },
  { code: 'CH', code3: 'CHE', name: '瑞士', enName: 'Switzerland', capital: '伯尔尼', population: '870万', area: '4.1万km²', language: '德/法/意语', currency: '瑞士法郎', continent: '欧洲', description: '中欧内陆国，以阿尔卑斯山、钟表、银行业闻名。' },
  { code: 'AT', code3: 'AUT', name: '奥地利', enName: 'Austria', capital: '维也纳', population: '900万', area: '8.4万km²', language: '德语', currency: '欧元', continent: '欧洲', description: '中欧国家，音乐之都维也纳，阿尔卑斯山风光。' },
  { code: 'SE', code3: 'SWE', name: '瑞典', enName: 'Sweden', capital: '斯德哥尔摩', population: '1040万', area: '45万km²', language: '瑞典语', currency: '瑞典克朗', continent: '欧洲', description: '北欧国家，以高福利、创新设计和诺贝尔奖闻名。' },
  { code: 'NO', code3: 'NOR', name: '挪威', enName: 'Norway', capital: '奥斯陆', population: '540万', area: '38.5万km²', language: '挪威语', currency: '挪威克朗', continent: '欧洲', description: '北欧国家，以峡湾、极光和石油闻名。' },
  { code: 'DK', code3: 'DNK', name: '丹麦', enName: 'Denmark', capital: '哥本哈根', population: '590万', area: '4.3万km²', language: '丹麦语', currency: '丹麦克朗', continent: '欧洲', description: '北欧国家，以童话、设计和风能闻名。' },
  { code: 'FI', code3: 'FIN', name: '芬兰', enName: 'Finland', capital: '赫尔辛基', population: '550万', area: '33.8万km²', language: '芬兰语', currency: '欧元', continent: '欧洲', description: '北欧国家，以极光、桑拿和诺基亚闻名。' },
  { code: 'PL', code3: 'POL', name: '波兰', enName: 'Poland', capital: '华沙', population: '3800万', area: '31.3万km²', language: '波兰语', currency: '兹罗提', continent: '欧洲', description: '中欧国家，肖邦故乡，近年经济发展迅速。' },
  { code: 'CZ', code3: 'CZE', name: '捷克', enName: 'Czech Republic', capital: '布拉格', population: '1070万', area: '7.9万km²', language: '捷克语', currency: '捷克克朗', continent: '欧洲', description: '中欧国家，布拉格古城闻名世界。' },
  { code: 'HU', code3: 'HUN', name: '匈牙利', enName: 'Hungary', capital: '布达佩斯', population: '970万', area: '9.3万km²', language: '匈牙利语', currency: '福林', continent: '欧洲', description: '中欧内陆国，多瑙河贯穿首都。' },
  { code: 'GR', code3: 'GRC', name: '希腊', enName: 'Greece', capital: '雅典', population: '1070万', area: '13.2万km²', language: '希腊语', currency: '欧元', continent: '欧洲', description: '南欧国家，西方文明发源地，爱琴海风光。' },
  { code: 'RO', code3: 'ROU', name: '罗马尼亚', enName: 'Romania', capital: '布加勒斯特', population: '1900万', area: '23.8万km²', language: '罗马尼亚语', currency: '列伊', continent: '欧洲', description: '东欧国家，喀尔巴阡山脉横贯。' },
  { code: 'BG', code3: 'BGR', name: '保加利亚', enName: 'Bulgaria', capital: '索菲亚', population: '690万', area: '11.1万km²', language: '保加利亚语', currency: '列弗', continent: '欧洲', description: '东欧国家，黑海沿岸，玫瑰油产量世界第一。' },
  { code: 'HR', code3: 'HRV', name: '克罗地亚', enName: 'Croatia', capital: '萨格勒布', population: '390万', area: '5.7万km²', language: '克罗地亚语', currency: '欧元', continent: '欧洲', description: '南欧国家，亚得里亚海沿岸风光秀丽。' },
  { code: 'UA', code3: 'UKR', name: '乌克兰', enName: 'Ukraine', capital: '基辅', population: '4100万', area: '60.4万km²', language: '乌克兰语', currency: '格里夫纳', continent: '欧洲', description: '东欧国家，欧洲面积第二大国，黑土地带肥沃。' },
  { code: 'RU', code3: 'RUS', name: '俄罗斯', enName: 'Russia', capital: '莫斯科', population: '1.44亿', area: '1707万km²', language: '俄语', currency: '卢布', continent: '欧洲/亚洲', description: '世界面积最大的国家，横跨欧亚大陆。' },
  { code: 'IE', code3: 'IRL', name: '爱尔兰', enName: 'Ireland', capital: '都柏林', population: '500万', area: '7万km²', language: '英语/爱尔兰语', currency: '欧元', continent: '欧洲', description: '西欧岛国，以绿色草原和文学传统闻名。' },
  { code: 'IS', code3: 'ISL', name: '冰岛', enName: 'Iceland', capital: '雷克雅未克', population: '37万', area: '10.3万km²', language: '冰岛语', currency: '冰岛克朗', continent: '欧洲', description: '北大西洋岛国，以火山、冰川和极光闻名。' },
  { code: 'RS', code3: 'SRB', name: '塞尔维亚', enName: 'Serbia', capital: '贝尔格莱德', population: '690万', area: '8.8万km²', language: '塞尔维亚语', currency: '第纳尔', continent: '欧洲', description: '东南欧内陆国，前南斯拉夫核心成员。' },
  { code: 'SK', code3: 'SVK', name: '斯洛伐克', enName: 'Slovakia', capital: '布拉迪斯拉发', population: '540万', area: '4.9万km²', language: '斯洛伐克语', currency: '欧元', continent: '欧洲', description: '中欧内陆国，喀尔巴阡山脉风光。' },
  { code: 'SI', code3: 'SVN', name: '斯洛文尼亚', enName: 'Slovenia', capital: '卢布尔雅那', population: '210万', area: '2万km²', language: '斯洛文尼亚语', currency: '欧元', continent: '欧洲', description: '中欧国家，阿尔卑斯山和亚得里亚海兼具。' },
  { code: 'LT', code3: 'LTU', name: '立陶宛', enName: 'Lithuania', capital: '维尔纽斯', population: '280万', area: '6.5万km²', language: '立陶宛语', currency: '欧元', continent: '欧洲', description: '波罗的海国家，前苏联加盟共和国。' },
  { code: 'LV', code3: 'LVA', name: '拉脱维亚', enName: 'Latvia', capital: '里加', population: '190万', area: '6.5万km²', language: '拉脱维亚语', currency: '欧元', continent: '欧洲', description: '波罗的海国家，里加古城闻名。' },
  { code: 'EE', code3: 'EST', name: '爱沙尼亚', enName: 'Estonia', capital: '塔林', population: '130万', area: '4.5万km²', language: '爱沙尼亚语', currency: '欧元', continent: '欧洲', description: '波罗的海国家，数字化程度世界领先。' },
  { code: 'BY', code3: 'BLR', name: '白俄罗斯', enName: 'Belarus', capital: '明斯克', population: '940万', area: '20.8万km²', language: '白俄罗斯语/俄语', currency: '卢布', continent: '欧洲', description: '东欧内陆国，前苏联加盟共和国。' },
  { code: 'AL', code3: 'ALB', name: '阿尔巴尼亚', enName: 'Albania', capital: '地拉那', population: '280万', area: '2.9万km²', language: '阿尔巴尼亚语', currency: '列克', continent: '欧洲', description: '东南欧国家，亚得里亚海沿岸。' },
  // ===== 非洲 =====
  { code: 'EG', code3: 'EGY', name: '埃及', enName: 'Egypt', capital: '开罗', population: '1.04亿', area: '100万km²', language: '阿拉伯语', currency: '埃及镑', continent: '非洲', description: '北非国家，古埃及文明发源地，以金字塔和尼罗河闻名。' },
  { code: 'ZA', code3: 'ZAF', name: '南非', enName: 'South Africa', capital: '比勒陀利亚', population: '6000万', area: '122万km²', language: '英语等11种', currency: '兰特', continent: '非洲', description: '非洲南端国家，矿产资源丰富，被称为"彩虹之国"。' },
  { code: 'NG', code3: 'NGA', name: '尼日利亚', enName: 'Nigeria', capital: '阿布贾', population: '2.2亿', area: '92.4万km²', language: '英语', currency: '奈拉', continent: '非洲', description: '非洲人口第一大国，石油资源丰富。' },
  { code: 'KE', code3: 'KEN', name: '肯尼亚', enName: 'Kenya', capital: '内罗毕', population: '5400万', area: '58万km²', language: '斯瓦希里语/英语', currency: '先令', continent: '非洲', description: '东非国家，以野生动物保护区闻名。' },
  { code: 'MA', code3: 'MAR', name: '摩洛哥', enName: 'Morocco', capital: '拉巴特', population: '3700万', area: '44.7万km²', language: '阿拉伯语', currency: '迪拉姆', continent: '非洲', description: '北非国家，以马拉喀什古城和撒哈拉沙漠闻名。' },
  { code: 'DZ', code3: 'DZA', name: '阿尔及利亚', enName: 'Algeria', capital: '阿尔及尔', population: '4500万', area: '238万km²', language: '阿拉伯语', currency: '第纳尔', continent: '非洲', description: '北非国家，非洲面积第一大国。' },
  { code: 'TN', code3: 'TUN', name: '突尼斯', enName: 'Tunisia', capital: '突尼斯', population: '1200万', area: '16.4万km²', language: '阿拉伯语', currency: '第纳尔', continent: '非洲', description: '北非国家，迦太基文明发源地。' },
  { code: 'GH', code3: 'GHA', name: '加纳', enName: 'Ghana', capital: '阿克拉', population: '3400万', area: '23.9万km²', language: '英语', currency: '塞地', continent: '非洲', description: '西非国家，黄金和可可产量丰富。' },
  { code: 'ET', code3: 'ETH', name: '埃塞俄比亚', enName: 'Ethiopia', capital: '亚的斯亚贝巴', population: '1.2亿', area: '110万km²', language: '阿姆哈拉语', currency: '比尔', continent: '非洲', description: '东非内陆国，人类发源地之一，咖啡起源地。' },
  { code: 'TZ', code3: 'TZA', name: '坦桑尼亚', enName: 'Tanzania', capital: '多多马', population: '6300万', area: '94.5万km²', language: '斯瓦希里语', currency: '先令', continent: '非洲', description: '东非国家，乞力马扎罗山和塞伦盖蒂草原闻名。' },
  { code: 'SD', code3: 'SDN', name: '苏丹', enName: 'Sudan', capital: '喀土穆', population: '4600万', area: '186万km²', language: '阿拉伯语', currency: '镑', continent: '非洲', description: '东北非国家，尼罗河贯穿南北。' },
  { code: 'AO', code3: 'AGO', name: '安哥拉', enName: 'Angola', capital: '罗安达', population: '3500万', area: '125万km²', language: '葡萄牙语', currency: '宽扎', continent: '非洲', description: '西南非国家，石油和钻石资源丰富。' },
  { code: 'CM', code3: 'CMR', name: '喀麦隆', enName: 'Cameroon', capital: '雅温得', population: '2700万', area: '47.6万km²', language: '法语/英语', currency: '中非法郎', continent: '非洲', description: '中西非国家，被称为"非洲缩影"。' },
  { code: 'CI', code3: 'CIV', name: '科特迪瓦', enName: 'Ivory Coast', capital: '亚穆苏克罗', population: '2800万', area: '32.2万km²', language: '法语', currency: '西非法郎', continent: '非洲', description: '西非国家，世界最大可可生产国。' },
  { code: 'SN', code3: 'SEN', name: '塞内加尔', enName: 'Senegal', capital: '达喀尔', population: '1700万', area: '19.7万km²', language: '法语', currency: '西非法郎', continent: '非洲', description: '西非国家，以音乐和足球闻名。' },
  { code: 'UG', code3: 'UGA', name: '乌干达', enName: 'Uganda', capital: '坎帕拉', population: '4700万', area: '24.1万km²', language: '英语/斯瓦希里语', currency: '先令', continent: '非洲', description: '东非内陆国，尼罗河源头所在地。' },
  { code: 'ZW', code3: 'ZWE', name: '津巴布韦', enName: 'Zimbabwe', capital: '哈拉雷', population: '1500万', area: '39万km²', language: '英语', currency: '元', continent: '非洲', description: '南部非洲国家，维多利亚瀑布闻名。' },
  { code: 'NM', code3: 'NAM', name: '纳米比亚', enName: 'Namibia', capital: '温得和克', population: '260万', area: '82.5万km²', language: '英语', currency: '元', continent: '非洲', description: '西南非国家，纳米布沙漠和大西洋沿岸风光。' },
  { code: 'LY', code3: 'LBY', name: '利比亚', enName: 'Libya', capital: '的黎波里', population: '700万', area: '176万km²', language: '阿拉伯语', currency: '第纳尔', continent: '非洲', description: '北非国家，石油资源丰富，撒哈拉沙漠覆盖大部分国土。' },
  // ===== 北美洲 =====
  { code: 'US', code3: 'USA', name: '美国', enName: 'United States', capital: '华盛顿', population: '3.3亿', area: '983万km²', language: '英语', currency: '美元', continent: '北美洲', description: '世界第一大经济体，科技和军事强国。' },
  { code: 'CA', code3: 'CAN', name: '加拿大', enName: 'Canada', capital: '渥太华', population: '3900万', area: '998万km²', language: '英语/法语', currency: '加元', continent: '北美洲', description: '世界第二大国（按面积），以多元文化和自然风光闻名。' },
  { code: 'MX', code3: 'MEX', name: '墨西哥', enName: 'Mexico', capital: '墨西哥城', population: '1.28亿', area: '196万km²', language: '西班牙语', currency: '比索', continent: '北美洲', description: '北美洲国家，玛雅和阿兹特克文明发源地。' },
  { code: 'CU', code3: 'CUB', name: '古巴', enName: 'Cuba', capital: '哈瓦那', population: '1130万', area: '11万km²', language: '西班牙语', currency: '比索', continent: '北美洲', description: '加勒比海岛国，以雪茄和萨尔萨音乐闻名。' },
  { code: 'GT', code3: 'GTM', name: '危地马拉', enName: 'Guatemala', capital: '危地马拉城', population: '1800万', area: '10.9万km²', language: '西班牙语', currency: '格查尔', continent: '北美洲', description: '中美洲国家，玛雅文明遗址遍布。' },
  { code: 'PA', code3: 'PAN', name: '巴拿马', enName: 'Panama', capital: '巴拿马城', population: '440万', area: '7.5万km²', language: '西班牙语', currency: '巴波亚', continent: '北美洲', description: '中美洲国家，巴拿马运河连接太平洋和大西洋。' },
  { code: 'CR', code3: 'CRI', name: '哥斯达黎加', enName: 'Costa Rica', capital: '圣何塞', population: '520万', area: '5.1万km²', language: '西班牙语', currency: '科朗', continent: '北美洲', description: '中美洲国家，无军队，生物多样性丰富。' },
  { code: 'DO', code3: 'DOM', name: '多米尼加共和国', enName: 'Dominican Republic', capital: '圣多明各', population: '1100万', area: '4.9万km²', language: '西班牙语', currency: '比索', continent: '北美洲', description: '加勒比海岛国，与海地共占伊斯帕尼奥拉岛。' },
  { code: 'JM', code3: 'JAM', name: '牙买加', enName: 'Jamaica', capital: '金斯敦', population: '300万', area: '1.1万km²', language: '英语', currency: '元', continent: '北美洲', description: '加勒比海岛国，雷鬼音乐和短跑闻名。' },
  // ===== 南美洲 =====
  { code: 'BR', code3: 'BRA', name: '巴西', enName: 'Brazil', capital: '巴西利亚', population: '2.15亿', area: '851万km²', language: '葡萄牙语', currency: '雷亚尔', continent: '南美洲', description: '南美洲最大国家，亚马逊雨林大部分位于其境内。' },
  { code: 'AR', code3: 'ARG', name: '阿根廷', enName: 'Argentina', capital: '布宜诺斯艾利斯', population: '4600万', area: '278万km²', language: '西班牙语', currency: '比索', continent: '南美洲', description: '南美洲第二大国，以探戈、潘帕斯草原和足球闻名。' },
  { code: 'CL', code3: 'CHL', name: '智利', enName: 'Chile', capital: '圣地亚哥', population: '1900万', area: '75.6万km²', language: '西班牙语', currency: '比索', continent: '南美洲', description: '南美洲国家，地形狭长，铜矿资源丰富。' },
  { code: 'CO', code3: 'COL', name: '哥伦比亚', enName: 'Colombia', capital: '波哥大', population: '5200万', area: '114万km²', language: '西班牙语', currency: '比索', continent: '南美洲', description: '南美洲国家，咖啡产量世界闻名。' },
  { code: 'PE', code3: 'PER', name: '秘鲁', enName: 'Peru', capital: '利马', population: '3400万', area: '128万km²', language: '西班牙语', currency: '索尔', continent: '南美洲', description: '南美洲国家，马丘比丘印加文明遗址闻名。' },
  { code: 'VE', code3: 'VEN', name: '委内瑞拉', enName: 'Venezuela', capital: '加拉加斯', population: '2800万', area: '91.6万km²', language: '西班牙语', currency: '玻利瓦尔', continent: '南美洲', description: '南美洲国家，石油储量世界第一。' },
  { code: 'UY', code3: 'URY', name: '乌拉圭', enName: 'Uruguay', capital: '蒙得维的亚', population: '350万', area: '17.6万km²', language: '西班牙语', currency: '比索', continent: '南美洲', description: '南美洲国家，社会福利制度完善。' },
  { code: 'PY', code3: 'PRY', name: '巴拉圭', enName: 'Paraguay', capital: '亚松森', population: '720万', area: '40.7万km²', language: '西班牙语/瓜拉尼语', currency: '瓜拉尼', continent: '南美洲', description: '南美洲内陆国，瓜拉尼语为官方语言之一。' },
  { code: 'BO', code3: 'BOL', name: '玻利维亚', enName: 'Bolivia', capital: '拉巴斯', population: '1200万', area: '110万km²', language: '西班牙语', currency: '玻利维亚诺', continent: '南美洲', description: '南美洲内陆国，乌尤尼盐沼天空之镜闻名。' },
  { code: 'EC', code3: 'ECU', name: '厄瓜多尔', enName: 'Ecuador', capital: '基多', population: '1800万', area: '28.4万km²', language: '西班牙语', currency: '美元', continent: '南美洲', description: '南美洲国家，赤道横穿，加拉帕戈斯群岛闻名。' },
  // ===== 大洋洲 =====
  { code: 'AU', code3: 'AUS', name: '澳大利亚', enName: 'Australia', capital: '堪培拉', population: '2600万', area: '769万km²', language: '英语', currency: '澳元', continent: '大洋洲', description: '南半球发达国家，独占一个大陆。' },
  { code: 'NZ', code3: 'NZL', name: '新西兰', enName: 'New Zealand', capital: '惠灵顿', population: '510万', area: '26.8万km²', language: '英语/毛利语', currency: '新西兰元', continent: '大洋洲', description: '南太平洋岛国，以自然风光和毛利文化闻名。' },
  { code: 'PG', code3: 'PNG', name: '巴布亚新几内亚', enName: 'Papua New Guinea', capital: '莫尔兹比港', population: '900万', area: '46.3万km²', language: '英语', currency: '基那', continent: '大洋洲', description: '大洋洲国家，文化多样性极高。' },
  { code: 'FJ', code3: 'FJI', name: '斐济', enName: 'Fiji', capital: '苏瓦', population: '93万', area: '1.8万km²', language: '英语/斐济语', currency: '元', continent: '大洋洲', description: '南太平洋岛国，以珊瑚礁和热带海滩闻名。' },
];

/** 按国家代码（alpha-2 或 alpha-3）或名称查找 */
export function findCountry(query: string): CountryInfo | undefined {
  const q = query.trim().toLowerCase();
  return COUNTRY_LIST.find(
    (c) =>
      c.code.toLowerCase() === q ||
      c.code3.toLowerCase() === q ||
      c.name === query ||
      c.enName.toLowerCase() === q,
  );
}

/** 按 GeoJSON feature.id（alpha-3 代码）查找 */
export function findCountryByGeoId(geoId: string): CountryInfo | undefined {
  const q = geoId.toUpperCase();
  return COUNTRY_LIST.find((c) => c.code3 === q || c.code === q);
}
